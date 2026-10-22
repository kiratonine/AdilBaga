//go:build linux

package revalidation

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

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
