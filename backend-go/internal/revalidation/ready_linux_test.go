//go:build linux

package revalidation

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type readyDelayedTimerContext struct {
	context.Context
	end time.Time
}

func (c readyDelayedTimerContext) Deadline() (time.Time, bool) { return c.end, true }

func TestReadyDeadlineDoesNotWaitForContextTimer(t *testing.T) {
	parent := readyDelayedTimerContext{context.Background(), time.Now().Add(-time.Millisecond)}
	if parent.Err() != nil || !readyContextEnded(parent) {
		t.Fatal("test must model a delayed timer callback")
	}
	load := func(context.Context, string, *readyProgress) (readyAuthority, []byte, error) {
		t.Fatal("expired admission performed I/O")
		return readyAuthority{}, nil, nil
	}
	ticket, d := requestReadyAdmission(parent, "/var/lib/aktau-sync/c2/"+strings.Repeat("a", 32)+"/event.fifo", strings.Repeat("a", 32), load, nil)
	if ticket != nil || d.Reason() != "parent_deadline" || !d.DeadlineOrCancelled() {
		t.Fatal("elapsed deadline admitted before Err updated")
	}
}

func readyFixture(t *testing.T, mutate func(*ReadyResponse), transport func(net.Conn)) (string, readyAuthority) {
	t.Helper()
	dir, err := os.MkdirTemp("", "c2r-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	file := filepath.Join(dir, "ready.sock")
	l, err := net.Listen("unix", file)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = l.Close() })
	if os.Chmod(file, 0600) != nil {
		t.Fatal("mode")
	}
	a := readyAuthority{Version: 1, AttemptID: strings.Repeat("a", 32), SourceSHA: strings.Repeat("b", 40), FrontendSHA: strings.Repeat("c", 40), DeploymentID: "dpl_local", ConfirmedAt: time.Now().Add(-time.Second).UTC().Format(readyTime), ExpiresAt: time.Now().Add(time.Minute).UTC().Format(readyTime), SupervisorPID: os.Getpid(), OperatorUID: os.Geteuid(), OperatorGID: os.Getegid(), BootID: "aaaaaaaa-0000-4000-8000-000000000000"}
	go func() {
		c, e := l.Accept()
		if e != nil {
			return
		}
		defer c.Close()
		if transport != nil {
			transport(c)
			return
		}
		raw, e := io.ReadAll(io.LimitReader(c, ReadyLimit+1))
		if e != nil {
			return
		}
		var req ReadyRequest
		if !canonicalReady(raw, &req) {
			return
		}
		r := ReadyResponse{1, "READY", a.AttemptID, req.Nonce, ReadyBaseline{"bbbbbbbb-0000-4000-8000-000000000000", "2026-10-21T00:00:00.000Z"}, strings.Repeat("d", 64), strings.Repeat("e", 64), a.SourceSHA, a.FrontendSHA, a.DeploymentID, a.ConfirmedAt, a.BootID, a.ExpiresAt, "", 0, ""}
		if mutate != nil {
			mutate(&r)
		}
		out, _ := json.Marshal(r)
		_, _ = c.Write(append(out, '\n'))
	}()
	return file, a
}

func TestReadyDiagnosticDisabledAndFixedDependencyBoundary(t *testing.T) {
	if ReadyBudget != 5000*time.Millisecond {
		t.Fatal("reviewed READY ceiling must be exactly5000ms")
	}
	called := false
	load := func(context.Context, string, *readyProgress) (readyAuthority, []byte, error) {
		called = true
		return readyAuthority{}, nil, nil
	}
	exchange := func(context.Context, string, string, readyAuthority, func() bool, *readyProgress) (*ReadyTicket, readyReason) {
		called = true
		return nil, reasonRejected
	}
	for _, tc := range []struct{ fifo, id, want, reason string }{{"", "", "disabled", "disabled"}, {"private-credential-path", strings.Repeat("a", 32), "not_armed", "configuration_invalid"}, {"x", "INVALID", "disabled", "disabled"}} {
		ticket, d := requestReadyAdmission(context.Background(), tc.fifo, tc.id, load, exchange)
		if ticket != nil || called || d.Outcome() != tc.want || d.Reason() != tc.reason || d.Phase() != "opt_in" {
			t.Fatal("invalid opt-in performed admission")
		}
	}
}

func TestReadyDiagnosticRejectsLateExchangeResult(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	release, finished := make(chan struct{}), make(chan struct{})
	load := func(context.Context, string, *readyProgress) (readyAuthority, []byte, error) {
		return readyAuthority{}, nil, nil
	}
	exchange := func(_ context.Context, _ string, _ string, _ readyAuthority, _ func() bool, p *readyProgress) (*ReadyTicket, readyReason) {
		p.enter(phaseResponseRead)
		<-release
		defer close(finished)
		return &ReadyTicket{}, reasonReady
	}
	ticket, d := requestReadyAdmission(ctx, "/var/lib/aktau-sync/c2/"+strings.Repeat("a", 32)+"/event.fifo", strings.Repeat("a", 32), load, exchange)
	if ticket != nil || d.Outcome() != "not_armed" || d.Reason() != "parent_deadline" || d.Phase() != "response_read" {
		t.Fatal("late exchange was authorized")
	}
	before := d
	close(release)
	<-finished
	if d != before {
		t.Fatal("late worker rewrote terminal diagnostic")
	}
}

func TestReadyDiagnosticDeadlineSnapshotAndNoLateExchange(t *testing.T) {
	for _, kind := range []string{"parent_deadline", "cancelled", "deadline"} {
		t.Run(kind, func(t *testing.T) {
			parent := context.Background()
			cancel := func() {}
			if kind == "parent_deadline" {
				parent, cancel = context.WithTimeout(parent, 30*time.Millisecond)
			}
			if kind == "cancelled" {
				parent, cancel = context.WithCancel(parent)
			}
			defer cancel()
			entered, release, finished := make(chan struct{}), make(chan struct{}), make(chan struct{})
			var calls atomic.Int32
			load := func(ctx context.Context, id string, p *readyProgress) (readyAuthority, []byte, error) {
				p.enter(phaseNodeHash)
				close(entered)
				<-release
				// Deliberately models a non-cancelable filesystem/hash finishing late.
				p.enter(phaseComplete)
				close(finished)
				return readyAuthority{}, nil, nil
			}
			exchange := func(context.Context, string, string, readyAuthority, func() bool, *readyProgress) (*ReadyTicket, readyReason) {
				calls.Add(1)
				return &ReadyTicket{}, reasonReady
			}
			if kind == "cancelled" {
				go func() { <-entered; cancel() }()
			}
			begin := time.Now()
			ticket, d := requestReadyAdmission(parent, "/var/lib/aktau-sync/c2/"+strings.Repeat("a", 32)+"/event.fifo", strings.Repeat("a", 32), load, exchange)
			if ticket != nil || d.Outcome() != "not_armed" || d.Reason() != kind || d.Phase() != "hash_node" || !d.DeadlineOrCancelled() || d.ElapsedMS() < 0 || d.ElapsedMS() > 5000 {
				t.Fatal("wrong terminal deadline snapshot")
			}
			if elapsed := time.Since(begin); elapsed > ReadyBudget+500*time.Millisecond {
				t.Fatal("caller waited for late worker")
			}
			before := d
			close(release)
			<-finished
			// Give an incorrectly continued worker an observable opportunity to dial.
			select {
			case <-time.After(30 * time.Millisecond):
			case <-parent.Done():
				<-time.After(30 * time.Millisecond)
			}
			if calls.Load() != 0 || d != before {
				t.Fatal("late worker altered terminal result or started an exchange")
			}
		})
	}
}

func TestReadyDiagnosticFailureReasonsNeverUseErrorText(t *testing.T) {
	for _, phase := range []readyPhase{phaseAuthorityRead, phaseAuthorityValidate, phaseNodeHash, phaseRelayHash, phaseSupervisorIdentity, phaseSupervisorHash, phaseSelfIdentity} {
		for _, e := range []error{readyFailure(reasonDigest), errors.New("postgres://private-credential/nonce/RAW_READY")} {
			load := func(context.Context, string, *readyProgress) (readyAuthority, []byte, error) {
				return readyAuthority{}, nil, e
			}
			wrapped := func(ctx context.Context, id string, p *readyProgress) (readyAuthority, []byte, error) {
				p.enter(phase)
				return load(ctx, id, p)
			}
			ticket, d := requestReadyAdmission(context.Background(), "/var/lib/aktau-sync/c2/"+strings.Repeat("a", 32)+"/event.fifo", strings.Repeat("a", 32), wrapped, nil)
			if ticket != nil || d.Outcome() != "not_armed" || d.phase != phase || strings.Contains(d.Reason(), "private") {
				t.Fatal("unsafe failure diagnosis")
			}
			if e == readyFailure(reasonDigest) && d.Reason() != "hash_mismatch" {
				t.Fatal("typed failure lost")
			}
		}
	}
}

func TestReadyTransportDiagnosticAndCancellation(t *testing.T) {
	for _, kind := range []string{"success", "peer", "uid", "gid", "protected_peer", "socket", "authority", "response", "cancel_wait"} {
		t.Run(kind, func(t *testing.T) {
			release := make(chan struct{})
			defer close(release)
			var transport func(net.Conn)
			if kind == "cancel_wait" {
				transport = func(c net.Conn) { <-release }
			}
			path, a := readyFixture(t, func(r *ReadyResponse) {
				if kind == "response" {
					r.Nonce = "bad"
				}
			}, transport)
			if kind == "peer" {
				a.SupervisorPID++
			}
			if kind == "uid" {
				a.OperatorUID++
			}
			if kind == "gid" {
				a.OperatorGID++
			}
			if kind == "protected_peer" {
				a.RelaySHA256 = strings.Repeat("a", 64)
			}
			if kind == "socket" {
				_ = os.Chmod(path, 0660)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
			defer cancel()
			p := &readyProgress{}
			ticket, reason := requestReadyObserved(ctx, path, a.AttemptID, a, func() bool { return kind != "authority" }, p)
			want := map[string]readyReason{"success": reasonReady, "peer": reasonPeer, "uid": reasonPeer, "gid": reasonPeer, "protected_peer": reasonPeer, "socket": reasonSocket, "authority": reasonAuthorityChanged, "response": reasonResponse, "cancel_wait": reasonTransport}[kind]
			if reason != want || (ticket != nil) != (kind == "success") {
				t.Fatal("incorrect transport classification")
			}
			if kind == "cancel_wait" && p.snapshot() != phaseResponseRead {
				t.Fatal("response wait phase missing")
			}
		})
	}
}

func TestReadyRejectsMalformedResponseWithSafeReason(t *testing.T) {
	for _, kind := range []string{"duplicate", "unknown", "trailing", "oversized", "source", "boot", "expired", "nonce"} {
		t.Run(kind, func(t *testing.T) {
			assigned := make(chan struct{})
			var a readyAuthority
			path, value := readyFixture(t, nil, func(c net.Conn) {
				<-assigned
				raw, _ := io.ReadAll(io.LimitReader(c, ReadyLimit+1))
				var req ReadyRequest
				if !canonicalReady(raw, &req) {
					return
				}
				r := ReadyResponse{Version: 1, Status: "READY", AttemptID: a.AttemptID, Nonce: req.Nonce, S0: ReadyBaseline{"bbbbbbbb-0000-4000-8000-000000000000", "2026-10-21T00:00:00.000Z"}, ProjectionSHA256: strings.Repeat("d", 64), WitnessSHA256: strings.Repeat("e", 64), SourceSHA: a.SourceSHA, FrontendSHA: a.FrontendSHA, DeploymentID: a.DeploymentID, ConfirmedAt: a.ConfirmedAt, BootID: a.BootID, ExpiresAt: a.ExpiresAt}
				switch kind {
				case "source":
					r.SourceSHA = strings.Repeat("f", 40)
				case "boot":
					r.BootID = "cccccccc-0000-4000-8000-000000000000"
				case "expired":
					r.ExpiresAt = "2020-01-01T00:00:00.000Z"
				case "nonce":
					r.Nonce = strings.Repeat("f", 32)
				}
				out, _ := json.Marshal(r)
				text := string(out) + "\n"
				switch kind {
				case "duplicate":
					text = strings.Replace(text, `"version":1`, `"version":1,"version":1`, 1)
				case "unknown":
					text = strings.Replace(text, `"version":1`, `"version":1,"secret":"PRIVATE_PAYLOAD"`, 1)
				case "trailing":
					text += "{}\n"
				case "oversized":
					text += strings.Repeat("X", ReadyLimit+1)
				}
				_, _ = io.WriteString(c, text)
			})
			a = value
			close(assigned)
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			p := &readyProgress{}
			ticket, reason := requestReadyObserved(ctx, path, a.AttemptID, a, func() bool { return true }, p)
			if ticket != nil || reason != reasonResponse || p.snapshot() != phaseResponseValidate {
				t.Fatal("malformed response admitted or unsafe classification")
			}
		})
	}
}

func TestReadyDetailedParentEndsAfterRequestCheckpoint(t *testing.T) {
	release := make(chan struct{})
	defer close(release)
	checkpoint := make(chan struct{})
	path, a := readyFixture(t, nil, func(c net.Conn) { _, _ = io.ReadAll(io.LimitReader(c, ReadyLimit+1)); close(checkpoint); <-release })
	load := func(context.Context, string, *readyProgress) (readyAuthority, []byte, error) { return a, nil, nil }
	exchange := func(ctx context.Context, _ string, id string, a readyAuthority, _ func() bool, p *readyProgress) (*ReadyTicket, readyReason) {
		return requestReadyObserved(ctx, path, id, a, func() bool { return ctx.Err() == nil }, p)
	}
	for _, kind := range []string{"cancelled"} {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		go func() { <-checkpoint; cancel() }()
		ticket, d := requestReadyAdmission(ctx, "/var/lib/aktau-sync/c2/"+a.AttemptID+"/event.fifo", a.AttemptID, load, exchange)
		if ticket != nil || d.Outcome() != "not_armed" || d.Reason() != kind || d.Phase() != "response_read" || !d.DeadlineOrCancelled() {
			t.Fatal("late checkpoint admitted or mislabeled")
		}
	}
}

func TestReadyRealUnixCanonicalBaselineOnce(t *testing.T) {
	path, a := readyFixture(t, nil, nil)
	ctx, cancel := context.WithTimeout(context.Background(), ReadyBudget)
	defer cancel()
	ticket := requestReady(ctx, path, a.AttemptID, a, func() bool { return true })
	if ticket == nil {
		t.Fatal("valid real Unix READY rejected")
	}
	at, _ := time.Parse(readyTime, "2026-10-21T00:00:00.000Z")
	if !ticket.BindBaseline("bbbbbbbb-0000-4000-8000-000000000000", at) || ticket.BindBaseline("bbbbbbbb-0000-4000-8000-000000000000", at) {
		t.Fatal("one-time baseline binding")
	}
}

func TestSiteContentReadyV2Canonical(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	raw := `{"version":2,"status":"READY","attemptId":"` + strings.Repeat("a", 32) + `","nonce":"` + strings.Repeat("b", 32) + `","s0":{"snapshotId":"bbbbbbbb-0000-4000-8000-000000000000","publishedAt":"2026-10-21T00:00:00.000Z"},"projectionSha256":"` + strings.Repeat("d", 64) + `","witnessSha256":"` + strings.Repeat("e", 64) + `","sourceSha":"` + strings.Repeat("c", 40) + `","confirmedAt":"` + now.Add(-time.Second).Format(readyTime) + `","bootId":"aaaaaaaa-0000-4000-8000-000000000000","expiresAt":"` + now.Add(time.Minute).Format(readyTime) + `","evidencePolicy":"site-content-verification","policyVersion":2,"policySha256":"` + strings.Repeat("f", 64) + `"}` + "\n"
	var response ReadyResponse
	request := ReadyRequest{1, strings.Repeat("a", 32), strings.Repeat("b", 32)}
	if !canonicalReady([]byte(raw), &response) || !validReadyResponse(response, request, now) {
		t.Fatal("site-content READY-v2 rejected without frontend identity")
	}
	for _, bad := range []string{
		strings.Replace(raw, `"policyVersion":2`, `"policyVersion":1`, 1),
		strings.Replace(raw, `"evidencePolicy":"site-content-verification"`, `"evidencePolicy":"unknown"`, 1),
		strings.Replace(raw, `"sourceSha":`, `"frontendSha":"`+strings.Repeat("c", 40)+`","sourceSha":`, 1),
		strings.Replace(raw, strings.Repeat("f", 64), strings.Repeat("F", 64), 1),
	} {
		var value ReadyResponse
		if canonicalReady([]byte(bad), &value) && validReadyResponse(value, request, now) {
			t.Fatal("mixed or malformed READY evidence accepted")
		}
	}
}
func TestReadyIdentityAndBaselineNegatives(t *testing.T) {
	for _, field := range []string{"attempt", "nonce", "source", "frontend", "deployment", "boot", "expiry", "s0", "digest", "timestamp"} {
		t.Run(field, func(t *testing.T) {
			path, a := readyFixture(t, func(r *ReadyResponse) {
				switch field {
				case "attempt":
					r.AttemptID = strings.Repeat("f", 32)
				case "nonce":
					r.Nonce = strings.Repeat("f", 32)
				case "source":
					r.SourceSHA = strings.Repeat("f", 40)
				case "frontend":
					r.FrontendSHA = strings.Repeat("f", 40)
				case "deployment":
					r.DeploymentID = "dpl_foreign"
				case "boot":
					r.BootID = "cccccccc-0000-4000-8000-000000000000"
				case "expiry":
					r.ExpiresAt = "2020-01-01T00:00:00.000Z"
				case "s0":
					r.S0.SnapshotID = "bad"
				case "digest":
					r.WitnessSHA256 = "bad"
				case "timestamp":
					r.S0.PublishedAt = "2026-10-21T00:00:00Z"
				}
			}, nil)
			ctx, cancel := context.WithTimeout(context.Background(), ReadyBudget)
			defer cancel()
			if requestReady(ctx, path, a.AttemptID, a, func() bool { return true }) != nil {
				t.Fatal("invalid READY accepted")
			}
		})
	}
}
func TestReadyCanonicalRejectsDuplicateUnknownFramesAndTypes(t *testing.T) {
	good := []byte(`{"version":1,"attemptId":"` + strings.Repeat("a", 32) + `","nonce":"` + strings.Repeat("b", 32) + `"}` + "\n")
	for _, raw := range [][]byte{append([]byte{}, good...), []byte(strings.Replace(string(good), `"version":1`, `"version":1,"version":1`, 1)), []byte(strings.Replace(string(good), `"version":1`, `"version":1,"extra":0`, 1)), []byte(strings.Replace(string(good), `"version":1`, `"version":"1"`, 1)), append(append([]byte{}, good...), good...), good[:len(good)-1], []byte(strings.Repeat("x", ReadyLimit+1))} {
		var request ReadyRequest
		ok := canonicalReady(raw, &request)
		if string(raw) == string(good) {
			if !ok {
				t.Fatal("canonical rejected")
			}
		} else if ok {
			t.Fatal("noncanonical accepted")
		}
	}
}
func TestReadyTimeoutCancellationPeerAndCustody(t *testing.T) {
	for _, kind := range []string{"timeout", "cancel", "peer", "symlink", "mode", "authority_change"} {
		t.Run(kind, func(t *testing.T) {
			release := make(chan struct{})
			defer close(release)
			var transport func(net.Conn)
			if kind == "timeout" || kind == "cancel" {
				transport = func(c net.Conn) { <-release }
			}
			path, a := readyFixture(t, nil, transport)
			if kind == "peer" {
				a.SupervisorPID++
			}
			if kind == "mode" {
				_ = os.Chmod(path, 0660)
			}
			if kind == "symlink" {
				link := path + ".link"
				if os.Symlink(path, link) != nil {
					t.Fatal("link")
				}
				path = link
			}
			ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
			defer cancel()
			if kind == "cancel" {
				time.AfterFunc(20*time.Millisecond, cancel)
			}
			start := time.Now()
			r := requestReady(ctx, path, a.AttemptID, a, func() bool { return kind != "authority_change" })
			if r != nil || time.Since(start) > 500*time.Millisecond {
				t.Fatal("not fail-closed/bounded")
			}
		})
	}
}
func TestReadyDisabledAndMissingIndependentAuthority(t *testing.T) {
	for _, tc := range [][2]string{{"", ""}, {"/arbitrary", strings.Repeat("a", 32)}, {"/var/lib/aktau-sync/c2/" + strings.Repeat("a", 32) + "/event.fifo", "bad"}} {
		if ticket, _ := RequestReady(context.Background(), tc[0], tc[1]); ticket != nil {
			t.Fatal("invalid config armed")
		}
	}
	ticket := &ReadyTicket{response: ReadyResponse{S0: ReadyBaseline{"s0", "2026-10-21T00:00:00.000Z"}, ExpiresAt: time.Now().Add(time.Minute).UTC().Format(readyTime)}}
	at, _ := time.Parse(readyTime, ticket.response.S0.PublishedAt)
	if ticket.BindBaseline("changed", at) || ticket.BindBaseline("s0", at) {
		t.Fatal("mismatch/reuse must remain excluded")
	}
}
