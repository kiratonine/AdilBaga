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
	return Event("11111111-1111-4111-8111-111111111111", AttemptID(), Attempt{204, mono, mono, boot, "none"})
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
