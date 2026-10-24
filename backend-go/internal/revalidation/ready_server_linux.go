//go:build linux

package revalidation

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

var errReady = errors.New("ready")
var errReadyCleanup = errors.New("ready_cleanup_unverified")

// RunReadyServer is an operator child, not a service. One connection and one
// bounded request only. The parent's private stdin authorizes no other command.
func RunReadyServer(id string, input io.Reader, output io.Writer) error {
	if !ValidAttemptID(id) {
		return errors.New("ready")
	}
	// Prevent same-UID /proc/fd and memory access to the private parent pipe.
	if unix.Prctl(unix.PR_SET_DUMPABLE, 0, 0, 0, 0) != nil {
		return errors.New("ready")
	}
	parent, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	ctx, cancel := context.WithTimeout(parent, 35*time.Minute)
	defer cancel()
	err := serveReadySocket(ctx, "/var/lib/aktau-sync/c2/"+id+"/ready.sock", id, input, output)
	// Exit0 certifies OWN resource cleanup only, never READY or observation.
	// A rejected/canceled exchange still cannot authorize the Go client.
	if errors.Is(err, errReadyCleanup) {
		return err
	}
	return nil
}

func serveReadySocket(parentCtx context.Context, path, id string, input io.Reader, output io.Writer) (outcome error) {
	reject := func() error { return errReady }
	ctx, cancel := context.WithCancel(parentCtx)
	defer cancel()
	type response struct {
		raw   []byte
		err   error
		extra bool
	}
	result := make(chan response, 1)
	closed := make(chan bool, 1)
	// Parent EOF cancels even a listener awaiting its sole client. Never leave
	// a live helper after supervisor death merely because no request arrived.
	go func() {
		r := bufio.NewReaderSize(input, ReadyLimit+1)
		b, e := r.ReadSlice('\n')
		result <- response{append([]byte(nil), b...), e, r.Buffered() != 0}
		if e != nil {
			cancel()
			return
		}
		extra, e := r.ReadByte()
		_ = extra
		clean := e == io.EOF
		closed <- clean
		if !clean {
			cancel()
		}
	}()
	parent, safe := privateParent(path, unix.Lstat)
	if !safe || parent.Mode&07777 != 0700 || parent.Gid != uint32(os.Getegid()) {
		return errReadyCleanup
	}
	dir, err := unix.Open(filepath.Dir(path), unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
	if err != nil {
		return errReadyCleanup
	}
	defer unix.Close(dir)
	var pinned unix.Stat_t
	if unix.Fstat(dir, &pinned) != nil || pinned.Dev != parent.Dev || pinned.Ino != parent.Ino || pinned.Mode != parent.Mode || pinned.Uid != parent.Uid || pinned.Gid != parent.Gid {
		return errReadyCleanup
	}
	var existing unix.Stat_t
	if e := unix.Fstatat(dir, filepath.Base(path), &existing, unix.AT_SYMLINK_NOFOLLOW); e != unix.ENOENT {
		return errReadyCleanup
	}
	// Bind through the pinned parent; never reopen a raceable parent pathname.
	address := &net.UnixAddr{Name: "/proc/self/fd/" + strconv.Itoa(dir) + "/" + filepath.Base(path), Net: "unix"}
	// Isolated helper process: create0600 atomically, never chmod a name that
	// might have been replaced after bind. Restore the prior process umask.
	mask := unix.Umask(0o177)
	listener, err := net.ListenUnix("unix", address)
	unix.Umask(mask)
	if err != nil {
		return errReadyCleanup
	}
	listener.SetUnlinkOnClose(false)
	defer listener.Close()
	var owned unix.Stat_t
	if unix.Fstatat(dir, filepath.Base(path), &owned, unix.AT_SYMLINK_NOFOLLOW) != nil || owned.Mode&unix.S_IFMT != unix.S_IFSOCK || owned.Mode&07777 != 0600 || owned.Uid != uint32(os.Geteuid()) || owned.Gid != uint32(os.Getegid()) || owned.Nlink != 1 {
		return errReadyCleanup
	}
	defer func() {
		if errors.Is(outcome, errReadyCleanup) {
			return
		}
		var current unix.Stat_t
		if unix.Fstatat(dir, filepath.Base(path), &current, unix.AT_SYMLINK_NOFOLLOW) != nil || current.Dev != owned.Dev || current.Ino != owned.Ino || current.Mode != owned.Mode || current.Uid != owned.Uid || current.Gid != owned.Gid || current.Nlink != owned.Nlink {
			outcome = errReadyCleanup
			return
		}
		if unix.Unlinkat(dir, filepath.Base(path), 0) != nil || unix.Fsync(dir) != nil {
			outcome = errReadyCleanup
		}
	}()
	if unix.Fsync(dir) != nil {
		return reject()
	}
	after, safe := socketReadyStat(path)
	if !safe || after.Ino != owned.Ino || after.Dev != owned.Dev {
		return errReadyCleanup
	}
	stop := context.AfterFunc(ctx, func() { _ = listener.Close() })
	defer stop()
	if deadline, ok := ctx.Deadline(); ok {
		_ = listener.SetDeadline(deadline)
	}
	if _, err = io.WriteString(output, "{\"state\":\"listening\"}\n"); err != nil {
		return reject()
	}
	conn, err := listener.AcceptUnix()
	if err != nil {
		return reject()
	}
	defer conn.Close()
	stopConn := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stopConn()
	// The reviewed READY-only5000ms starts at accept, never resets the client's
	// earlier admission deadline, and cannot extend the original35min parent.
	deadline := time.Now().Add(ReadyBudget)
	if end, ok := ctx.Deadline(); ok && end.Before(deadline) {
		deadline = end
	}
	if conn.SetDeadline(deadline) != nil {
		return reject()
	}
	control, err := conn.SyscallConn()
	if err != nil {
		return reject()
	}
	var peer Peer
	var peerErr error
	if control.Control(func(fd uintptr) { peer, peerErr = PeerIdentity(int(fd)) }) != nil || peerErr != nil {
		return reject()
	}
	raw, err := io.ReadAll(io.LimitReader(conn, ReadyLimit+1))
	if err != nil {
		return reject()
	}
	var req ReadyRequest
	if !canonicalReady(raw, &req) || req.Version != 1 || req.AttemptID != id || !ValidAttemptID(req.Nonce) {
		return reject()
	}
	frame := struct {
		State   string       `json:"state"`
		Request ReadyRequest `json:"request"`
		Peer    Peer         `json:"peer"`
	}{"request", req, peer}
	if json.NewEncoder(output).Encode(frame) != nil {
		return reject()
	}
	// One parent response, inside the same accepted-connection window.
	timer := time.NewTimer(time.Until(deadline))
	defer timer.Stop()
	var answer response
	select {
	case <-ctx.Done():
		return reject()
	case <-timer.C:
		return reject()
	case answer = <-result:
	}
	var ack ReadyResponse
	if answer.err != nil || answer.extra || !canonicalReady(answer.raw, &ack) || !validReadyResponse(ack, req, time.Now()) {
		return reject()
	}
	current, safe := socketReadyStat(path)
	if !safe || current.Ino != owned.Ino || current.Dev != owned.Dev {
		return errReadyCleanup
	}
	if ctx.Err() != nil || !time.Now().Before(deadline) {
		return reject()
	}
	n, err := conn.Write(answer.raw)
	if err != nil || n != len(answer.raw) {
		return reject()
	}
	_ = conn.Close()
	_ = listener.Close()
	if _, err = io.WriteString(output, "{\"state\":\"delivered\"}\n"); err != nil {
		return reject()
	}
	// Keep the inode until parent-owned cleanup so the receiving Go process
	// can independently verify it after EOF. There is no second Unix request.
	select {
	case <-ctx.Done():
		return reject()
	case clean := <-closed:
		if !clean {
			return reject()
		}
	}
	return nil
}
