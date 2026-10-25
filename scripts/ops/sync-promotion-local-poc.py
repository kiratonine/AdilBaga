#!/usr/bin/env python3
"""Explicit disposable Git/Go/filesystem integration; NEVER production authority.

Requires two locally built public tar inputs and Go1.27.3 on PATH. No DB, HTTP,
sudo, root destinations, READY manufacture or publication. OS custody maps to
the nonroot test UID, exactly like the existing inactive-installer sandbox.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('promotion_poc', REPO/'ops/c2/publisher-promotion.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


def run(old_tar, new_tar):
    m.need(os.geteuid() != 0, 'nonroot_local_profile')
    old = m.unpack_tar(Path(old_tar).read_bytes()); new = m.unpack_tar(Path(new_tar).read_bytes())
    old_m = m.parse(old['promotion.json']); new_m = m.parse(new['promotion.json'])
    m.validate_package(old, old_m['sourceSha']); m.validate_package(new, new_m['sourceSha'])
    real_command = m.command
    go = str(Path(shutil.which('go')).resolve())
    m.need(subprocess.check_output([go,'version']) == b'go version go1.27.3 linux/amd64\n')
    with tempfile.TemporaryDirectory(prefix='aktau-sync-promotion-poc-') as temp:
        root = Path(temp); root.chmod(0o700); fs = m.Filesystem(root)
        publisher = root/'publisher'; publisher.mkdir()
        for argv in [['git','init',str(publisher)], ['git','-C',str(publisher),'fetch',str(REPO),old_m['sourceSha']+':refs/heads/fixture'],
                     ['git','-C',str(publisher),'checkout','fixture']]:
            real_command(argv,timeout=30)
        for target in [*m.FILES.values(),m.AUTH,m.AUTO,m.SITE,'/usr/local/go/bin/go']:
            fs.path(os.path.dirname(target)).mkdir(parents=True,exist_ok=True,mode=0o755)
        for path in [m.BASE+'/releases',m.BASE+'/state']:
            fs.path(path).mkdir(parents=True,exist_ok=True,mode=0o755)
        site={'version':2,'evidence':'site-content-verification','origin':'https://aktau.market',
              'representations':['product_ru','product_kk','sitemap','catalog','dashboard','category']}
        fs.write(m.SITE,m.canonical(site),0o644)
        for name,target in m.FILES.items():
            fs.write(target,old[name],0o555 if name in ['node','c2projection','relayprobe','ingest'] else 0o444)
        fs.write('/usr/local/go/bin/go',Path(go).read_bytes(),0o555)
        fs.write(m.AUTH,m.canonical({'version':1,'approved':True,'sourceSha':old_m['sourceSha'],
                 'binarySha256':old_m['files']['c2projection'],'clockSha256':old_m['files']['relayprobe'],
                 'buildId':'local-fixture-only','platform':'linux/amd64'}),0o644)
        fs.write(m.AUTO,m.canonical({'version':2,'enabled':True,'sourceSha':old_m['sourceSha'],
                 'sitePolicySha256':m.digest(m.canonical(site)),
                 'files':{target:old_m['files'][name] for name,target in m.FILES.items()}}),0o644)
        data = root/'private-operator-model'; data.mkdir(mode=0o700)
        reader = data/'reader.dsn'; reader.write_bytes(b'LOCAL_NONSECRET_DUMMY_NOT_A_DATABASE_CONTEXT\n'); reader.chmod(0o600)
        ledger = data/'attempts.json'; ledger.write_bytes(b'[]\n'); ledger.chmod(0o600)
        def unchanged():
            return {p.name:[p.stat().st_dev,p.stat().st_ino,p.stat().st_mode,m.digest(p.read_bytes())] for p in [reader,ledger]}
        baseline=unchanged()
        class LocalHost(m.Host):
            def git(self,args, *, pass_fds=()):
                return real_command(['/usr/bin/git','--no-replace-objects','-c','core.fsmonitor=false',
                                     '-c','core.hooksPath=/dev/null','-C',str(publisher)]+args,timeout=30,cap=2<<20,pass_fds=pass_fds).decode()
            def idle(self): pass  # explicit OS model; never queries host services
            def runtime_wiring(self,*args): pass  # explicit local unit model
            def check_release(self,*args,**kwargs): pass  # no GitHub/HTTP in PoC
            def invariants(self): return unchanged()
        def local_command(argv,**kw):
            args=list(argv)
            if args[0]=='/usr/local/go/bin/go':
                args[0]=go
                args=[str(fs.path(v)) if v in m.FILES.values() else v for v in args]
            return real_command(args,**kw)
        policy={'initialBridge':{'publisherSha':'fd2b9a3eec417f739299e3d1ccc1d3d6b09860fd',
                    'ancestorSha':'bb1842bfc3ad25e74840072482801a8656ec7679',
                    'requiredBlobs':{'pipeline/src/scrapers/dina.ts':'1daba18219e4841fd8c901182ee7edee5cc7dd05',
                                     'pipeline/test/dina.test.ts':'b5b1afd4d84826232f6fc3c0f3497947f6912cd0'}}}
        with patch.object(m,'command',side_effect=local_command):
            host=LocalHost(fs); transaction=m.Transaction(fs,host)
            m.need(host.verify_old_closure(policy), 'old_local_fixture_closure')
            result=transaction.promote(new,new_m,policy,'local-real-git-go')
            m.need(result=='C2_CONFIG_SOURCE_ALIGNED' and host.publisher()['sha']==new_m['sourceSha'])
            m.need(host.verify_old_closure(policy) and unchanged()==baseline)
            receipt=m.parse(fs.read(m.BASE+'/releases/local-real-git-go/receipt.json'))
            # Explicit rollback of the locally owned transaction, never a VPS CLI.
            result=transaction.rollback(receipt)
            m.need(result=='ROLLED_BACK_PUBLISHER_AND_AUTHORITY' and host.publisher()=={'sha':old_m['sourceSha'],'branch':'fixture'})
            m.need(host.verify_old_closure(policy) and unchanged()==baseline)
        return {'status':'LOCAL_PROMOTION_AND_COUPLED_ROLLBACK_PASS','realGit':True,'realGoBuildMetadata':True,
                'closureFiles':12,'readerInodePreserved':True,'ledgerBytesPreserved':True,
                'fixtureOnly':True,'productionAuthority':False,'HTTPRequests':0,'publications':0}


if __name__=='__main__':
    try:
        m.need(len(sys.argv)==3)
        print(json.dumps(run(*sys.argv[1:])))
    except BaseException as error:
        code=str(error) if type(error) is m.Blocked else type(error).__name__
        print(json.dumps({'status':'LOCAL_POC_FAIL','safeClass':code}));sys.exit(1)
