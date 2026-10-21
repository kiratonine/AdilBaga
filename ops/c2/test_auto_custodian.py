import importlib.util
import pathlib
import json
import os
import stat
import tempfile
import sys
import subprocess
import selectors
import time
import io
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('custodian', pathlib.Path(__file__).with_name('auto-custodian.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Model:
    """No root, production paths, DB, HTTP or systemd in protocol tests."""
    def __init__(self, fail=None, observed='OBSERVED_REQUIRES_POST_ATTESTATION', verdict='PASS'):
        self.calls=[]; self.fail=fail; self.observed=observed; self.verdict=verdict
    def step(self, name):
        self.calls.append(name)
        if self.fail==name: raise ValueError('synthetic private credentials must not be logged')
    def preflight(self): self.step('preflight')
    def spawn(self): self.step('spawn')
    def receive(self, phase):
        self.step('receive_'+phase)
        states={'prepared':'PREPARED_REQUIRES_BEFORE_ATTESTATION','armed':'ARMED_REQUIRES_LIVE_ROOT_READY','observed':self.observed,'final':'FINALIZED'}
        return {'state':states[phase],'attemptId':'a'*32,**({'acceptance':self.verdict,'qualifiedPassCount':1,'accepted':False,'reconciliationRequired':False} if phase=='final' else {})}
    def before(self, event): self.step('before')
    def send(self, command): self.step(command)
    def ready(self, event): self.step('ready')
    def notify(self): self.step('notify')
    def after(self, event): self.step('after')
    def finish(self, event): self.step('finish')
    def abort(self): self.step('abort')


class CycleTests(unittest.TestCase):
    def test_automatic_real_barriers_and_no_business_publish(self):
        io=Model(); result=m.run_cycle(io)
        self.assertEqual(result['state'],'FINALIZED')
        self.assertEqual(io.calls,['preflight','spawn','receive_prepared','before','ARM','receive_armed','ready','notify','receive_observed','after','FINALIZE','receive_final','finish'])
        self.assertFalse(any('apply' in c or 'publish' in c for c in io.calls))
    def test_every_gate_fails_closed_without_retries_or_forged_ready(self):
        for phase in ['preflight','spawn','receive_prepared','before','ARM','receive_armed','ready','notify','receive_observed','after','FINALIZE','receive_final','finish']:
            with self.subTest(phase=phase):
                io=Model(fail=phase)
                with self.assertRaises(ValueError): m.run_cycle(io)
                self.assertEqual(io.calls.count(phase),1)
                self.assertEqual(io.calls[-1],'abort')
                if phase in ['preflight','spawn','receive_prepared','before','ARM','receive_armed','ready']:
                    self.assertNotIn('notify',io.calls)
    def test_cleanup_uncertainty_is_not_finalized(self):
        io=Model(observed='RECONCILIATION_REQUIRED')
        with self.assertRaises(ValueError): m.run_cycle(io)
        self.assertNotIn('FINALIZE',io.calls)
    def test_clean_no_event_or_no_change_is_inconclusive_not_pass(self):
        io=Model(observed='CANCELLED_INCONCLUSIVE')
        result=m.run_cycle(io)
        self.assertEqual(result['state'],'CANCELLED_INCONCLUSIVE')
        self.assertNotIn('FINALIZE',io.calls)
        self.assertEqual(io.calls[-1],'finish')
    def test_fail_and_inconclusive_verdicts_not_promoted(self):
        for verdict in ['FAIL','INCONCLUSIVE']:
            self.assertEqual(m.run_cycle(Model(verdict=verdict))['acceptance'],verdict)
    def test_identity_pin_is_configuration_not_new_owner_confirmation(self):
        pin={'version':1,'evidence':'owner-pinned-configuration','alias':'aktau.market','deploymentId':'dpl_test','frontendSha':'c'*40,'ownerConfirmedAt':1000}
        d=m.deployment_record(pin,'a'*32,'before',2000,False)
        self.assertEqual(d['checkedAt'],2000)
        self.assertNotIn('confirmedAt',d)
        self.assertNotIn('ready',d)
        self.assertEqual(pin['ownerConfirmedAt'],1000)
        self.assertEqual(d['identityEvidence'],'owner-pinned-configuration')
    def test_root_command_has_no_options_environment_or_shell(self):
        self.assertEqual(m.NODE_COMMAND,['/usr/local/lib/nodejs/node-v24.18.0-linux-x64/bin/node','/usr/local/libexec/aktau-c2-operator.mjs'])
    def test_service_preserves_existing_schedule_and_fail_open_business(self):
        root=pathlib.Path(__file__).parent
        drop=(root/'aktau-sync-c2.conf').read_text()
        self.assertIn('ExecStartPre=-+/usr/bin/systemctl start aktau-c2-custodian.service',drop)
        self.assertNotIn('\nExecStart=',drop)
        self.assertNotIn('OnCalendar',drop)
        unit=(root/'aktau-c2-custodian.service').read_text()
        self.assertIn('Type=notify',unit)
        self.assertIn('Restart=no',unit)
        self.assertNotIn('WantedBy=',unit)
        self.assertNotIn('EnvironmentFile=',unit)
    def test_real_systemd_verifier_accepts_companion_and_composed_existing_service(self):
        repo=pathlib.Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory(prefix='c2-unit-verify-') as temp:
            target=pathlib.Path(temp)/'aktau-sync.service'
            target.write_text((repo/'ops/sync/aktau-sync.service').read_text()+'\n'+(repo/'ops/c2/aktau-sync-c2.conf').read_text())
            result=subprocess.run(['systemd-analyze','verify',str(target),str(repo/'ops/c2/aktau-c2-custodian.service')],capture_output=True,timeout=10)
            self.assertEqual(result.returncode,0,result.stderr.decode()[:1000])

    def test_previous_boot_interruption_retains_history_and_never_promotes_pass(self):
        prior={'attemptId':'b'*32,'state':'completed','transitions':['prepared','armed','event_consumed','completed'],'history':[{'state':s,'atUTC':1} for s in ['prepared','armed','event_consumed','completed']],'verdict':'PASS','evidence':{'acceptance':'PASS'}}
        for chain in [['prepared'],['prepared','armed'],['prepared','armed','event_consumed']]:
            interrupted={'attemptId':'a'*32,'state':chain[-1],'transitions':chain,'history':[{'state':s,'atUTC':2} for s in chain],'verdict':'INCONCLUSIVE','evidence':None}
            original=[prior,interrupted]
            updated=m.abandon_after_boot(original,'a'*32,'previous-boot','new-boot',3)
            self.assertEqual(updated[0],prior)
            self.assertEqual(m.ledger_verdict(updated,'a'*32),('INCONCLUSIVE',1))
            self.assertEqual(original[-1],interrupted)
            with self.assertRaises(ValueError): m.abandon_after_boot(original,'a'*32,'same','same',3)
            with self.assertRaises(ValueError): m.abandon_after_boot(original,'c'*32,'old','new',3)
    def test_malformed_or_forged_terminal_evidence_is_not_repaired(self):
        for e in [[],[{'attemptId':'a'*32,'state':'completed','verdict':'PASS'}],[{'attemptId':'a'*32,'state':'armed','verdict':'PASS','transitions':['prepared','armed'],'history':[]}]]:
            with self.assertRaises(ValueError): m.abandon_after_boot(e,'a'*32,'old','new',3)


class RootFileTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='c2-root-read-test-');self.addCleanup(self.temp.cleanup)
        self.root=pathlib.Path(self.temp.name);self.file=self.root/'file';self.file.write_bytes(b'bounded');self.file.chmod(0o444)
        real_lstat=m.os.lstat;real_fstat=m.os.fstat
        def lstat(path):
            s=real_lstat(path)
            if stat.S_ISDIR(s.st_mode): return SimpleNamespace(st_mode=stat.S_IFDIR|0o755,st_uid=0)
            return self.root_stat(s)
        self.patches=[patch.object(m.os,'lstat',side_effect=lstat),patch.object(m.os,'fstat',side_effect=lambda fd:self.root_stat(real_fstat(fd)))]
        for p in self.patches:p.start();self.addCleanup(p.stop)
    @staticmethod
    def root_stat(s): return SimpleNamespace(st_dev=s.st_dev,st_ino=s.st_ino,st_uid=0,st_gid=s.st_gid,st_mode=s.st_mode,st_nlink=s.st_nlink,st_size=s.st_size)
    def test_actual_fd_bounded_read_and_no_follow(self):
        self.assertEqual(m.root_bytes(str(self.file)),b'bounded')
        self.assertEqual(m.root_digest(str(self.file)),m.digest(b'bounded'))
        link=self.root/'symlink';link.symlink_to(self.file)
        with self.assertRaises(OSError):m.root_bytes(str(link))
    def test_writable_hardlinked_oversize_fifo_and_directory_rejected(self):
        self.file.chmod(0o622)
        with self.assertRaises(ValueError):m.root_bytes(str(self.file))
        self.file.chmod(0o444);hard=self.root/'hard';os.link(self.file,hard)
        with self.assertRaises(ValueError):m.root_bytes(str(self.file))
        hard.unlink()
        with self.assertRaises(ValueError):m.root_bytes(str(self.file),3)
        fifo=self.root/'fifo';os.mkfifo(fifo)
        with self.assertRaises(ValueError):m.root_bytes(str(fifo))
        with self.assertRaises(ValueError):m.root_bytes(str(self.root))
    def test_unsafe_ancestor_rejected_before_open(self):
        with patch.object(m.os,'lstat',return_value=SimpleNamespace(st_mode=stat.S_IFDIR|0o777,st_uid=0)):
            with patch.object(m.os,'open',side_effect=AssertionError('must not open')):
                with self.assertRaises(ValueError):m.root_bytes(str(self.file))
    def test_file_replaced_after_open_is_rejected(self):
        real=m.os.open
        def replaced(path,*args,**kwargs):
            fd=real(path,*args,**kwargs)
            if path==str(self.file):
                self.file.rename(self.root/'saved');self.file.write_bytes(b'foreign');self.file.chmod(0o444)
            return fd
        with patch.object(m.os,'open',side_effect=replaced):
            with self.assertRaises(ValueError):m.root_bytes(str(self.file))


class CommandTests(unittest.TestCase):
    def test_real_bounded_child_status_timeout_and_output(self):
        self.assertEqual(m.bounded_command([sys.executable,'-c','print("ok")']),b'ok\n')
        with self.assertRaises(ValueError):m.bounded_command([sys.executable,'-c','print("x"*20000)'],cap=16)
        with self.assertRaises(ValueError):m.bounded_command([sys.executable,'-c','import time; time.sleep(20)'],timeout=0.05)
        with self.assertRaises(ValueError):m.bounded_command([sys.executable,'-c','raise SystemExit(3)'])

    def test_real_private_child_pipe_partial_frame_caps_eof_and_deadline(self):
        samples=[('import sys,time;sys.stdout.write(\'{"state":\');sys.stdout.flush();time.sleep(.01);print(\'"NOT_ARMED"}\')',True),
                 ('print("x"*4097)',False),('print("not canonical JSON")',False),('pass',False)]
        for source,valid in samples:
            io=m.Custodian();io.child=subprocess.Popen([sys.executable,'-c',source],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env={})
            os.set_blocking(io.child.stdout.fileno(),False);io.selector.register(io.child.stdout,selectors.EVENT_READ)
            try:
                if valid:self.assertEqual(io.receive('prepared'),{'state':'NOT_ARMED'})
                else:
                    with self.assertRaises((ValueError,json.JSONDecodeError)):io.receive('prepared')
                io.deadline=time.monotonic()-8
                with self.assertRaises(ValueError):io.receive('prepared')
                with self.assertRaises(ValueError):io.send('ARBITRARY')
            finally:
                io.abort();io.child.wait(timeout=2);io.child.stdin.close();io.child.stdout.close();io.selector.close()


class BootFilesystemTests(unittest.TestCase):
    """Owned temporary filesystem only; simulated kernel boot/account metadata."""
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='c2-boot-test-');self.addCleanup(self.temp.cleanup)
        self.root=pathlib.Path(self.temp.name);self.state=self.root/'state';self.admin=self.root/'admin'
        self.state.mkdir(mode=0o700);self.admin.mkdir(mode=0o700);(self.state/'ledger').mkdir(mode=0o700)
        self.paths={'STATE':str(self.state),'ADMIN':str(self.admin),'DEPLOYMENT':str(self.root/'deployment.json'),'READY':str(self.root/'ready.json')}
        for key,value in self.paths.items():
            p=patch.object(m,key,value);p.start();self.addCleanup(p.stop)
        self.io=m.Custodian();self.io.uid=os.geteuid();self.io.gid=os.getegid();self.io.boot='22222222-2222-2222-2222-222222222222'
        self.io.invocation='b'*32
        self.io.exclusive_cgroup=lambda:None # explicit test-only kernel model
        self.io.pin={'version':1,'evidence':'owner-pinned-configuration','alias':'aktau.market','deploymentId':'dpl_fixture','frontendSha':'c'*40,'ownerConfirmedAt':1}
        self.io.statefd=os.open(self.state,os.O_RDONLY|os.O_DIRECTORY);self.addCleanup(os.close,self.io.statefd)
        self.addCleanup(self.io.selector.close)
        self.attempt='a'*32
        self.entry={'attemptId':self.attempt,'state':'armed','transitions':['prepared','armed'],'history':[{'state':s,'atUTC':2} for s in ['prepared','armed']],'verdict':'INCONCLUSIVE','evidence':None}
        self.save(self.state/'ledger/attempts.json',[self.entry]);self.save(self.state/'ledger/operator.lock',b'')
        self.run=self.state/self.attempt;self.run.mkdir(mode=0o700);os.mkfifo(self.run/'event.fifo',0o600)
        self.old={'version':1,'attemptId':self.attempt,'bootId':'11111111-1111-1111-1111-111111111111','phase':'armed','atUTC':3,'pid':123,'invocationId':'a'*32,'configurationSha256':m.digest(m.canonical(self.io.pin)),'outcome':None,'owned':{}}
        self.save(self.admin/'current.json',self.old)
        def fixture_root_json(path):
            raw=pathlib.Path(path).read_bytes();v=json.loads(raw)
            if m.canonical(v)!=raw:raise ValueError('test_noncanonical')
            return v
        for p in [patch.object(m,'root_json',side_effect=fixture_root_json),patch.object(m.subprocess,'run',return_value=SimpleNamespace(returncode=1,stdout=b''))]:
            p.start();self.addCleanup(p.stop)
    @staticmethod
    def save(path,value):
        pathlib.Path(path).write_bytes(value if isinstance(value,bytes) else m.canonical(value));pathlib.Path(path).chmod(0o600)
    def snapshot(self):
        return sorted(str(p.relative_to(self.root)) for p in self.root.rglob('*'))
    def test_real_files_preserved_before_boot_recovery_and_only_inconclusive_written(self):
        self.io.recover_prior_boot()
        saved=self.admin/('recovered-'+self.attempt)
        self.assertTrue((saved/'attempts.json').exists());self.assertTrue((saved/'operator.lock').exists());self.assertTrue((saved/'attempt/event.fifo').is_fifo())
        entries=json.loads((self.state/'ledger/attempts.json').read_bytes())
        self.assertEqual(m.ledger_verdict(entries,self.attempt),('INCONCLUSIVE',0))
        self.assertFalse((self.state/'ledger/operator.lock').exists());self.assertEqual(json.loads((self.admin/'current.json').read_bytes())['phase'],'completed')
    def test_unknown_resource_blocks_before_any_move(self):
        (self.run/'foreign').write_bytes(b'do not move')
        before=self.snapshot();original=(self.state/'ledger/attempts.json').read_bytes()
        with self.assertRaises(ValueError):self.io.recover_prior_boot()
        self.assertEqual(self.snapshot(),before);self.assertEqual((self.state/'ledger/attempts.json').read_bytes(),original)
    def test_same_boot_live_actor_and_wrong_attempt_cannot_recover(self):
        old=dict(self.old);old['invocationId']=self.io.invocation;self.save(self.admin/'current.json',old)
        with self.assertRaises(ValueError):self.io.recover_prior_boot()
        self.save(self.admin/'current.json',self.old)
        with patch.object(m.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=b'123\n')):
            with self.assertRaises(ValueError):self.io.recover_prior_boot()
        old=dict(self.old);old['attemptId']='b'*32;self.save(self.admin/'current.json',old)
        with self.assertRaises(ValueError):self.io.recover_prior_boot()
    def test_symlink_ledger_or_hardlinked_claim_block_before_moves(self):
        self.save(self.run/'publisher.claim',b'fixture');os.link(self.run/'publisher.claim',self.run/'claim-alias')
        before=self.snapshot()
        with self.assertRaises(ValueError):self.io.recover_prior_boot()
        self.assertEqual(self.snapshot(),before)
        (self.run/'claim-alias').unlink();(self.run/'publisher.claim').unlink()
        ledger=self.state/'ledger';ledger.rename(self.state/'saved-ledger');ledger.symlink_to(self.state/'saved-ledger')
        with self.assertRaises(ValueError):self.io.recover_prior_boot()
    def test_pinned_namespace_detects_parent_swap(self):
        self.state.rename(self.root/'saved-state');self.state.mkdir(mode=0o700)
        with self.assertRaises(ValueError):self.io.check_namespace()
    def test_namespace_preflight_never_spawns_and_unknown_directory_interlocks(self):
        self.save(self.state/'ledger/attempts.json',[])
        (self.state/'ledger/operator.lock').unlink();(self.run/'event.fifo').unlink();self.run.rmdir()
        with patch.object(m.subprocess,'Popen',side_effect=AssertionError('read-only preflight must not spawn')):
            self.io.preflight_namespace()
            self.run.mkdir(mode=0o700)
            with self.assertRaises(ValueError):self.io.preflight_namespace()
    def test_live_cgroup_cannot_be_treated_as_a_dead_old_invocation(self):
        self.io.exclusive_cgroup=lambda:(_ for _ in ()).throw(ValueError('previous_actor_still_live'))
        before=self.snapshot()
        with self.assertRaises(ValueError):self.io.recover_prior_boot()
        self.assertEqual(self.snapshot(),before)
    def test_new_same_boot_invocation_needs_independent_kernel_no_actor_proof(self):
        self.old['bootId']=self.io.boot;self.save(self.admin/'current.json',self.old)
        calls=[];self.io.exclusive_cgroup=lambda:calls.append('actual-kernel-model-checked')
        self.io.recover_prior_boot()
        self.assertEqual(calls,['actual-kernel-model-checked'])
        self.assertEqual(m.ledger_verdict(json.loads((self.state/'ledger/attempts.json').read_bytes()),self.attempt),('INCONCLUSIVE',0))
    def test_reboot_before_prepared_frame_preserves_uncommitted_files_without_fake_attempt(self):
        self.old.update(attemptId=None,phase='starting');self.save(self.admin/'current.json',self.old)
        self.save(self.state/'ledger/attempts.json',[])
        partial=self.state/('ledger/attempts.json.'+'c'*32+'.pending');self.save(partial,b'{partial preparation')
        (self.run/'event.fifo').unlink();self.run.rmdir()
        self.io.recover_prior_boot()
        saved=self.admin/('recovered-unarmed-'+self.old['invocationId'])
        self.assertEqual((saved/partial.name).read_bytes(),b'{partial preparation')
        self.assertEqual(json.loads((self.state/'ledger/attempts.json').read_bytes()),[])
        self.assertFalse((self.state/'ledger/operator.lock').exists())
        self.assertEqual(json.loads((saved/'controller.json').read_bytes())['phase'],'starting')


class LiveIdentityTests(unittest.TestCase):
    def test_exact_node_spawn_is_only_in_explicit_spawn_step(self):
        c=m.Custodian();calls=[];c.journal_save=lambda phase:calls.append(phase)
        r,w=os.pipe();f=os.fdopen(r,'rb');child=SimpleNamespace(pid=777,stdout=f)
        try:
            with patch.object(m.subprocess,'Popen',return_value=child) as launch:
                c.spawn()
                self.assertEqual(launch.call_args.args,(m.NODE_COMMAND,));self.assertEqual(launch.call_args.kwargs['env'],{})
                self.assertEqual(launch.call_args.kwargs['stderr'],subprocess.DEVNULL)
                self.assertEqual(calls,['starting','starting']);self.assertIs(c.child,child)
        finally:f.close();os.close(w);c.selector.close()
    def test_root_verifies_actual_process_attributes_not_child_claims(self):
        for scenario in ['valid','dumpable','traced','capability','wrong_parent','wrong_uid','wrong_gid','wrong_exe','wrong_cmd','wrong_bytes','wrong_start']:
            with self.subTest(scenario=scenario):
                c=m.Custodian();self.addCleanup(c.selector.close);c.uid=1000;c.gid=1001
                c.policy={'files':{m.NODE:m.digest(b'synthetic ELF')}}
                status='PPid:\t42\nTracerPid:\t'+('1' if scenario=='traced' else '0')+'\nUid:\t'+('1000 1002 1000 1000' if scenario=='wrong_uid' else '1000 1000 1000 1000')+'\nGid:\t'+('1001 1002 1001 1001' if scenario=='wrong_gid' else '1001 1001 1001 1001')+'\nCapEff:\t'+('0001' if scenario=='capability' else '0000')+'\nCapPrm:\t0000\nCapInh:\t0000\n'
                if scenario=='wrong_parent':status=status.replace('PPid:\t42','PPid:\t43')
                argv=[m.NODE,m.ENTRY];cmd=b'\0'.join(x.encode() for x in argv)+b'\0'
                fields=['0']*20;fields[19]='wrong' if scenario=='wrong_start' else '12345'
                def read_text(p,*a,**kw):
                    if str(p).endswith('/status'):return status
                    if str(p).endswith('/stat'):return '777 (node) '+' '.join(fields)
                    raise AssertionError('unexpected kernel read')
                with patch.object(m.os,'stat',return_value=SimpleNamespace(st_uid=1000 if scenario=='dumpable' else 0)),patch.object(m.os,'readlink',return_value='/unapproved' if scenario=='wrong_exe' else m.NODE),patch.object(pathlib.Path,'read_text',read_text),patch.object(pathlib.Path,'read_bytes',return_value=b'wrong' if scenario=='wrong_cmd' else cmd),patch('builtins.open',return_value=io.BytesIO(b'wrong' if scenario=='wrong_bytes' else b'synthetic ELF')):
                    if scenario=='valid':self.assertEqual(c.live_process(777,42,m.NODE,argv),(m.digest(b'synthetic ELF'),cmd,'12345'))
                    else:
                        with self.assertRaises(ValueError):c.live_process(777,42,m.NODE,argv)
    def test_configuration_pin_invalid_types_unknown_fields_and_future_dates(self):
        valid={'version':1,'evidence':'owner-pinned-configuration','alias':'aktau.market','deploymentId':'dpl_test','frontendSha':'c'*40,'ownerConfirmedAt':1000}
        m.validate_pin(valid,2000)
        for key,value in [('version',True),('ownerConfirmedAt',True),('ownerConfirmedAt',3000),('ownerConfirmedAt','1000'),('alias','elsewhere.invalid'),('evidence','fresh-vercel-api'),('frontendSha','C'*40),('deploymentId','not-a-deployment'),('extra',True)]:
            with self.subTest(key=key,value=value):
                with self.assertRaises(ValueError):m.validate_pin({**valid,key:value},2000)


if __name__=='__main__': unittest.main()
