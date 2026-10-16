//go:build linux

package revalidation

import (
	"golang.org/x/sys/unix"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func fixtureEvent(t *testing.T) RelayEvent {
	t.Helper()
	boot, err := BootID()
	if err != nil {
		t.Fatal(err)
	}
	mono, err := MonotonicNS()
	if err != nil {
		t.Fatal(err)
	}
	return Event("11111111-1111-4111-8111-111111111111", "0123456789abcdef0123456789abcdef", Attempt{204, mono, mono, boot, "none"})
}
func fifoFixture(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.Chmod(dir, 0700); err != nil {
		t.Fatal(err)
	}
	fifo := filepath.Join(dir, "event")
	if err := unix.Mkfifo(fifo, 0600); err != nil {
		t.Fatal(err)
	}
	return fifo
}
func TestRelayNoReaderOrMissing(t *testing.T) {
	fifo := fifoFixture(t)
	event := fixtureEvent(t)
	started := time.Now()
	if Relay(fifo, event) != "skipped" || Relay(filepath.Join(filepath.Dir(fifo), "missing"), event) != "skipped" {
		t.Fatal("unsafe relay")
	}
	if time.Since(started) > time.Second {
		t.Fatal("blocked without reader")
	}
}
func TestRelayAtomicAndShortWrite(t *testing.T) {
	fifo := fifoFixture(t)
	event := fixtureEvent(t)
	fd, err := unix.Open(fifo, unix.O_RDONLY|unix.O_NONBLOCK, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer unix.Close(fd)
	if Relay(fifo, event) != "sent" {
		t.Fatal("relay failed")
	}
	buf := make([]byte, 4097)
	n, err := unix.Read(fd, buf)
	if err != nil || string(buf[:n]) != string(eventBytes(event)) {
		t.Fatal("atomic event mismatch")
	}
	writes := 0
	if relayWrite(fifo, event, func(_ int, b []byte) (int, error) { writes++; return len(b) - 1, nil }) != "skipped" || writes != 1 {
		t.Fatal("partial write retried/accepted")
	}
	if relayWrite(fifo, event, func(_ int, b []byte) (int, error) { return 0, io.ErrClosedPipe }) != "skipped" {
		t.Fatal("reader crash accepted")
	}
}
func TestRelayFullPipe(t *testing.T) {
	fifo := fifoFixture(t)
	event := fixtureEvent(t)
	fd, err := unix.Open(fifo, unix.O_RDWR|unix.O_NONBLOCK, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer unix.Close(fd)
	for {
		_, err = unix.Write(fd, make([]byte, 4096))
		if err != nil {
			break
		}
	}
	started := time.Now()
	if Relay(fifo, event) != "skipped" {
		t.Fatal("full pipe accepted")
	}
	if time.Since(started) > time.Second {
		t.Fatal("full pipe blocked")
	}
}
func TestRelayRejectsUnsafePaths(t *testing.T) {
	fifo := fifoFixture(t)
	event := fixtureEvent(t)
	dir := filepath.Dir(fifo)
	regular := filepath.Join(dir, "regular")
	if err := os.WriteFile(regular, []byte("untouched"), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "link")
	if err := os.Symlink(fifo, link); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{regular, link} {
		if Relay(p, event) != "skipped" {
			t.Fatal("unsafe path accepted")
		}
	}
	if err := os.Chmod(fifo, 0666); err != nil {
		t.Fatal(err)
	}
	if Relay(fifo, event) != "skipped" {
		t.Fatal("unsafe permissions")
	}
	b, _ := os.ReadFile(regular)
	if string(b) != "untouched" {
		t.Fatal("regular file modified")
	}
	if err := os.Chmod(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if Relay(fifo, event) != "skipped" {
		t.Fatal("nonprivate parent")
	}
}

func TestRelayAncestorOwner(t *testing.T) {
	fifo := fifoFixture(t)
	for _, uid := range []uint32{0, uint32(os.Geteuid()), uint32(os.Geteuid()) + 12345} {
		_, safe := privateParent(fifo, func(p string, st *unix.Stat_t) error {
			if err := unix.Lstat(p, st); err != nil {
				return err
			}
			if p == filepath.Dir(filepath.Dir(fifo)) {
				st.Uid = uid
				st.Mode = unix.S_IFDIR | 0755
			}
			return nil
		})
		if safe != (uid == 0 || uid == uint32(os.Geteuid())) {
			t.Fatal("ancestor owner policy bypass")
		}
	}
}

func TestRelayParentRevalidatedAfterOpen(t *testing.T) {
	for _, swap := range []bool{true, false} {
		t.Run(map[bool]string{true: "inode_swap", false: "mode_change"}[swap], func(t *testing.T) {
			fifo := fifoFixture(t)
			parent := filepath.Dir(fifo)
			writes := 0
			reader := -1
			defer func() {
				if reader >= 0 {
					_ = unix.Close(reader)
				}
			}()
			class := relayOpen(fifo, fixtureEvent(t), func(_ int, b []byte) (int, error) { writes++; return len(b), nil }, func(p string, flags int, mode uint32) (int, error) {
				if swap {
					if err := os.Rename(parent, parent+"-moved"); err != nil {
						t.Fatal(err)
					}
					if err := os.Mkdir(parent, 0700); err != nil {
						t.Fatal(err)
					}
					if err := unix.Mkfifo(fifo, 0600); err != nil {
						t.Fatal(err)
					}
				} else {
					if err := os.Chmod(parent, 0755); err != nil {
						t.Fatal(err)
					}
				}
				var err error
				reader, err = unix.Open(fifo, unix.O_RDWR|unix.O_NONBLOCK, 0)
				if err != nil {
					t.Fatal(err)
				}
				return unix.Open(p, flags, mode)
			})
			if class != "skipped" || writes != 0 {
				t.Fatal("directory validation-to-open bypass")
			}
		})
	}
}
