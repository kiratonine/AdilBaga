#!/usr/bin/python3
"""One bounded independent root custodian, triggered by the EXISTING sync job.

No publication, scheduler, credential import, provider override or Vercel login.
Root policy pins reviewed bytes and Owner-confirmed frontend CONFIGURATION. It
does not claim a current Vercel API attestation. The dropped Node process alone
owns trusted BEFORE/FIFO/capture/AFTER custody and computes the verdict.
"""
import datetime
import fcntl
import hashlib
import json
import math
import os
import pathlib
import pwd
import re
import selectors
import signal
import socket
import stat
import subprocess
import sys
import time

KIT = '/usr/local/libexec/aktau-c2'
ENTRY = '/usr/local/libexec/aktau-c2-operator.mjs'
SELF = '/usr/local/libexec/aktau-c2-custodian.py'
NODE = '/usr/local/lib/nodejs/node-v24.18.0-linux-x64/bin/node'
NODE_COMMAND = [NODE, ENTRY]
STATE = '/var/lib/aktau-sync/c2'
ADMIN = '/var/lib/aktau-c2-custodian'
POLICY = '/etc/aktau-c2/automatic.json'
PIN = '/etc/aktau-c2/frontend.json'
AUTH = '/etc/aktau-c2/authorization.json'
DEPLOYMENT = '/etc/aktau-c2/deployment.json'
READY = '/etc/aktau-c2/ready.json'
FILES = [NODE, ENTRY, SELF, '/usr/local/libexec/aktau-c2-ingest'] + [KIT+'/'+n for n in ['c2projection','relayprobe','c2-production-supervisor.mjs','projection-provider.mjs','fifo-adapter.mjs','production-observer.mjs','c2-manifest.mjs','source-manifest.json']]
ID = re.compile(r'[a-f0-9]{32}\Z')
HEX40 = re.compile(r'[a-f0-9]{40}\Z')
HEX64 = re.compile(r'[a-f0-9]{64}\Z')


def canonical(value): return (json.dumps(value, separators=(',', ':'), ensure_ascii=False)+'\n').encode()
def digest(raw): return hashlib.sha256(raw).hexdigest()
def now_ms(): return time.time_ns()//1000000
def iso(ms): return datetime.datetime.fromtimestamp(ms/1000, datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def exact(value, keys): return type(value) is dict and set(value)==set(keys)
def identity(st): return (st.st_dev,st.st_ino,st.st_uid,st.st_gid,st.st_mode,st.st_nlink)


def root_fd(path, limit):
    for parent in pathlib.Path(path).parents:
        s=os.lstat(parent)
        if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022: raise ValueError('root_custody')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        s=os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_nlink!=1 or s.st_mode&0o022 or not 0<s.st_size<=limit: raise ValueError('root_file')
        return fd,s
    except Exception: os.close(fd); raise


def root_bytes(path, limit=16384):
    """Fixed root paths; no symlinks, writable ancestor, hardlink or unbounded IO."""
    fd,s=root_fd(path,limit)
    try:
        raw=bytearray()
        while len(raw)<=limit:
            chunk=os.read(fd,min(65536,limit+1-len(raw)))
            if not chunk: break
            raw.extend(chunk)
        if len(raw)>limit or identity(os.lstat(path))!=identity(s): raise ValueError('root_file_changed')
        return bytes(raw)
    finally: os.close(fd)


def root_digest(path, limit=256<<20):
    fd,s=root_fd(path,limit)
    try:
        h=hashlib.sha256(); count=0
        while chunk:=os.read(fd,65536):
            count+=len(chunk)
            if count>limit: raise ValueError('artifact_capacity')
            h.update(chunk)
        if count!=s.st_size or identity(os.lstat(path))!=identity(s): raise ValueError('artifact_changed')
        return h.hexdigest()
    finally: os.close(fd)


def root_json(path):
    raw=root_bytes(path); value=json.loads(raw)
    if canonical(value)!=raw: raise ValueError('noncanonical_root_record')
    return value


def node_ledger_json(raw):
    # JSON.stringify and Python use different valid decimal/exponent cutoffs.
    # Validate the original single UTF-8 JSON document, not Python's re-encoding.
    if not raw.endswith(b'\n') or b'\n' in raw[:-1] or raw[:1]!=b'[': raise ValueError('ledger_framing')
    def pairs(values):
        obj={}
        for key,value in values:
            if key in obj: raise ValueError('ledger_duplicate_key')
            obj[key]=value
        return obj
    def constant(value): raise ValueError('ledger_nonfinite')
    def number(value):
        v=float(value)
        if not math.isfinite(v): raise ValueError('ledger_nonfinite')
        return v
    entries=json.loads(raw.decode('utf8','strict'),object_pairs_hook=pairs,parse_constant=constant,parse_float=number)
    if type(entries) is not list: raise ValueError('ledger_shape')
    return entries


def bounded_command(argv, timeout=5, cap=4096):
    child=subprocess.Popen(argv,env={'PATH':'/usr/bin:/bin','GIT_OPTIONAL_LOCKS':'0'},stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,start_new_session=True)
    poll=selectors.DefaultSelector(); poll.register(child.stdout,selectors.EVENT_READ)
    end=time.monotonic()+timeout; data=bytearray()
    try:
        while True:
            if time.monotonic()>=end: raise ValueError('command_deadline')
            if not poll.select(min(0.1,end-time.monotonic())): continue
            chunk=os.read(child.stdout.fileno(),min(4096,cap+1-len(data)))
            if not chunk: break
            data.extend(chunk)
            if len(data)>cap: raise ValueError('command_output_bound')
        if child.wait(timeout=max(0.001,end-time.monotonic())): raise ValueError('command_failed')
        return bytes(data)
    finally:
        poll.close(); child.stdout.close()
        if child.poll() is None:
            os.killpg(child.pid,signal.SIGTERM)
            try: child.wait(timeout=1)
            except subprocess.TimeoutExpired: os.killpg(child.pid,signal.SIGKILL); child.wait(timeout=1)


def validate_pin(pin, now):
    if not exact(pin,['version','evidence','alias','deploymentId','frontendSha','ownerConfirmedAt']) or type(pin['version']) is not int or pin['version']!=1 or pin['evidence']!='owner-pinned-configuration' or pin['alias']!='aktau.market' or type(pin['deploymentId']) is not str or not re.fullmatch(r'dpl_[A-Za-z0-9]{1,80}',pin['deploymentId']) or type(pin['frontendSha']) is not str or not HEX40.fullmatch(pin['frontendSha']) or type(pin['ownerConfirmedAt']) is not int or not 0<pin['ownerConfirmedAt']<=now: raise ValueError('frontend_configuration')


def deployment_record(pin, attempt, stage, checked, inactive):
    validate_pin(pin,checked)
    if not ID.fullmatch(attempt) or stage not in ['before','after'] or type(inactive) is not bool: raise ValueError('attempt')
    return {'version':2,'attemptId':attempt,'stage':stage,'alias':pin['alias'],'deploymentId':pin['deploymentId'],'frontendSha':pin['frontendSha'],'optInInactive':inactive,'legitimatePublication':True,'identityEvidence':'owner-pinned-configuration','configurationSha256':digest(canonical(pin)),'checkedAt':checked}


def ledger_verdict(entries, attempt):
    if type(entries) is not list or not entries or len(entries)>1000: raise ValueError('ledger_shape')
    seen=set(); count=0
    for e in entries:
        if type(e) is not dict or type(e.get('attemptId')) is not str or not ID.fullmatch(e['attemptId']) or e['attemptId'] in seen or e.get('state') not in ['completed','inconclusive'] or e.get('verdict') not in ['PASS','FAIL','INCONCLUSIVE']: raise ValueError('ledger_identity')
        seen.add(e['attemptId'])
        tr=e.get('transitions'); hist=e.get('history')
        if type(tr) is not list or not tr or tr[0]!='prepared' or tr[-1]!=e['state'] or type(hist) is not list or len(hist)!=len(tr) or any(type(h) is not dict or h.get('state')!=s or type(h.get('atUTC')) is not int for h,s in zip(hist,tr)): raise ValueError('ledger_history')
        if e['state']=='completed':
            if tr!=['prepared','armed','event_consumed','completed'] or type(e.get('evidence')) is not dict or e['evidence'].get('acceptance')!=e['verdict']: raise ValueError('ledger_evidence')
        elif e['verdict']!='INCONCLUSIVE': raise ValueError('ledger_inconclusive')
        if e['verdict']=='FAIL': count=0
        elif e['state']=='completed' and e['verdict']=='PASS': count+=1
    if entries[-1]['attemptId']!=attempt: raise ValueError('ledger_attempt')
    return entries[-1]['verdict'],count


def abandon_after_boot(entries, attempt, old_boot, current_boot, at, *, actors_gone=False):
    """Never count an interrupted attempt; retain all earlier durable evidence."""
    if (old_boot==current_boot and not actors_gone) or not old_boot or not current_boot or type(entries) is not list or not entries or entries[-1].get('attemptId')!=attempt: raise ValueError('abandoned_attempt_unproven')
    if len(entries)>1: ledger_verdict(entries[:-1],entries[-2]['attemptId'])
    last=entries[-1]
    if last.get('state') in ['completed','inconclusive']: ledger_verdict(entries,attempt); return entries
    transitions=last.get('transitions')
    if transitions not in [['prepared'],['prepared','armed'],['prepared','armed','event_consumed']] or last.get('state')!=transitions[-1] or type(last.get('history')) is not list or len(last['history'])!=len(transitions) or any(h.get('state')!=s or type(h.get('atUTC')) is not int for h,s in zip(last['history'],transitions)) or last.get('verdict')!='INCONCLUSIVE': raise ValueError('abandoned_ledger_shape')
    evidence={'acceptance':'INCONCLUSIVE','reason':'independent_root_verified_previous_boot_abandoned','previousBootId':old_boot,'recoveredAtUTC':at}
    updated={**last,'state':'inconclusive','transitions':transitions+['inconclusive'],'history':last['history']+[{'state':'inconclusive','atUTC':at,'evidence':evidence}],'verdict':'INCONCLUSIVE','evidence':evidence}
    result=entries[:-1]+[updated]; ledger_verdict(result,attempt)
    return result


def run_cycle(io):
    """Only root barriers automate ARM/FINALIZE; no user-selected commands."""
    try:
        io.preflight(); io.spawn()
        event=io.receive('prepared')
        if event.get('state')!='PREPARED_REQUIRES_BEFORE_ATTESTATION': raise ValueError('not_prepared')
        io.before(event); io.send('ARM')
        event=io.receive('armed')
        if event.get('state')=='CANCELLED_INCONCLUSIVE': io.finish(event); return event
        if event.get('state')!='ARMED_REQUIRES_LIVE_ROOT_READY': raise ValueError('not_armed')
        io.ready(event); io.notify()
        event=io.receive('observed')
        if event.get('state')=='CANCELLED_INCONCLUSIVE': io.finish(event); return event
        if event.get('state')!='OBSERVED_REQUIRES_POST_ATTESTATION': raise ValueError('observation_incomplete')
        io.after(event); io.send('FINALIZE')
        event=io.receive('final')
        if event.get('state')!='FINALIZED': raise ValueError('not_finalized')
        io.finish(event); return event
    except Exception:
        io.abort()
        raise


class Custodian:
    def __init__(self):
        self.started=time.monotonic(); self.deadline=self.started+35*60
        self.child=None; self.selector=selectors.DefaultSelector(); self.buffer=b''
        self.owned={}; self.attempt=None; self.runfd=None; self.statefd=None
        self.journal=None; self.lock=None; self.fifo_identity=None
        self.invocation=os.environ.get('INVOCATION_ID')
        self.outcome=None
        self.evidence_dir=None

    def journal_save(self, phase):
        self.journal={'version':1,'attemptId':self.attempt,'bootId':self.boot,'phase':phase,'atUTC':now_ms(),'pid':self.child.pid if self.child else None,'invocationId':self.invocation,'configurationSha256':digest(canonical(self.pin)),'outcome':self.outcome,'owned':{p:{'identity':list(v[0]),'sha256':v[1]} for p,v in self.owned.items() if p!=ADMIN+'/current.json'}}
        self.atomic(ADMIN+'/current.json',self.journal,private=True,replace_journal=True)

    def atomic(self,path,value,private=False,replace_journal=False):
        # Only fixed root destinations; a changed/foreign previous record is an
        # interlock, never an overwrite. Journal is independently root-controlled.
        if path not in [DEPLOYMENT,READY,ADMIN+'/current.json']: raise ValueError('record_path')
        if os.path.lexists(path):
            if replace_journal: root_json(path)
            elif path not in self.owned or identity(os.lstat(path))!=self.owned[path][0] or digest(root_bytes(path))!=self.owned[path][1]: raise ValueError('foreign_record')
        raw=canonical(value); temp=path+'.'+os.urandom(16).hex()+'.pending'
        fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600 if private else 0o644)
        try:
            os.fchmod(fd,0o600 if private else 0o644)
            at=0
            while at<len(raw):
                n=os.write(fd,raw[at:])
                if n<1: raise ValueError('short_write')
                at+=n
            os.fsync(fd)
        finally: os.close(fd)
        os.rename(temp,path); self.sync_parent(path)
        self.owned[path]=(identity(os.lstat(path)),digest(raw))

    @staticmethod
    def sync_parent(path):
        fd=os.open(os.path.dirname(path),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try: os.fsync(fd)
        finally: os.close(fd)

    def check_files(self):
        if root_json(POLICY)!=self.policy or root_json(PIN)!=self.pin: raise ValueError('configuration_changed')
        for path,want in self.policy['files'].items():
            if root_digest(path)!=want: raise ValueError('artifact_changed')
        a=root_json(AUTH)
        if a.get('approved') is not True or a.get('sourceSha')!=self.policy['sourceSha'] or a.get('binarySha256')!=self.policy['files'][KIT+'/c2projection'] or a.get('clockSha256')!=self.policy['files'][KIT+'/relayprobe']: raise ValueError('independent_artifact_authority')

    def check_publisher(self):
        command=['/usr/sbin/runuser','-u','aktau-sync','--','/usr/bin/git','-c','core.fsmonitor=false','-C','/opt/aktau-sync']
        for args,want in [(['rev-parse','HEAD'],self.policy['sourceSha']+'\n'),(['status','--porcelain=v1','--untracked-files=all'],'')]:
            if bounded_command(command+args).decode()!=want: raise ValueError('publisher_identity')

    def check_namespace(self):
        if self.statefd is None or identity(os.lstat(STATE))!=identity(os.fstat(self.statefd)): raise ValueError('operator_parent_changed')
        if self.runfd is not None and identity(os.stat(self.attempt,dir_fd=self.statefd,follow_symlinks=False))!=identity(os.fstat(self.runfd)): raise ValueError('attempt_directory_changed')

    def preflight(self):
        if os.geteuid()!=0 or os.getuid()!=0: raise ValueError('root_required')
        if type(self.invocation) is not str or not ID.fullmatch(self.invocation): raise ValueError('systemd_invocation')
        self.policy=root_json(POLICY); self.pin=root_json(PIN)
        if not exact(self.policy,['version','enabled','sourceSha','frontendConfigurationSha256','files']) or type(self.policy['version']) is not int or self.policy['version']!=1 or self.policy['enabled'] is not True or type(self.policy['sourceSha']) is not str or not HEX40.fullmatch(self.policy['sourceSha']) or not exact(self.policy['files'],FILES) or any(type(v) is not str or not HEX64.fullmatch(v) for v in self.policy['files'].values()) or self.policy['frontendConfigurationSha256']!=digest(canonical(self.pin)): raise ValueError('automatic_policy')
        validate_pin(self.pin,now_ms()); self.check_files()
        self.boot=pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        if not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',self.boot): raise ValueError('kernel_boot_identity')
        account=pwd.getpwnam('aktau-sync'); self.uid=account.pw_uid; self.gid=account.pw_gid
        if self.uid<=0 or self.gid<0: raise ValueError('service_account')
        # Admin directory is installed root0700; never created through a caller.
        s=os.lstat(ADMIN)
        if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or stat.S_IMODE(s.st_mode)!=0o700: raise ValueError('admin_directory')
        for p in pathlib.Path(ADMIN).parents:
            s=os.lstat(p)
            if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022: raise ValueError('admin_ancestor')
        lock=os.open(ADMIN+'/controller.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
        s=os.fstat(lock)
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_nlink!=1 or stat.S_IMODE(s.st_mode)!=0o600: os.close(lock); raise ValueError('admin_lock')
        self.lock=lock; fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        # Only metadata on reader. It is read by the independently approved Go
        # provider as aktau-sync, never by this administrative controller.
        parent=os.lstat('/var/lib/aktau-sync')
        if not stat.S_ISDIR(parent.st_mode) or (parent.st_uid,parent.st_gid,stat.S_IMODE(parent.st_mode))!=(self.uid,self.gid,0o755): raise ValueError('delegated_parent')
        self.statefd=os.open(STATE,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        s=os.fstat(self.statefd)
        if (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))!=(self.uid,self.gid,0o700): raise ValueError('operator_namespace')
        reader=os.stat('reader.dsn',dir_fd=self.statefd,follow_symlinks=False)
        if not stat.S_ISREG(reader.st_mode) or (reader.st_uid,reader.st_gid,stat.S_IMODE(reader.st_mode),reader.st_nlink)!=(self.uid,self.gid,0o600,1): raise ValueError('reader_metadata')
        self.recover_prior_boot()
        self.no_operator_actor()
        self.preflight_namespace()
        for p in [DEPLOYMENT,READY]:
            if os.path.lexists(p): raise ValueError('existing_attempt_authority')
        self.check_publisher()

    def spawn(self):
        self.outcome=None
        self.journal_save('starting')
        self.child=subprocess.Popen(NODE_COMMAND,env={},stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,close_fds=True)
        os.set_blocking(self.child.stdout.fileno(),False)
        self.selector.register(self.child.stdout,selectors.EVENT_READ)
        self.journal_save('starting')

    def no_operator_actor(self):
        p=subprocess.run(['/usr/bin/pgrep','-u',str(self.uid)],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env={},timeout=2)
        if p.returncode!=1: raise ValueError('operator_already_active')

    def read_ledger(self):
        directory=os.open('ledger',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=self.statefd)
        try:
            st=os.fstat(directory)
            if (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))!=(self.uid,self.gid,0o700): raise ValueError('ledger_directory_custody')
            try: fd=os.open('attempts.json',os.O_RDONLY|os.O_NOFOLLOW,dir_fd=directory)
            except FileNotFoundError: return []
            try:
                st=os.fstat(fd)
                if not stat.S_ISREG(st.st_mode) or (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode),st.st_nlink)!=(self.uid,self.gid,0o600,1) or st.st_size>4<<20: raise ValueError('ledger_custody')
                with os.fdopen(os.dup(fd),'rb') as f: raw=f.read((4<<20)+1)
                if len(raw)>4<<20: raise ValueError('ledger_capacity')
                return node_ledger_json(raw)
            finally: os.close(fd)
        finally: os.close(directory)

    def preflight_namespace(self):
        entries=self.read_ledger()
        if entries: ledger_verdict(entries,entries[-1].get('attemptId'))
        if set(os.listdir(STATE+'/ledger'))-{'attempts.json'}: raise ValueError('unknown_ledger_interlock')
        ids={e['attemptId'] for e in entries}
        for name in os.listdir(self.statefd):
            if name in ['reader.dsn','ledger']: continue
            if name not in ids: raise ValueError('unknown_attempt_resource')
            st=os.stat(name,dir_fd=self.statefd,follow_symlinks=False)
            if not stat.S_ISDIR(st.st_mode) or (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))!=(self.uid,self.gid,0o700): raise ValueError('historical_attempt_custody')
    def recover_prior_boot(self):
        if not os.path.lexists(ADMIN+'/current.json'): return
        old=root_json(ADMIN+'/current.json')
        if not exact(old,['version','attemptId','bootId','phase','atUTC','pid','invocationId','configurationSha256','outcome','owned']) or type(old['version']) is not int or old['version']!=1 or type(old['bootId']) is not str or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',old['bootId']) or old['phase'] not in ['starting','prepared','armed','observed','completed'] or type(old['atUTC']) is not int or type(old['owned']) is not dict or not set(old['owned'])<={DEPLOYMENT,READY} or type(old['invocationId']) is not str or not ID.fullmatch(old['invocationId']): raise ValueError('prior_journal_shape')
        if old.get('phase')=='completed': return
        if old['invocationId']==self.invocation or old.get('configurationSha256')!=digest(canonical(self.pin)): raise ValueError('prior_attempt_requires_reconciliation')
        # A different kernel boot proves the old processes and private pipes
        # cannot still exist. Refuse recovery alongside another service actor.
        p=subprocess.run(['/usr/bin/pgrep','-u',str(self.uid)],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env={},timeout=2)
        if p.returncode!=1 or p.stdout: raise ValueError('operator_active_during_recovery')
        self.exclusive_cgroup()
        ledger=STATE+'/ledger'; records=pathlib.Path(ledger+'/attempts.json')
        ledger_stat=os.lstat(ledger)
        if not stat.S_ISDIR(ledger_stat.st_mode) or (ledger_stat.st_uid,ledger_stat.st_gid,stat.S_IMODE(ledger_stat.st_mode))!=(self.uid,self.gid,0o700): raise ValueError('recovery_ledger_directory')
        if old.get('attemptId') is None and not os.path.lexists(records):
            self.recover_unarmed_start(old,[]); return
        fd=os.open(records,os.O_RDONLY|os.O_NOFOLLOW)
        try:
            st=os.fstat(fd)
            if not stat.S_ISREG(st.st_mode) or (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode),st.st_nlink)!=(self.uid,self.gid,0o600,1) or st.st_size>4<<20: raise ValueError('recovery_ledger_custody')
            with os.fdopen(os.dup(fd),'rb') as f: raw=f.read((4<<20)+1)
        finally: os.close(fd)
        entries=node_ledger_json(raw)
        if old.get('attemptId') is None and (not entries or entries[-1].get('state') in ['completed','inconclusive']):
            if entries: ledger_verdict(entries,entries[-1].get('attemptId'))
            self.recover_unarmed_start(old,entries); return
        if not entries: raise ValueError('recovery_ledger_shape')
        attempt=old.get('attemptId')
        if attempt is None:
            attempt=entries[-1].get('attemptId')
            if entries[-1].get('history',[{}])[0].get('atUTC',0)<old.get('atUTC',0): raise ValueError('unbound_prepared_attempt')
        if type(attempt) is not str or not ID.fullmatch(attempt): raise ValueError('recovery_attempt')
        restored=abandon_after_boot(entries,attempt,old.get('bootId'),self.boot,now_ms(),actors_gone=True)
        # Validate EVERY resource before moving any. Unknown names/types or
        # malformed state stay interlocked for administrative reconciliation.
        moves=[(str(records),'attempts.json')]
        for name in os.listdir(ledger):
            if name=='attempts.json': continue
            if name!='operator.lock' and not re.fullmatch(r'attempts\.json\.[a-f0-9]{32}\.pending',name): raise ValueError('foreign_recovery_ledger')
            path=ledger+'/'+name; s=os.lstat(path)
            if not stat.S_ISREG(s.st_mode) or (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink)!=(self.uid,self.gid,0o600,1) or s.st_size>4<<20: raise ValueError('foreign_recovery_file')
            moves.append((path,name))
        for path in [DEPLOYMENT,READY]:
            if not os.path.lexists(path): continue
            record=root_json(path)
            if record.get('attemptId')!=attempt or (path==READY and record.get('bootId')!=old.get('bootId')): raise ValueError('foreign_recovery_authority')
            moves.append((path,os.path.basename(path)))
        run=STATE+'/'+attempt
        if os.path.lexists(run):
            s=os.lstat(run)
            if not stat.S_ISDIR(s.st_mode) or (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))!=(self.uid,self.gid,0o700): raise ValueError('foreign_recovery_directory')
            for name in os.listdir(run):
                s=os.lstat(run+'/'+name)
                if name not in ['event.fifo','ready.sock','publisher.claim'] or (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))!=(self.uid,self.gid,0o600) or s.st_nlink!=1 or not ((name=='event.fifo' and stat.S_ISFIFO(s.st_mode)) or (name=='ready.sock' and stat.S_ISSOCK(s.st_mode)) or (name=='publisher.claim' and stat.S_ISREG(s.st_mode) and s.st_size<=4096)): raise ValueError('foreign_recovery_resource')
            moves.append((run,'attempt'))
        pins={p:identity(os.lstat(p)) for p,_ in moves}
        state_pin=identity(os.fstat(self.statefd)); ledger_pin=identity(ledger_stat)
        destination=ADMIN+'/recovered-'+attempt
        os.mkdir(destination,0o700) # existing destination is an interlock
        self.save_forensic(destination,'controller.json',old)
        for path,name in moves:
            if identity(os.lstat(STATE))!=state_pin or identity(os.lstat(ledger))!=ledger_pin: raise ValueError('recovery_parent_changed')
            if identity(os.lstat(path))!=pins[path] or os.path.lexists(destination+'/'+name): raise ValueError('recovery_resource_changed')
            os.rename(path,destination+'/'+name); self.sync_parent(path); self.sync_parent(destination+'/'+name)
        fd=os.open(records,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        try:
            os.fchown(fd,self.uid,self.gid)
            raw=canonical(restored); at=0
            while at<len(raw):
                n=os.write(fd,raw[at:])
                if n<1: raise ValueError('recovery_short_write')
                at+=n
            os.fsync(fd)
        finally: os.close(fd)
        self.sync_parent(str(records))
        self.attempt=attempt; self.journal_save('completed'); self.attempt=None

    def recover_unarmed_start(self,old,entries):
        # A durable root 'starting'/no-attempt journal proves ARM/READY was
        # never issued. Preserve uncommitted preparation, never replay it.
        if old['phase']!='starting' or old['attemptId'] is not None or any(os.path.lexists(p) for p in [READY,DEPLOYMENT]): raise ValueError('unarmed_start_unproven')
        ledger=STATE+'/ledger'; moves=[]
        for name in os.listdir(ledger):
            if name=='attempts.json': continue
            if name!='operator.lock' and not re.fullmatch(r'attempts\.json\.[a-f0-9]{32}\.pending',name): raise ValueError('foreign_unarmed_resource')
            p=ledger+'/'+name;s=os.lstat(p)
            if not stat.S_ISREG(s.st_mode) or (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink)!=(self.uid,self.gid,0o600,1) or s.st_size>4<<20: raise ValueError('foreign_unarmed_file')
            moves.append((p,name,identity(s)))
        parent=identity(os.lstat(ledger));self.check_namespace()
        dest=ADMIN+'/recovered-unarmed-'+old['invocationId'];os.mkdir(dest,0o700)
        self.save_forensic(dest,'controller.json',old);self.save_forensic(dest,'attempts.json',entries)
        for path,name,pin in moves:
            self.check_namespace()
            if identity(os.lstat(ledger))!=parent or identity(os.lstat(path))!=pin or os.path.lexists(dest+'/'+name): raise ValueError('unarmed_resource_changed')
            os.rename(path,dest+'/'+name);self.sync_parent(path);self.sync_parent(dest+'/'+name)
        self.journal_save('completed')

    @staticmethod
    def save_forensic(directory,name,value):
        if name not in ['controller.json','attempts.json','deployment-before.json','ready.json','deployment-after.json','result.json']: raise ValueError('forensic_name')
        fd=os.open(directory+'/'+name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        try:
            raw=canonical(value);at=0
            while at<len(raw):
                n=os.write(fd,raw[at:])
                if n<1: raise ValueError('forensic_short_write')
                at+=n
            os.fsync(fd)
        finally: os.close(fd)
        Custodian.sync_parent(directory+'/'+name)

    def exclusive_cgroup(self):
        # Kernel evidence, not a PID/lock filename. ProtectControlGroups keeps
        # the reviewed previous invocation's children in this service cgroup.
        if pathlib.Path('/proc/self/cgroup').read_text()!='0::/system.slice/aktau-c2-custodian.service\n': raise ValueError('systemd_cgroup')
        pids=pathlib.Path('/sys/fs/cgroup/system.slice/aktau-c2-custodian.service/cgroup.procs').read_text().split()
        if pids!=[str(os.getpid())]: raise ValueError('previous_actor_still_live')

    def receive(self,phase):
        deadline=min(self.deadline+7,time.monotonic()+(25 if phase in ['prepared','armed','final'] else 35*60))
        while time.monotonic()<deadline:
            if b'\n' in self.buffer:
                raw,self.buffer=self.buffer.split(b'\n',1)
                value=json.loads(raw)
                if canonical(value)!=raw+b'\n' or type(value) is not dict or not set(value)<= {'state','attemptId','acceptance','qualifiedPassCount','accepted','reconciliationRequired'}: raise ValueError('control_frame')
                return value
            if not self.selector.select(min(0.25,max(0,deadline-time.monotonic()))): continue
            chunk=os.read(self.child.stdout.fileno(),4097)
            if not chunk: raise ValueError('control_eof')
            self.buffer+=chunk
            if len(self.buffer)>4096: raise ValueError('control_bound')
        raise ValueError('supervision_deadline')

    def before(self,event):
        attempt=event.get('attemptId')
        if type(attempt) is not str or not ID.fullmatch(attempt): raise ValueError('attempt_identity')
        self.attempt=attempt; self.journal_save('prepared')
        self.evidence_dir=ADMIN+'/evidence-'+attempt
        os.mkdir(self.evidence_dir,0o700);self.sync_parent(self.evidence_dir)
        self.check_namespace()
        os.mkdir(attempt,mode=0o700,dir_fd=self.statefd)
        self.runfd=os.open(attempt,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=self.statefd)
        os.fchown(self.runfd,self.uid,self.gid)
        os.mkfifo('event.fifo',0o600,dir_fd=self.runfd)
        os.chown('event.fifo',self.uid,self.gid,dir_fd=self.runfd,follow_symlinks=False)
        self.fifo_identity=identity(os.stat('event.fifo',dir_fd=self.runfd,follow_symlinks=False))
        os.fsync(self.runfd); os.fsync(self.statefd)
        self.before_checked=now_ms()
        record=deployment_record(self.pin,attempt,'before',self.before_checked,False)
        self.atomic(DEPLOYMENT,record)
        self.save_forensic(self.evidence_dir,'deployment-before.json',record)

    def send(self,command):
        if command not in ['ARM','FINALIZE']: raise ValueError('control_command')
        self.child.stdin.write((command+'\n').encode()); self.child.stdin.flush()

    def ready(self,event):
        if event.get('attemptId')!=self.attempt: raise ValueError('wrong_attempt')
        self.check_files()
        self.check_publisher()
        self.check_namespace()
        pid=self.child.pid
        nodehash,cmd,ticks=self.live_process(pid,os.getpid(),NODE,NODE_COMMAND)
        readers=0
        for name in os.listdir('/proc/'+str(pid)+'/fd'):
            if not name.isdigit(): raise ValueError('process_fd_identity')
            try: st=os.stat('/proc/'+str(pid)+'/fd/'+name)
            except FileNotFoundError: continue
            if (st.st_dev,st.st_ino)==self.fifo_identity[:2]:
                info=pathlib.Path('/proc/'+str(pid)+'/fdinfo/'+name).read_text()
                flags=re.search(r'^flags:\s+([0-7]+)$',info,re.M)
                if not flags or int(flags[1],8)&os.O_ACCMODE!=os.O_RDONLY or not int(flags[1],8)&os.O_NONBLOCK: raise ValueError('fifo_reader_flags')
                readers+=1
        if readers!=1: raise ValueError('fifo_reader_not_open')
        children=pathlib.Path('/proc/'+str(pid)+'/task/'+str(pid)+'/children').read_text().split()
        if len(children)!=1 or not children[0].isdigit(): raise ValueError('ready_helper_identity')
        self.live_process(int(children[0]),pid,KIT+'/relayprobe',[KIT+'/relayprobe','ready-server',self.attempt])
        remaining=int(max(0,self.deadline-time.monotonic())*1000)
        if remaining<31000: raise ValueError('preparation_expired')
        record={'version':1,'attemptId':self.attempt,'sourceSha':self.policy['sourceSha'],'frontendSha':self.pin['frontendSha'],'deploymentId':self.pin['deploymentId'],'confirmedAt':iso(self.before_checked),'bootId':self.boot,'operatorUid':self.uid,'operatorGid':self.gid,'supervisorPid':pid,'supervisorStartTicks':ticks,'nodeExecutable':NODE,'nodeSha256':nodehash,'commandSha256':digest(cmd),'supervisorSha256':self.policy['files'][KIT+'/c2-production-supervisor.mjs'],'ingestSha256':self.policy['files']['/usr/local/libexec/aktau-c2-ingest'],'relaySha256':self.policy['files'][KIT+'/relayprobe'],'expiresAt':iso(min(self.before_checked+35*60000,now_ms()+remaining))}
        self.atomic(READY,record)
        self.save_forensic(self.evidence_dir,'ready.json',record)
        self.journal_save('armed')

    def live_process(self,pid,parent,executable,argv):
        prefix='/proc/'+str(pid)
        status=os.stat(prefix+'/status')
        raw=pathlib.Path(prefix+'/status').read_text()
        fields=dict(line.split(':',1) for line in raw.splitlines() if ':' in line)
        if status.st_uid!=0 or int(fields['PPid'])!=parent or fields['TracerPid'].strip()!='0' or any(int(x)!=self.uid for x in fields['Uid'].split()) or any(int(x)!=self.gid for x in fields['Gid'].split()) or any(int(fields[k],16)!=0 for k in ['CapEff','CapPrm','CapInh']): raise ValueError('unprotected_live_process')
        if os.readlink(prefix+'/exe')!=executable: raise ValueError('live_executable')
        with open(prefix+'/exe','rb') as f: nodehash=hashlib.file_digest(f,'sha256').hexdigest()
        cmd=pathlib.Path(prefix+'/cmdline').read_bytes()
        if nodehash!=self.policy['files'][executable] or cmd!=b'\0'.join(x.encode() for x in argv)+b'\0': raise ValueError('live_command')
        ticks=pathlib.Path(prefix+'/stat').read_text().rsplit(') ',1)[1].split()[19]
        if not re.fullmatch('[1-9][0-9]{0,19}',ticks): raise ValueError('live_start_ticks')
        return nodehash,cmd,ticks

    def notify(self):
        address=os.environ.get('NOTIFY_SOCKET','')
        if not address or (not address.startswith('/') and not address.startswith('@')): raise ValueError('systemd_notify')
        sock=socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM)
        try: sock.connect('\0'+address[1:] if address.startswith('@') else address); sock.sendall(b'READY=1\nSTATUS=C2 armed; Owner-pinned frontend configuration; awaiting ordinary publication')
        finally: sock.close()

    def after(self,event):
        if event.get('attemptId')!=self.attempt: raise ValueError('wrong_attempt')
        self.check_files()
        self.check_publisher()
        self.check_namespace()
        # Genuine Node observe() closes its helper before emitting OBSERVED.
        # Independently verify no live child or listening socket remains. The
        # same READY record remains untouched through final verdict validation.
        end=min(self.deadline+5,time.monotonic()+2)
        while True:
            children=pathlib.Path('/proc/'+str(self.child.pid)+'/task/'+str(self.child.pid)+'/children').read_text().strip()
            if not children and not os.path.lexists(STATE+'/'+self.attempt+'/ready.sock'): break
            if time.monotonic()>=end: raise ValueError('opt_in_cleanup_unverified')
            time.sleep(0.01)
        record=deployment_record(self.pin,self.attempt,'after',now_ms(),True)
        self.atomic(DEPLOYMENT,record)
        self.save_forensic(self.evidence_dir,'deployment-after.json',record)
        self.journal_save('observed')

    def finish(self,event):
        self.check_namespace()
        code=self.child.wait(timeout=3)
        clean_cancel=event.get('state')=='CANCELLED_INCONCLUSIVE'
        if code!=(1 if clean_cancel else 0) or event.get('reconciliationRequired',False): raise ValueError('child_cleanup')
        if os.path.lexists(STATE+'/ledger/operator.lock'): raise ValueError('ledger_still_locked')
        verdict,count=ledger_verdict(self.read_ledger(),self.attempt)
        if verdict!=('INCONCLUSIVE' if clean_cancel else event.get('acceptance')) or (not clean_cancel and (type(event.get('qualifiedPassCount')) is not int or event['qualifiedPassCount']!=count or event.get('accepted')!=(count>=3))): raise ValueError('verdict_ledger_mismatch')
        for p,(old,want) in self.owned.items():
            if p==ADMIN+'/current.json': continue
            if identity(os.lstat(p))!=old or digest(root_bytes(p))!=want: raise ValueError('changed_owned_record')
        if self.attempt:
            if os.path.lexists(STATE+'/'+self.attempt+'/ready.sock'): raise ValueError('socket_cleanup')
            if identity(os.stat('event.fifo',dir_fd=self.runfd,follow_symlinks=False))!=self.fifo_identity: raise ValueError('fifo_changed')
            os.unlink('event.fifo',dir_fd=self.runfd); os.fsync(self.runfd)
        for p in [READY,DEPLOYMENT]:
            if p in self.owned: os.unlink(p); self.sync_parent(p)
        self.outcome={'acceptance':verdict,'qualifiedPassCount':count,'identityEvidence':'owner-pinned-configuration'}
        if self.evidence_dir:self.save_forensic(self.evidence_dir,'result.json',self.outcome)
        self.journal_save('completed')

    def abort(self):
        # No restart, apply or speculative ledger/foreign-file deletion. An
        # unknown crash remains an explicit administrative interlock.
        if self.child and self.child.poll() is None:
            self.child.terminate()
            try: self.child.wait(timeout=7)
            except subprocess.TimeoutExpired: self.child.kill(); self.child.wait(timeout=3)
        # A known orderly signal cancellation has a real terminal ledger. Only
        # this explicit proof permits cleanup; SIGKILL/EOF/unknown state does not.
        if self.child and self.attempt:
            try:
                event=self.receive('final')
                if event=={'state':'CANCELLED_INCONCLUSIVE','acceptance':'INCONCLUSIVE'}: self.finish(event)
            except Exception: pass


def main():
    io=Custodian()
    def stopping(signum,frame): raise InterruptedError('systemd_stop')
    signal.signal(signal.SIGTERM,stopping); signal.signal(signal.SIGINT,stopping)
    try:
        if sys.argv!=[SELF]: raise ValueError('fixed_root_entry_only')
        event=run_cycle(io)
        safe={k:event[k] for k in ['state','acceptance','qualifiedPassCount','accepted'] if k in event}
        safe['identityEvidence']='owner-pinned-configuration'
        print(json.dumps(safe,separators=(',',':')),flush=True)
        return 0
    except Exception as e:
        if isinstance(e,InterruptedError) and io.journal and io.journal.get('phase')=='completed':
            print(json.dumps({'state':'C2_CANCELLED_INCONCLUSIVE','acceptance':'INCONCLUSIVE','identityEvidence':'owner-pinned-configuration'},separators=(',',':')),flush=True)
            return 0
        code=str(e) if type(e) is ValueError and re.fullmatch(r'[a-z_]{1,64}',str(e)) else None
        print(json.dumps({'state':'C2_NOT_ARMED_OR_RECONCILIATION_REQUIRED','errorClass':type(e).__name__,'errorCode':code},separators=(',',':')),flush=True)
        return 1


if __name__=='__main__': sys.exit(main())
