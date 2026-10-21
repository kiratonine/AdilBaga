//go:build linux

package revalidation

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

func TestReadyServerOwnCleanupAndForeignReplacement(t *testing.T) {
	for _, foreign := range []bool{false, true} {
		dir, err := os.MkdirTemp("", "c2r-")
		if err != nil {
			t.Fatal(err)
		}
		defer os.RemoveAll(dir)
		path := filepath.Join(dir, "ready.sock")
		in, write := io.Pipe()
		out, output := io.Pipe()
		ctx, cancel := context.WithCancel(context.Background())
		result := make(chan error, 1)
		go func() { result <- serveReadySocket(ctx, path, strings.Repeat("a", 32), in, output) }()
		line, e := bufio.NewReader(out).ReadString('\n')
		if e != nil || line != "{\"state\":\"listening\"}\n" {
			t.Fatal("not listening")
		}
		if foreign {
			if os.Rename(path, path+".owned") != nil || os.WriteFile(path, []byte("foreign"), 0600) != nil {
				t.Fatal("replacement")
			}
		}
		cancel()
		select {
		case err := <-result:
			if foreign != errors.Is(err, errReadyCleanup) {
				t.Fatal("cleanup certainty did not match resource custody")
			}
		case <-time.After(time.Second):
			t.Fatal("cancel failed")
		}
		if foreign {
			raw, e := os.ReadFile(path)
			if e != nil || string(raw) != "foreign" {
				t.Fatal("foreign resource removed")
			}
		} else if _, e := os.Lstat(path); !os.IsNotExist(e) {
			t.Fatal("own socket not cleaned")
		}
		_ = write.Close()
		_ = output.Close()
		_ = out.Close()
		_ = in.Close()
	}
}

func TestReadyServerParentDeathAndOrphan(t *testing.T) {
	for _, orphan := range []bool{false, true} {
		dir, err := os.MkdirTemp("", "c2r-")
		if err != nil {
			t.Fatal(err)
		}
		defer os.RemoveAll(dir)
		path := filepath.Join(dir, "ready.sock")
		if orphan && os.WriteFile(path, []byte("unregistered"), 0600) != nil {
			t.Fatal("orphan fixture")
		}
		input, writer := io.Pipe()
		output, reader := io.Pipe()
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		result := make(chan error, 1)
		go func() {
			defer reader.Close()
			result <- serveReadySocket(ctx, path, strings.Repeat("a", 32), input, reader)
		}()
		if !orphan {
			if line, e := bufio.NewReader(output).ReadString('\n'); e != nil || line != "{\"state\":\"listening\"}\n" {
				t.Fatal("listener readiness")
			}
		}
		_ = writer.Close() // actual parent EOF, not a cancellation-only model
		select {
		case err := <-result:
			if orphan != errors.Is(err, errReadyCleanup) {
				t.Fatal("orphan certainty")
			}
		case <-time.After(500 * time.Millisecond):
			t.Fatal("helper survived parent EOF")
		}
		cancel()
		_ = input.Close()
		_ = reader.Close()
		_ = output.Close()
		if orphan {
			b, e := os.ReadFile(path)
			if e != nil || string(b) != "unregistered" {
				t.Fatal("foreign orphan changed")
			}
		} else if _, e := os.Lstat(path); !os.IsNotExist(e) {
			t.Fatal("own socket remains")
		}
	}
}

// Only the Go test executable exposes this local helper. The production CLI
// has no path/env override or synthetic authority factory.
func TestReadyHelperProcess(t *testing.T) {
	if os.Getenv("PART32_TEST_HELPER") != "1" {
		return
	}
	path := os.Getenv("PART32_TEST_SOCKET")
	id := os.Getenv("PART32_TEST_ATTEMPT")
	if !strings.HasPrefix(path, filepath.Join(os.TempDir(), "c2r-")) || filepath.Base(path) != "ready.sock" || !ValidAttemptID(id) {
		os.Exit(2)
	}
	if os.Getenv("PART32_TEST_PROTECT") == "1" && unix.Prctl(unix.PR_SET_DUMPABLE, 0, 0, 0, 0) != nil {
		os.Exit(2)
	}
	parent, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(parent, 10*time.Second)
	defer cancel()
	if serveReadySocket(ctx, path, id, os.Stdin, os.Stdout) != nil {
		os.Exit(1)
	}
	os.Exit(0)
}

func TestReadyNonDumpablePipeCustody(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Fatal("test must run non-root")
	}
	dir, e := os.MkdirTemp("", "c2r-")
	if e != nil {
		t.Fatal(e)
	}
	defer os.RemoveAll(dir)
	binary, e := os.Executable()
	if e != nil {
		t.Fatal(e)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, binary, "-test.run=^TestReadyHelperProcess$")
	cmd.Env = []string{"PART32_TEST_HELPER=1", "PART32_TEST_PROTECT=1", "PART32_TEST_SOCKET=" + filepath.Join(dir, "ready.sock"), "PART32_TEST_ATTEMPT=" + strings.Repeat("a", 32)}
	stdin, e := cmd.StdinPipe()
	if e != nil {
		t.Fatal(e)
	}
	defer stdin.Close()
	out, e := cmd.StdoutPipe()
	if e != nil {
		t.Fatal(e)
	}
	if cmd.Start() != nil {
		t.Fatal("protected child")
	}
	defer cmd.Process.Kill()
	var listening map[string]string
	if json.NewDecoder(out).Decode(&listening) != nil || listening["state"] != "listening" {
		t.Fatal("protected listener")
	}
	start, command, _, e := protectedReadyProcess(cmd.Process.Pid)
	if e != nil || start == "" || command == "" {
		var st unix.Stat_t
		statErr := unix.Stat(fmt.Sprintf("/proc/%d", cmd.Process.Pid), &st)
		_, readStatErr := os.ReadFile(fmt.Sprintf("/proc/%d/stat", cmd.Process.Pid))
		_, readCmdErr := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", cmd.Process.Pid))
		t.Fatalf("protected metadata: stat_ok=%t root_owner=%t birth_readable=%t command_readable=%t", statErr == nil, st.Uid == 0, readStatErr == nil, readCmdErr == nil)
	}
	file, e := os.Open(fmt.Sprintf("/proc/%d/fd/0", cmd.Process.Pid))
	if e == nil {
		file.Close()
		t.Fatal("same-UID process could access private helper pipe")
	}
	if !os.IsPermission(e) {
		t.Fatal("expected kernel permission denial")
	}
	_ = cmd.Process.Signal(syscall.SIGTERM)
	_ = cmd.Wait()
	if _, e = os.Lstat(filepath.Join(dir, "ready.sock")); !os.IsNotExist(e) {
		t.Fatal("protected own socket cleanup failed")
	}
}

func TestReadyRealGoNodeRoundTrip(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Fatal("Node24 required for real READY IPC regression")
	}
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	dir, err := os.MkdirTemp("", "c2r-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	a := readyAuthority{Version: 1, AttemptID: strings.Repeat("a", 32), SourceSHA: strings.Repeat("b", 40), FrontendSHA: strings.Repeat("c", 40), DeploymentID: "dpl_local", ConfirmedAt: time.Now().Add(-time.Second).UTC().Format(readyTime), ExpiresAt: time.Now().Add(time.Minute).UTC().Format(readyTime), OperatorUID: os.Geteuid(), OperatorGID: os.Getegid(), BootID: "11111111-1111-1111-1111-111111111111"}
	config, _ := json.Marshal(a)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	script, err := filepath.Abs("../../../scripts/revalidation/fixtures/ready-parent.mjs")
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.CommandContext(ctx, node, script, binary, dir, string(config))
	cmd.Env = []string{"PATH=" + os.Getenv("PATH")}
	control, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		t.Fatal(err)
	}
	if cmd.Start() != nil {
		t.Fatal("Node fixture start")
	}
	defer func() { _ = cmd.Process.Kill(); _, _ = io.Copy(io.Discard, stderr) }()
	var start struct {
		PID int `json:"pid"`
	}
	decoder := json.NewDecoder(stdout)
	if decoder.Decode(&start) != nil || start.PID < 1 {
		t.Fatal("Node did not arm Go listener")
	}
	a.SupervisorPID = start.PID
	ipc, cancelIPC := context.WithTimeout(ctx, ReadyBudget)
	defer cancelIPC()
	begin := time.Now()
	ticket := requestReady(ipc, filepath.Join(dir, "ready.sock"), a.AttemptID, a, func() bool { return true })
	if ticket == nil {
		t.Fatal("actual Go/Node Unix exchange rejected")
	}
	at, _ := time.Parse(readyTime, "2026-10-21T00:00:00.000Z")
	if !ticket.BindBaseline("bbbbbbbb-0000-4000-8000-000000000000", at) {
		t.Fatal("baseline")
	}
	if _, err = io.WriteString(control, "CLOSE\n"); err != nil {
		t.Fatal(err)
	}
	_ = control.Close()
	var end struct {
		Delivered   bool `json:"delivered"`
		PeerMatched bool `json:"peerMatched"`
	}
	if decoder.Decode(&end) != nil || !end.Delivered || !end.PeerMatched {
		t.Fatal("Node delivery/peer proof")
	}
	if cmd.Wait() != nil {
		t.Fatal("Node fixture failed")
	}
	t.Logf("actual Go/Node IPC duration_ms=%d (synthetic namespace, not production authority)", time.Since(begin).Milliseconds())
}
