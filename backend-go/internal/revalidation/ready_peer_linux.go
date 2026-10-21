//go:build linux

package revalidation

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"strconv"

	"golang.org/x/sys/unix"
)

// PeerIdentity reports kernel SO_PEERCRED on an inherited connected socket.
// It accepts no path, executable, URL, environment or caller-declared identity.
func PeerIdentity(fd int) (Peer, error) {
	var out Peer
	p, err := unix.GetsockoptUcred(fd, unix.SOL_SOCKET, unix.SO_PEERCRED)
	if err != nil {
		return out, errors.New("peer")
	}
	typ, err := unix.GetsockoptInt(fd, unix.SOL_SOCKET, unix.SO_TYPE)
	if err != nil || typ != unix.SOCK_STREAM {
		return out, errors.New("peer")
	}
	addr, err := unix.Getpeername(fd)
	if err != nil {
		return out, errors.New("peer")
	}
	if _, ok := addr.(*unix.SockaddrUnix); !ok {
		return out, errors.New("peer")
	}
	f, err := os.Open("/proc/" + strconv.Itoa(int(p.Pid)) + "/exe")
	if err != nil {
		return out, errors.New("peer")
	}
	defer f.Close()
	var st unix.Stat_t
	if unix.Fstat(int(f.Fd()), &st) != nil || st.Mode&unix.S_IFMT != unix.S_IFREG || st.Size < 4 || st.Size > 256<<20 {
		return out, errors.New("peer")
	}
	h := sha256.New()
	if _, err = io.Copy(h, io.LimitReader(f, 256<<20+1)); err != nil {
		return out, errors.New("peer")
	}
	boot, err := BootID()
	if err != nil {
		return out, errors.New("peer")
	}
	return Peer{int(p.Pid), int(p.Uid), int(p.Gid), hex.EncodeToString(h.Sum(nil)), st.Uid == 0 && st.Mode&0022 == 0, boot}, nil
}
