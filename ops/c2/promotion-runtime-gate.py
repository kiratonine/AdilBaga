#!/usr/bin/python3
"""Fixed shared-lock wrapper for existing services. No scheduling/publication."""
import fcntl
import os
import pathlib
import pwd
import stat
import sys
import time

BASE = '/var/lib/aktau-sync-promotion'
COMMANDS = {
    'daily': ['/usr/bin/bash', 'pipeline/scripts/daily-sync.sh'],
    'weekly': ['/usr/bin/bash', 'pipeline/scripts/weekly-full-scrape.sh'],
    'c2': ['/usr/bin/python3', '-I', '-B', '/usr/local/libexec/aktau-c2-custodian.py'],
}


def acquire(kind):
    if kind not in COMMANDS:
        raise ValueError('fixed_role')
    uid = 0 if kind == 'c2' else pwd.getpwnam('aktau-sync').pw_uid
    if os.getuid() != uid or os.geteuid() != uid:
        raise ValueError('runtime_identity')
    for parent in [pathlib.Path(BASE), *pathlib.Path(BASE).parents]:
        s = parent.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o022:
            raise ValueError('runtime_custody')
    fd = os.open(BASE + '/runtime.lock', os.O_RDONLY | os.O_NOFOLLOW)
    s = os.fstat(fd)
    if not stat.S_ISREG(s.st_mode) or s.st_uid != 0 or s.st_nlink != 1 or stat.S_IMODE(s.st_mode) != 0o644:
        os.close(fd)
        raise ValueError('runtime_lock')
    end = time.monotonic() + (20 if kind == 'c2' else 120)
    while True:
        try:
            fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
            break
        except BlockingIOError:
            if time.monotonic() >= end:
                os.close(fd)
                raise ValueError('promotion_busy')
            time.sleep(.05)
    if os.path.lexists(BASE + '/interlock.json'):
        os.close(fd)
        raise ValueError('promotion_reconciliation_required')
    os.set_inheritable(fd, True)
    return fd


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        raise ValueError('fixed_role')
    acquire(sys.argv[1])
    # Keep original service environment and business exit semantics. No fork:
    # actual custodian/notify PID and the shared lock survive exec unchanged.
    os.execv(COMMANDS[sys.argv[1]][0], COMMANDS[sys.argv[1]])


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        print('BLOCKED_PROMOTION_RUNTIME_GATE', file=sys.stderr)
        sys.exit(78)
