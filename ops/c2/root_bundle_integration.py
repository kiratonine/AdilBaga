"""Mandatory isolated root→UID1999 Linux proof; no production authority/network."""
import hashlib
import importlib.util
import json
import os
import pathlib
import pwd
import stat
import time
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('promotion', pathlib.Path(__file__).with_name('publisher-promotion.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


def git(cwd, *args):
    return m.command(['/usr/bin/git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                      '-c', 'core.hooksPath=/dev/null', '-C', str(cwd), *args]).decode()


class RootBundleTests(unittest.TestCase):
    def setUp(self):
        self.assertEqual(os.geteuid(), 0, 'mandatory root sandbox missing; never skip')
        self.actor = pwd.getpwnam('aktau-sync'); self.assertEqual(self.actor.pw_uid, 1999)
        self.temp = tempfile.TemporaryDirectory(prefix='bundle-root-'); self.addCleanup(self.temp.cleanup)
        self.base = pathlib.Path(self.temp.name); self.base.chmod(0o755)
        self.fsroot = self.base/'rootfs'; self.fsroot.mkdir(mode=0o700); self.fs = m.Filesystem(self.fsroot)
        self.directory = m.BASE+'/releases/root-proof'
        self.fs.path(self.directory).mkdir(parents=True, mode=0o755)
        self.fs.path(m.BASE+'/releases').chmod(0o700)
        self.source = self.base/'source'; self.source.mkdir(); git(self.source, 'init')
        for name, path in m.source_paths().items():
            file = self.source/path; file.parent.mkdir(parents=True, exist_ok=True); file.write_text('public fixture '+name+'\n')
        git(self.source, 'add', '.'); git(self.source, 'commit', '-m', 'fixture source')
        self.sha = git(self.source, 'rev-parse', 'HEAD').strip()
        self.tree = git(self.source, 'rev-parse', 'HEAD^{tree}').strip()
        bundle = self.base/'public.bundle'; git(self.source, 'bundle', 'create', str(bundle), 'HEAD')
        self.raw = bundle.read_bytes(); self.bundle = self.fs.path(self.directory+'/source.bundle')
        self.fs.write(self.directory+'/source.bundle', self.raw, 0o444)
        self.secret = self.fs.path(m.BASE+'/releases/private-sibling'); self.secret.write_bytes(b'root private fixture'); self.secret.chmod(0o600)
        self.repo = self.base/'operator.git'; self.repo.mkdir(); os.chown(self.repo, 1999, self.actor.pw_gid)
        self.pub = patch.object(m, 'PUBLISHER', str(self.repo)); self.pub.start(); self.addCleanup(self.pub.stop)
        self.host = m.Host(self.fs)
        self.host.git(['init', '--bare'])
        self.manifest = {'sourceSha': self.sha, 'sourceTree': self.tree, 'sourceBundleSha256': m.digest(self.raw),
                         'files': {n: m.digest((self.source/p).read_bytes()) for n, p in m.source_paths().items()}}

    def test_actual_host_import_across_private_parent(self):
        # Legitimate bundle, but the original pathname is genuinely unreadable by actor.
        with self.assertRaises(m.Blocked):
            self.host.git(['fetch', '--no-tags', str(self.bundle), self.sha])
        with patch.object(self.host, 'publisher', return_value={'sha': self.sha}):
            self.host.import_source(str(self.bundle), self.manifest, {'initialBridge': {}})
        self.assertEqual(self.host.git(['rev-parse', self.sha+'^{tree}']).strip(), self.tree)
        self.assertEqual(self.host.git(['cat-file', '-p', self.sha+':'+m.source_paths()['entry.mjs']]), 'public fixture entry.mjs\n')
        self.assertEqual(stat.S_IMODE(self.fs.path(m.BASE+'/releases').stat().st_mode), 0o700)
        denied = subprocess.run(['/usr/sbin/runuser','-u','aktau-sync','--','/usr/bin/test','-r',str(self.secret)])
        self.assertNotEqual(denied.returncode, 0)

    def test_wrong_owner_rejected_before_git(self):
        os.chown(self.bundle, self.actor.pw_uid, self.actor.pw_gid)
        with patch.object(self.host, 'git', wraps=self.host.git) as call:
            with self.assertRaisesRegex(m.Blocked, 'bundle_custody'):
                self.host.import_source(str(self.bundle), self.manifest, {})
            call.assert_not_called()

    def test_missing_closed_fd_and_truncated_bundle(self):
        with self.fs.source_bundle_fd(str(self.bundle), m.digest(self.raw)) as fd:
            # Numeric path without inheritance must fail, even with valid bytes.
            with self.assertRaises(m.Blocked):
                self.host.git(['fetch','--no-tags','/proc/self/fd/'+str(fd),self.sha])
        with self.assertRaises(m.Blocked):
            self.host.git(['fetch','--no-tags','/proc/self/fd/'+str(fd),self.sha], pass_fds=(fd,))
        self.bundle.chmod(0o600); self.bundle.write_bytes(self.raw[:40]); self.bundle.chmod(0o444)
        bad = dict(self.manifest, sourceBundleSha256=m.digest(self.raw[:40]))
        with self.assertRaises(m.Blocked):
            self.host.import_source(str(self.bundle), bad, {})

    def test_wrong_sha_and_tree_fail_closed(self):
        with self.assertRaises(m.Blocked):
            self.host.import_source(str(self.bundle), dict(self.manifest, sourceSha='f'*40), {})
        with self.assertRaisesRegex(m.Blocked, 'source_tree'):
            self.host.import_source(str(self.bundle), dict(self.manifest, sourceTree='f'*40), {})

    def test_only_bundle_descriptor_crosses_uid(self):
        private = os.open(self.secret, os.O_RDONLY); self.addCleanup(os.close, private)
        os.set_inheritable(private, True)
        with self.fs.source_bundle_fd(str(self.bundle), m.digest(self.raw)) as fd:
            code = ('import os; assert os.read('+str(fd)+', 12)==b"# v2 git bun"; '
                    'assert not os.path.exists("/proc/self/fd/'+str(private)+'")')
            m.command(['/usr/sbin/runuser','-u','aktau-sync','--','/usr/bin/python3','-c',code], pass_fds=(fd,))
        with self.assertRaises(OSError): os.fstat(fd)

    def test_timeout_cleans_operator_descendant_and_closes_fd(self):
        pidfile = self.repo/'child.pid'
        code = ('import os,time; p=os.fork(); '
                'open('+repr(str(pidfile))+',"w").write(str(os.getpid())) if p==0 else None; time.sleep(60)')
        start=time.monotonic()
        with self.assertRaisesRegex(m.Blocked, 'command_deadline'):
            with self.fs.source_bundle_fd(str(self.bundle), m.digest(self.raw)) as fd:
                m.command(['/usr/sbin/runuser','-u','aktau-sync','--','/usr/bin/python3','-c',code], timeout=.3, pass_fds=(fd,))
        self.assertLess(time.monotonic()-start, 5)
        with self.assertRaises(OSError): os.fstat(fd)
        pid=int(pidfile.read_text())
        status=pathlib.Path('/proc')/str(pid)/'stat'
        self.assertTrue(not status.exists() or status.read_text().split()[2]=='Z')


class CoupledPromotionTests(unittest.TestCase):
    """Real Git/runuser/Go metadata + transaction; service/GitHub/DB are local models."""
    def test_real_distinct_uid_promotion_and_coupled_rollback(self):
        self.assertEqual(os.geteuid(), 0)
        actor=pwd.getpwnam('aktau-sync'); self.assertEqual(actor.pw_uid,1999)
        with tempfile.TemporaryDirectory(prefix='coupled-root-') as temp:
            base=pathlib.Path(temp); base.chmod(0o755)
            source=base/'source'; source.mkdir(); git(source,'init')
            for n,p in m.source_paths().items():
                f=source/p; f.parent.mkdir(parents=True,exist_ok=True); f.write_text('fixture '+n+' version0\n')
            for p in m.PIPELINE_TOOLING_BRIDGE:
                f=source/p; f.parent.mkdir(parents=True,exist_ok=True); f.write_text('{}\n')
            git(source,'add','.'); git(source,'commit','-m','old')
            old=git(source,'rev-parse','HEAD').strip()
            (source/m.source_paths()['entry.mjs']).write_text('fixture entry version1\n')
            git(source,'add','.'); git(source,'commit','-m','new'); new=git(source,'rev-parse','HEAD').strip()
            bundle=base/'source.bundle'; git(source,'bundle','create',str(bundle),'HEAD')
            build=base/'build'; build.mkdir(); (build/'go.mod').write_text('module adilbaga/backend-go\n\ngo 1.27.3\n')
            for package in ['cmd/c2projection','cmd/ingest','internal/revalidation/testdata/relayprobe']:
                d=build/package; d.mkdir(parents=True)
                (d/'main.go').write_text('package main\nimport "fmt"\nvar sourceSHA string\nfunc main(){fmt.Println(sourceSHA)}\n')
            def contents(sha):
                out={'node':b'LOCAL_NODE_FIXTURE_NOT_EXECUTED', 'source.bundle':bundle.read_bytes(),
                     'source-manifest.json':m.canonical({'sourceSha':sha,'recipe':m.RECIPE,'nodeMajor':24})}
                for n,p in m.source_paths().items(): out[n]=git(source,'show',sha+':'+p).encode()
                for n,p in [('c2projection','cmd/c2projection'),('ingest','cmd/ingest'),('relayprobe','internal/revalidation/testdata/relayprobe')]:
                    target=build/(n+'-'+sha)
                    subprocess.run(['/usr/local/go/bin/go','build','-trimpath','-ldflags','-X main.sourceSHA='+sha,'-o',str(target),'./'+p],
                                   cwd=build,env={**os.environ,'CGO_ENABLED':'0','GOOS':'linux','GOARCH':'amd64'},check=True,timeout=90)
                    out[n]=target.read_bytes()
                return out
            before=contents(old); after=contents(new)
            manifest={'sourceSha':new,'sourceTree':git(source,'rev-parse',new+'^{tree}').strip(),
                      'sourceBundleSha256':m.digest(after['source.bundle']),
                      'files':{n:m.digest(after[n]) for n in m.FILES}}
            (base/'rootfs').mkdir(mode=0o700); fs=m.Filesystem(base/'rootfs')
            for p in [*m.FILES.values(),m.AUTH,m.AUTO,m.SITE,'/usr/local/go/bin/go']:
                fs.path(os.path.dirname(p)).mkdir(parents=True,exist_ok=True)
            for p in [m.BASE+'/releases',m.BASE+'/state']: fs.path(p).mkdir(parents=True,mode=0o700,exist_ok=True)
            site=m.canonical({'version':2,'evidence':'site-content-verification','origin':'https://aktau.market',
                              'representations':['product_ru','product_kk','sitemap','catalog','dashboard','category']})
            fs.write(m.SITE,site,0o644)
            for n,p in m.FILES.items(): fs.write(p,before[n],0o555 if n in ['node','c2projection','relayprobe','ingest'] else 0o444)
            fs.write('/usr/local/go/bin/go',pathlib.Path('/usr/local/go/bin/go').read_bytes(),0o555)
            fs.write(m.AUTH,m.canonical({'version':1,'approved':True,'sourceSha':old,'binarySha256':m.digest(before['c2projection']),
                     'clockSha256':m.digest(before['relayprobe']),'buildId':'LOCAL_FIXTURE','platform':'linux/amd64'}),0o644)
            fs.write(m.AUTO,m.canonical({'version':2,'enabled':True,'sourceSha':old,'sitePolicySha256':m.digest(site),
                     'files':{p:m.digest(before[n]) for n,p in m.FILES.items()}}),0o644)
            repo=base/'operator'; repo.mkdir(); os.chown(repo,actor.pw_uid,actor.pw_gid)
            reader=base/'reader.model'; reader.write_bytes(b'NO_DATABASE_CONTEXT'); reader.chmod(0o600)
            ledger=base/'ledger.model'; ledger.write_bytes(b'[]'); ledger.chmod(0o600)
            def invariant(): return {p.name:[p.stat().st_ino,m.digest(p.read_bytes())] for p in [reader,ledger]}
            original=invariant()
            class Local(m.Host):
                def idle(self): pass  # no actual host services
                def runtime_wiring(self,*a): pass  # local unit model
                def check_release(self,*a,**kw): pass  # no network/production approval
                def invariants(self): return invariant()
            real=m.command
            def mapped(args,**kw):
                # Only remap installed root FS targets for actual Go metadata inspection.
                args=[str(fs.path(a)) if a in m.FILES.values() else a for a in args]
                return real(args,**kw)
            with patch.object(m,'PUBLISHER',str(repo)), patch.object(m,'command',side_effect=mapped):
                host=Local(fs); host.git(['init']); host.git(['fetch',str(bundle),old])
                host.git(['checkout','-b','fixture',old]); tx=m.Transaction(fs,host)
                self.assertTrue(host.verify_old_closure({}))
                # No orphan root-proof directory in this fresh release inventory.
                self.assertEqual(tx.promote(after,manifest,{'initialBridge':{}},'distinct-root-proof'),'C2_CONFIG_SOURCE_ALIGNED')
                self.assertEqual(host.publisher()['sha'],new); self.assertTrue(host.verify_old_closure({}))
                self.assertEqual(invariant(),original)
                receipt=m.parse(fs.read(m.BASE+'/releases/distinct-root-proof/receipt.json'))
                self.assertEqual(receipt['phase'],'committed'); tx.inventory()
                self.assertEqual(tx.rollback(receipt),'ROLLED_BACK_PUBLISHER_AND_AUTHORITY')
                self.assertEqual(host.publisher(),{'sha':old,'branch':'fixture'})
                self.assertTrue(host.verify_old_closure({})); self.assertEqual(invariant(),original); tx.inventory()
                # Same transaction identity cannot be reused after rollback.
                with self.assertRaisesRegex(m.Blocked,'replayed_release'):
                    tx.promote(after,manifest,{'initialBridge':{}},'distinct-root-proof')
                # Truncated Git bundle (even hash-consistent) fails before any source switch.
                bad=dict(after, **{'source.bundle':after['source.bundle'][:40]})
                badmanifest=dict(manifest,sourceSha='f'*40,sourceBundleSha256=m.digest(bad['source.bundle']))
                with self.assertRaisesRegex(m.Blocked,'command_failed'): tx.promote(bad,badmanifest,{'initialBridge':{}},'invalid-bundle')
                self.assertEqual(host.publisher()['sha'],old); self.assertTrue(host.verify_old_closure({}))
                tx.inventory(); self.assertEqual(invariant(),original)
                self.assertFalse(fs.path(m.INTERLOCK).exists())
                self.assertEqual(stat.S_IMODE(fs.path(m.BASE+'/releases').stat().st_mode),0o700)


if __name__ == '__main__':
    unittest.main(verbosity=2)
