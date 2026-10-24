//go:build linux && readyqualification

package revalidation

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Explicit heavy profile: actual ELF bytes and Go helper/Node, synthetic root
// authority. It never invokes ingest, DB, HTTP, production paths or a provider.
const largeReadyParent = `
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';
const [moduleURL,binary,dir,raw]=process.argv.slice(1),a=JSON.parse(raw);
const {openReadyRelay}=await import(moduleURL);
assert.ok(path.basename(dir).startsWith('c2r-'));assert.equal(fs.statSync(dir).mode&511,448);
const child=spawn(binary,['-test.run=^TestReadyHelperProcess$'],{env:{GORACE:'atexit_sleep_ms=0',PART32_TEST_HELPER:'1',PART32_TEST_SOCKET:path.join(dir,'ready.sock'),PART32_TEST_ATTEMPT:a.attemptId},stdio:['pipe','pipe','ignore']});
const relay=await openReadyRelay({child,attemptId:a.attemptId,async respond(request,peer){
 assert.equal(peer.pid,process.ppid);assert.equal(peer.uid,process.geteuid());assert.equal(peer.gid,process.getegid());
 // Same Node full-file read/hash work as the production responder; no claim of
 // root ownership/production approval in this disposable test namespace.
 for(const name of ['node','supervisor']){const b=fs.readFileSync(path.join(dir,name));createHash('sha256').update(b).digest('hex')}
 await new Promise(r=>setTimeout(r,800));
 process.stdout.write('{"checkpoint":true}\n');
 return {version:2,status:'READY',attemptId:a.attemptId,nonce:request.nonce,s0:{snapshotId:'bbbbbbbb-0000-4000-8000-000000000000',publishedAt:'2026-10-21T00:00:00.000Z'},projectionSha256:'d'.repeat(64),witnessSha256:'e'.repeat(64),sourceSha:a.sourceSha,confirmedAt:a.confirmedAt,bootId:a.bootId,expiresAt:a.expiresAt,evidencePolicy:a.evidencePolicy,policyVersion:2,policySha256:a.policySha256};
}});
process.stdout.write(JSON.stringify({pid:child.pid})+'\n');
try{const delivered=await relay.delivered;process.stdout.write(JSON.stringify({delivered})+'\n');if(delivered){assert.equal((await new Promise(r=>process.stdin.once('data',r))).toString(),'CLOSE\n')}}finally{await relay.close()}
`

type largeReadyFixture struct {
	dir       string
	authority readyAuthority
	expected  map[string][32]byte
	cmd       *exec.Cmd
	input     io.WriteCloser
	decoder   *json.Decoder
}

func newLargeReadyFixture(t *testing.T) *largeReadyFixture {
	t.Helper()
	dir, e := os.MkdirTemp("", "c2r-")
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	node, e := exec.LookPath("node")
	if e != nil {
		t.Fatal("Node24 required")
	}
	binary, e := os.Executable()
	if e != nil {
		t.Fatal(e)
	}
	root, e := filepath.Abs("../../..")
	if e != nil {
		t.Fatal(e)
	}
	probe := filepath.Join(dir, "relayprobe")
	build := exec.Command("go", "build", "-trimpath", "-o", probe, "./internal/revalidation/testdata/relayprobe")
	build.Dir = filepath.Join(root, "backend-go")
	build.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + os.Getenv("HOME"), "GOTOOLCHAIN=local", "CGO_ENABLED=0"}
	if build.Run() != nil {
		t.Fatal("local relay ELF build")
	}
	copyELF := func(source, target string, minimum int64) {
		from, err := os.Open(source)
		if err != nil {
			t.Fatal(err)
		}
		defer from.Close()
		to, err := os.OpenFile(filepath.Join(dir, target), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			t.Fatal(err)
		}
		size, err := io.Copy(to, from)
		if err != nil {
			t.Fatal(err)
		}
		// Appended padding retains actual ELF contents; fixture is only hashed.
		zero := make([]byte, 65536)
		for size < minimum {
			n := min(int64(len(zero)), minimum-size)
			written, err := to.Write(zero[:n])
			if err != nil {
				t.Fatal(err)
			}
			size += int64(written)
		}
		if to.Close() != nil {
			t.Fatal("fixture close")
		}
	}
	copyELF(node, "node", 123655872)
	// Retain the actual compiled relay; production-sized minimum if shorter.
	f, e := os.OpenFile(probe, os.O_WRONLY|os.O_APPEND, 0)
	if e != nil {
		t.Fatal(e)
	}
	info, e := f.Stat()
	if e != nil {
		t.Fatal(e)
	}
	if info.Size() < 11179430 {
		if _, e = f.Write(make([]byte, 11179430-info.Size())); e != nil {
			t.Fatal(e)
		}
	}
	_ = f.Close()
	copyELF(binary, "self", 16477035)
	module, e := os.ReadFile(filepath.Join(root, "scripts/revalidation/c2-production-supervisor.mjs"))
	if e != nil {
		t.Fatal(e)
	}
	if os.WriteFile(filepath.Join(dir, "supervisor"), module, 0600) != nil {
		t.Fatal("module fixture")
	}
	expected := map[string][32]byte{}
	for _, name := range []string{"node", "relayprobe", "self", "supervisor"} {
		raw, e := os.ReadFile(filepath.Join(dir, name))
		if e != nil {
			t.Fatal(e)
		}
		if name != "supervisor" && (len(raw) < 4 || string(raw[:4]) != "\x7fELF") {
			t.Fatal("actual ELF required")
		}
		expected[name] = sha256.Sum256(raw)
	}
	a := readyAuthority{Version: 2, AttemptID: strings.Repeat("a", 32), SourceSHA: strings.Repeat("b", 40), ConfirmedAt: time.Now().Add(-time.Second).UTC().Format(readyTime), ExpiresAt: time.Now().Add(time.Minute).UTC().Format(readyTime), OperatorUID: os.Geteuid(), OperatorGID: os.Getegid(), BootID: "11111111-1111-1111-1111-111111111111", EvidencePolicy: "site-content-verification", PolicyVersion: 2, PolicySHA256: strings.Repeat("f", 64)}
	raw, _ := json.Marshal(a)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	t.Cleanup(cancel)
	cmd := exec.CommandContext(ctx, node, "--input-type=module", "-e", largeReadyParent, "file://"+filepath.Join(root, "scripts/revalidation/c2-production-supervisor.mjs"), binary, dir, string(raw))
	cmd.Env = []string{"PATH=" + os.Getenv("PATH")}
	input, e := cmd.StdinPipe()
	if e != nil {
		t.Fatal(e)
	}
	output, e := cmd.StdoutPipe()
	if e != nil {
		t.Fatal(e)
	}
	if cmd.Start() != nil {
		t.Fatal("Node/helper fixture")
	}
	t.Cleanup(func() { _ = input.Close(); _ = cmd.Process.Kill(); _ = cmd.Wait() })
	decoder := json.NewDecoder(output)
	var started struct{ PID int }
	if decoder.Decode(&started) != nil || started.PID < 1 {
		t.Fatal("Go helper not listening")
	}
	a.SupervisorPID = started.PID // existing test-only direct-peer branch, not root authority
	return &largeReadyFixture{dir, a, expected, cmd, input, decoder}
}

func (f *largeReadyFixture) admission(t *testing.T) {
	t.Helper()
	time.Sleep(800 * time.Millisecond)
	for _, name := range []string{"node", "relayprobe", "supervisor", "self"} {
		file, e := os.Open(filepath.Join(f.dir, name))
		if e != nil {
			t.Fatal(e)
		}
		b, e := io.ReadAll(io.LimitReader(file, 256<<20+1))
		_ = file.Close()
		if e != nil || sha256.Sum256(b) != f.expected[name] {
			t.Fatal("full ELF admission digest")
		}
	}
}
func (f *largeReadyFixture) finish(t *testing.T) bool {
	t.Helper()
	var checkpoint struct{ Checkpoint bool }
	var end struct{ Delivered bool }
	if f.decoder.Decode(&checkpoint) != nil || !checkpoint.Checkpoint {
		t.Fatal("missing responder checkpoint")
	}
	if f.decoder.Decode(&end) != nil {
		t.Fatal("missing delivered outcome")
	}
	if end.Delivered {
		_, _ = io.WriteString(f.input, "CLOSE\n")
	}
	_ = f.input.Close()
	if f.cmd.Wait() != nil {
		t.Fatal("fixture cleanup")
	}
	if _, e := os.Lstat(filepath.Join(f.dir, "ready.sock")); !os.IsNotExist(e) {
		t.Fatal("owned socket leaked")
	}
	return end.Delivered
}

func TestReadyLargeELFSharedDeadline(t *testing.T) {
	f := newLargeReadyFixture(t)
	// Mirrors RequestReady's single context, including pre-connect admission;
	// calls the actual Unix client/helper/Node, NOT production root admission.
	ctx, cancel := context.WithTimeout(context.Background(), ReadyBudget)
	defer cancel()
	begin := time.Now()
	f.admission(t)
	admission := time.Since(begin)
	ticket := requestReady(ctx, filepath.Join(f.dir, "ready.sock"), f.authority.AttemptID, f.authority, func() bool { return ctx.Err() == nil })
	elapsed := time.Since(begin)
	delivered := f.finish(t)
	t.Logf("full_size_client_ms=%d admission_ms=%d budget_ms=%d fixture_only=true production_authority=false", elapsed.Milliseconds(), admission.Milliseconds(), ReadyBudget.Milliseconds())
	if ticket == nil || !delivered {
		t.Fatal("valid full-size shared-deadline READY rejected; expected armed")
	}
	at, _ := time.Parse(readyTime, "2026-10-21T00:00:00.000Z")
	if !ticket.BindBaseline("bbbbbbbb-0000-4000-8000-000000000000", at) || ticket.BindBaseline("bbbbbbbb-0000-4000-8000-000000000000", at) {
		t.Fatal("one-use baseline changed")
	}
}

func TestReadyLargeELFAdmissionCore(t *testing.T) {
	f := newLargeReadyFixture(t)
	load := func(ctx context.Context, id string, p *readyProgress) (readyAuthority, []byte, error) {
		p.enter(phaseNodeHash)
		f.admission(t)
		p.enter(phaseSelfIdentity)
		return f.authority, nil, nil
	}
	exchange := func(ctx context.Context, _ string, id string, a readyAuthority, _ func() bool, p *readyProgress) (*ReadyTicket, readyReason) {
		// Root record/proc are an explicit OS model. The public entrypoint has
		// fixed dependencies; real Go Unix peer/nonce/helper response still run.
		return requestReadyObserved(ctx, filepath.Join(f.dir, "ready.sock"), id, a, func() bool { return ctx.Err() == nil }, p)
	}
	begin := time.Now()
	ticket, d := requestReadyAdmission(context.Background(), "/var/lib/aktau-sync/c2/"+f.authority.AttemptID+"/event.fifo", f.authority.AttemptID, load, exchange)
	delivered := f.finish(t)
	t.Logf("admission_core_ms=%d phase=%s reason=%s outcome=%s fixture_only=true production_authority=false", time.Since(begin).Milliseconds(), d.Phase(), d.Reason(), d.Outcome())
	if ticket == nil || !delivered || d.Outcome() != "armed" || d.Phase() != "complete" || d.DeadlineOrCancelled() {
		t.Fatal("complete client core did not qualify")
	}
}
