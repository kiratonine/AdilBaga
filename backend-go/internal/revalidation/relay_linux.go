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
func privateParent(path string) bool {
	if !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return false
	}
	parent := filepath.Dir(path)
	for p := parent; ; p = filepath.Dir(p) {
		var st unix.Stat_t
		if unix.Lstat(p, &st) != nil || st.Mode&unix.S_IFMT != unix.S_IFDIR {
			return false
		}
		if p == parent && (st.Uid != uint32(os.Geteuid()) || st.Mode&0777 != 0700) {
			return false
		}
		if st.Mode&0022 != 0 && !(st.Uid == 0 && st.Mode&unix.S_ISVTX != 0) {
			return false
		}
		if p == "/" {
			break
		}
	}
	return true
}

// One nonblocking atomic-sized write, no retries, never opens a regular file.
func Relay(path string, event RelayEvent) string { return relayWrite(path, event, unix.Write) }
func relayWrite(path string, event RelayEvent, write func(int, []byte) (int, error)) string {
	b := eventBytes(event)
	if b == nil || !privateParent(path) {
		return "skipped"
	}
	dir, err := unix.Open(filepath.Dir(path), unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
	if err != nil {
		return "skipped"
	}
	defer unix.Close(dir)
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
