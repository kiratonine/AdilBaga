//go:build linux

package revalidation

import (
	"errors"
	"golang.org/x/sys/unix"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func MonotonicNS() (string, error) {
	var ts unix.Timespec
	if err := unix.ClockGettime(unix.CLOCK_MONOTONIC, &ts); err != nil {
		return "", err
	}
	return strconv.FormatInt(ts.Nano(), 10), nil
}
func BootID() (string, error) {
	b, err := os.ReadFile("/proc/sys/kernel/random/boot_id")
	v := strings.TrimSpace(string(b))
	if err != nil || !uuidPattern.MatchString(v) {
		return "", errors.New("boot unavailable")
	}
	return v, nil
}

// Parent is private; all ancestors reject symlinks and untrusted writable dirs.
func privateParent(path string, lstat func(string, *unix.Stat_t) error) (unix.Stat_t, bool) {
	var parentStat unix.Stat_t
	if !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return parentStat, false
	}
	parent := filepath.Dir(path)
	for p := parent; ; p = filepath.Dir(p) {
		var st unix.Stat_t
		if lstat(p, &st) != nil || st.Mode&unix.S_IFMT != unix.S_IFDIR || (st.Uid != 0 && st.Uid != uint32(os.Geteuid())) {
			return parentStat, false
		}
		if p == parent && (st.Uid != uint32(os.Geteuid()) || st.Mode&0777 != 0700) {
			return parentStat, false
		}
		if st.Mode&0022 != 0 && !(st.Uid == 0 && st.Mode&unix.S_ISVTX != 0) {
			return parentStat, false
		}
		if p == parent {
			parentStat = st
		}
		if p == "/" {
			break
		}
	}
	return parentStat, true
}

// One nonblocking atomic-sized write, no retries, never opens a regular file.
func Relay(path string, event RelayEvent) string { return relayWrite(path, event, unix.Write) }
func relayWrite(path string, event RelayEvent, write func(int, []byte) (int, error)) string {
	return relayOpen(path, event, write, unix.Open)
}

// The injected opener permits a deterministic parent-swap regression test.
func relayOpen(path string, event RelayEvent, write func(int, []byte) (int, error), open func(string, int, uint32) (int, error)) string {
	b := eventBytes(event)
	parentStat, safe := privateParent(path, unix.Lstat)
	if b == nil || !safe {
		return "skipped"
	}
	dir, err := open(filepath.Dir(path), unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
	if err != nil {
		return "skipped"
	}
	defer unix.Close(dir)
	var openedParent unix.Stat_t
	if unix.Fstat(dir, &openedParent) != nil || openedParent.Mode&unix.S_IFMT != unix.S_IFDIR || openedParent.Uid != uint32(os.Geteuid()) || openedParent.Mode&07777 != 0700 || openedParent.Dev != parentStat.Dev || openedParent.Ino != parentStat.Ino || openedParent.Uid != parentStat.Uid || openedParent.Gid != parentStat.Gid || openedParent.Mode != parentStat.Mode {
		return "skipped"
	}
	var before unix.Stat_t
	if unix.Fstatat(dir, filepath.Base(path), &before, unix.AT_SYMLINK_NOFOLLOW) != nil || before.Mode&unix.S_IFMT != unix.S_IFIFO || before.Mode&0777 != 0600 || before.Uid != uint32(os.Geteuid()) {
		return "skipped"
	}
	fd, err := unix.Openat(dir, filepath.Base(path), unix.O_WRONLY|unix.O_NONBLOCK|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
	if err != nil {
		return "skipped"
	}
	defer unix.Close(fd)
	var after unix.Stat_t
	if unix.Fstat(fd, &after) != nil || after.Ino != before.Ino || after.Dev != before.Dev || after.Mode != before.Mode || after.Uid != before.Uid {
		return "skipped"
	}
	n, err := write(fd, b)
	if err != nil || n != len(b) {
		return "skipped"
	}
	return "sent"
}
