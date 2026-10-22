//go:build integration && linux

package revalidation

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"adilbaga/backend-go/internal/ingestion"
	"github.com/jackc/pgx/v5"
)

func localReadyDSN(v, user string) bool {
	u, e := url.Parse(v)
	if e != nil || u.Scheme != "postgres" || u.Hostname() != "127.0.0.1" || u.Port() == "" || u.Path != "/part16_c2" || u.User == nil || u.User.Username() != user || u.RawQuery != "sslmode=disable" || u.Fragment != "" {
		return false
	}
	p, ok := u.User.Password()
	return ok && p == "ci-local-only"
}
func readyBundle(day int) ingestion.Bundle {
	brand := "Fixture"
	confidence := 1.0
	n := 1
	b := ingestion.Bundle{Version: "1.0", GeneratedAt: fmt.Sprintf("2026-10-%02dT10:00:00.000Z", day)}
	g := ingestion.Group{Name: "Fixture milk", Brand: &brand, Category: "milk", Attributes: map[string]any{"volumeMl": 1000.0, "fatPercent": 3.2}}
	for i, store := range []string{"DINA", "DANA", "FIX_PRICE"} {
		p := ingestion.RawProduct{StoreCode: store, SourceProductID: "fixture-" + store, Name: g.Name, Brand: &brand, Price: int64(100 + day + i*20), RawPayload: map[string]any{}}
		b.RawProducts = append(b.RawProducts, p)
		g.Members = append(g.Members, ingestion.Member{Raw: p, Method: "manual", Confidence: &confidence, Review: "approved"})
		b.Sources = append(b.Sources, ingestion.SourceInput{StoreCode: store, CapturedAt: b.GeneratedAt, ProductCount: &n})
	}
	b.Groups = []ingestion.Group{g}
	return b
}

func TestReadyPreparedBundleShape(t *testing.T) {
	for _, day := range []int{15, 16, 17} {
		if e := readyBundle(day).Validate(); e != nil {
			t.Fatal("local fixture violates existing Bundle scalar/type contract")
		}
	}
}

func TestLocalReadyPublication(t *testing.T) {
	adminURL, writerURL, readerURL := os.Getenv("PART32_ADMIN_DATABASE_URL"), os.Getenv("PART32_WRITER_DATABASE_URL"), os.Getenv("PART32_READER_DATABASE_URL")
	if adminURL == "" && writerURL == "" && readerURL == "" {
		t.Skip("explicit disposable Part32 profile required")
	}
	if !localReadyDSN(adminURL, "postgres") || !localReadyDSN(writerURL, "part32_writer") || !localReadyDSN(readerURL, "aktau_api_runtime") {
		t.Fatal("only exact disposable Part32 credentials allowed")
	}
	au, _ := url.Parse(adminURL)
	wu, _ := url.Parse(writerURL)
	ru, _ := url.Parse(readerURL)
	if au.Host != wu.Host || au.Host != ru.Host {
		t.Fatal("different local targets")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Minute)
	defer cancel()
	root, e := filepath.Abs("../../..")
	if e != nil {
		t.Fatal(e)
	}
	directory, e := os.MkdirTemp("", "aktau-c2-joint-")
	if e != nil {
		t.Fatal(e)
	}
	defer os.RemoveAll(directory)
	revision, e := exec.Command("git", "rev-parse", "HEAD").Output()
	if e != nil {
		t.Fatal("source identity")
	}
	source := strings.TrimSpace(string(revision))
	frontend := strings.Repeat("c", 40)
	for _, item := range [][2]string{{"c2projection", "./cmd/c2projection"}, {"relayprobe", "./internal/revalidation/testdata/relayprobe"}, {"fixture", "./internal/revalidation/testdata/c2fixture"}} {
		c := exec.CommandContext(ctx, "go", "build", "-trimpath", "-ldflags", "-X main.sourceSHA="+source, "-o", filepath.Join(directory, item[0]), item[1])
		c.Dir = filepath.Join(root, "backend-go")
		c.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + os.Getenv("HOME"), "GOTOOLCHAIN=local", "CGO_ENABLED=0"}
		if c.Run() != nil {
			t.Fatal("local Go fixture build")
		}
		if os.Chmod(filepath.Join(directory, item[0]), 0700) != nil {
			t.Fatal("fixture mode")
		}
	}
	image, e := os.ReadFile(filepath.Join(directory, "c2projection"))
	if e != nil {
		t.Fatal(e)
	}
	sum := sha256.Sum256(image)
	binary, e := os.Executable()
	if e != nil {
		t.Fatal(e)
	}
	for _, caseName := range []string{"healthy", "intervening", "stage_failure", "publish_failure", "notify_failure", "site_healthy", "site_intervening", "site_stage_failure", "site_publish_failure", "site_notify_failure"} {
		t.Run(caseName, func(t *testing.T) {
			scenario := strings.TrimPrefix(caseName, "site_")
			site := strings.HasPrefix(caseName, "site_")
			admin, e := pgx.Connect(ctx, adminURL)
			if e != nil {
				t.Fatal("local admin")
			}
			defer admin.Close(context.Background())
			if _, e = admin.Exec(ctx, `TRUNCATE snapshots,stores,categories,canonical_products CASCADE;
INSERT INTO stores(id,code,name) VALUES('dina','DINA','Dina'),('dana','DANA','Dana'),('fix','FIX_PRICE','Fix Price');
INSERT INTO categories(id,slug,name) VALUES('milk','milk','Milk')`); e != nil {
				t.Fatal("owned fixture setup")
			}
			writer, e := pgx.Connect(ctx, writerURL)
			if e != nil {
				t.Fatal("local restricted writer")
			}
			defer writer.Close(context.Background())
			engine, e := ingestion.New(writer, 0, false)
			if e != nil {
				t.Fatal(e)
			}
			seed, e := engine.Stage(ctx, readyBundle(15))
			if e != nil {
				t.Fatal("seed Stage:", e.Error())
			}
			if seed.Publish(ctx) != nil {
				t.Fatal("seed COMMIT")
			}
			seed.Close()
			namespace, e := os.MkdirTemp("", "c2r-")
			if e != nil {
				t.Fatal(e)
			}
			defer os.RemoveAll(namespace)
			boot, e := BootID()
			if e != nil {
				t.Fatal(e)
			}
			a := readyAuthority{Version: 1, AttemptID: strings.Repeat("a", 32), SourceSHA: source, FrontendSHA: frontend, DeploymentID: "dpl_fixture", ConfirmedAt: time.Now().Add(-time.Second).UTC().Format(readyTime), ExpiresAt: time.Now().Add(time.Minute).UTC().Format(readyTime), OperatorUID: os.Geteuid(), OperatorGID: os.Getegid(), BootID: boot}
			providerOptions := map[string]any{"directory": directory, "binarySha256": hex.EncodeToString(sum[:]), "sourceSha": source, "frontendSha": frontend, "databaseURL": readerURL}
			if site {
				a.Version, a.FrontendSHA, a.DeploymentID = 2, "", ""
				a.EvidencePolicy, a.PolicyVersion, a.PolicySHA256 = "site-content-verification", 2, strings.Repeat("d", 64)
				delete(providerOptions, "frontendSha")
				providerOptions["sitePolicy"] = map[string]any{"evidencePolicy": a.EvidencePolicy, "policyVersion": a.PolicyVersion, "policySha256": a.PolicySHA256}
			}
			config := struct {
				Authority readyAuthority `json:"authority"`
				Provider  map[string]any `json:"provider"`
			}{a, providerOptions}
			raw, _ := json.Marshal(config)
			childCtx, childCancel := context.WithTimeout(ctx, 30*time.Second)
			defer childCancel()
			cmd := exec.CommandContext(childCtx, "node", filepath.Join(root, "scripts/revalidation/fixtures/part32-joint-parent.mjs"), binary, namespace, string(raw))
			cmd.Env = []string{"PATH=" + os.Getenv("PATH")}
			control, e := cmd.StdinPipe()
			if e != nil {
				t.Fatal(e)
			}
			stdout, e := cmd.StdoutPipe()
			if e != nil {
				t.Fatal(e)
			}
			if cmd.Start() != nil {
				t.Fatal("Node start")
			}
			defer cmd.Process.Kill()
			decoder := json.NewDecoder(stdout)
			var first struct {
				PID  int    `json:"pid"`
				FIFO string `json:"fifo"`
				S0   string `json:"s0"`
			}
			if decoder.Decode(&first) != nil || first.PID < 1 {
				t.Fatal("real CLI BEFORE + FIFO/Unix arming")
			}
			a.SupervisorPID = first.PID
			ipc, ipcCancel := context.WithTimeout(ctx, ReadyBudget)
			ticket := requestReady(ipc, filepath.Join(namespace, "ready.sock"), a.AttemptID, a, func() bool { return true })
			ipcCancel()
			if ticket == nil {
				t.Fatal("real READY exchange")
			}
			fingerprint := func() string {
				var fp string
				if admin.QueryRow(ctx, `SELECT md5(json_build_array((SELECT json_agg(p ORDER BY id) FROM canonical_products p),(SELECT json_agg(p ORDER BY id) FROM offers p),(SELECT json_agg(p ORDER BY id) FROM product_mappings p))::text)`).Scan(&fp) != nil {
					t.Fatal("local fingerprint")
				}
				return fp
			}
			if scenario == "intervening" {
				s, e := engine.Stage(ctx, readyBundle(16))
				if e != nil || s.Publish(ctx) != nil {
					t.Fatal("legitimate intervening fixture publication")
				}
				s.Close()
			}
			beforeCanonical := fingerprint()
			candidate := readyBundle(17)
			if scenario == "stage_failure" {
				candidate.RawProducts = append(candidate.RawProducts, candidate.RawProducts[0])
			}
			staged, stageErr := engine.Stage(ctx, candidate)
			if fingerprint() != beforeCanonical {
				t.Fatal("Stage modified canonical/mapping/offer state")
			}
			if stageErr != nil {
				if scenario != "stage_failure" {
					t.Fatal("unexpected Stage failure")
				}
				_, _ = io.WriteString(control, "{\"exclude\":true}\n")
			} else {
				defer staged.Close()
				id, at := staged.Baseline()
				bound := ticket.BindBaseline(id, at)
				if bound == (scenario == "intervening") {
					t.Fatal("locked S0 match/mismatch was not enforced")
				}
				if scenario == "publish_failure" {
					if _, e = admin.Exec(ctx, `UPDATE snapshots SET status='failed',"publishedAt"=NULL WHERE id=$1`, id); e != nil {
						t.Fatal("local failure injection")
					}
				}
				var requests atomic.Int32
				secret := "part32-local-only-secret-00000000000000000000"
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					requests.Add(1)
					body, _ := io.ReadAll(io.LimitReader(r.Body, 129))
					if string(body) != Body || r.Header.Get("X-Adilbaga-Signature") != Signature(secret, r.Header.Get("X-Adilbaga-Timestamp")) {
						w.WriteHeader(401)
						return
					}
					if scenario == "notify_failure" {
						w.WriteHeader(401)
					} else {
						w.WriteHeader(204)
					}
				}))
				defer server.Close()
				client, e := New(server.URL+"/internal/revalidate", secret, "test")
				if e != nil {
					t.Fatal(e)
				}
				var receipt Attempt
				if bound {
					client.WithTrace(func(r Attempt) { receipt = r })
				}
				outcome, publishErr := PublishThenNotify(ctx, true, func(c context.Context) error {
					if e := staged.Publish(c); e != nil {
						return e
					}
					message, _ := json.Marshal(map[string]string{"published": staged.SnapshotID()})
					_, e := control.Write(append(message, '\n'))
					return e
				}, client.Notify)
				if scenario == "publish_failure" {
					if publishErr == nil || requests.Load() != 0 || fingerprint() != beforeCanonical {
						t.Fatal("failed Publish mutated canonical or notified")
					}
					_, _ = io.WriteString(control, "{\"exclude\":true}\n")
				} else {
					if publishErr != nil || requests.Load() != 1 {
						t.Fatal("publication/one notification behavior changed")
					}
					if (outcome == "degraded") != (scenario == "notify_failure") {
						t.Fatal("degraded outcome changed")
					}
					if bound {
						if Relay(first.FIFO, Event(staged.SnapshotID(), a.AttemptID, receipt)) != "sent" {
							t.Fatal("actual post-COMMIT FIFO")
						}
					} else {
						_, _ = io.WriteString(control, "{\"exclude\":true}\n")
					}
				}
			}
			var result struct {
				Acceptance           string `json:"acceptance"`
				Requests             int    `json:"requests"`
				Consumed             int    `json:"consumed"`
				FixtureOnly          bool   `json:"fixtureOnly"`
				BaselineNotDashboard bool   `json:"baselineNotDashboard"`
			}
			if decoder.Decode(&result) != nil {
				t.Fatal("Node capture/AFTER result")
			}
			_ = control.Close()
			if cmd.Wait() != nil {
				t.Fatal("Node lifecycle")
			}
			if !result.FixtureOnly || !result.BaselineNotDashboard || result.Consumed != 1 {
				t.Fatal("fixture boundary/true S0/consumption")
			}
			if scenario == "healthy" {
				if result.Acceptance != "PASS" || result.Requests != 6 {
					t.Fatal("full real-provider chain not qualified")
				}
			} else if result.Acceptance != "INCONCLUSIVE" || result.Requests != 0 {
				t.Fatal("negative chain admitted GET/false PASS")
			}
			t.Logf("%s: %s, GET=%d, actual Go BEFORE/READY/Stage/COMMIT/FIFO/AFTER; fixtureOnly=true", scenario, result.Acceptance, result.Requests)
		})
	}
}
