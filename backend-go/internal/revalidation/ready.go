package revalidation

import (
	"bytes"
	"encoding/json"
	"io"
	"regexp"
	"sync/atomic"
	"time"
)

const ReadyBudget = 1500 * time.Millisecond
const ReadyLimit = 4096
const readyTime = "2006-01-02T15:04:05.000Z"

type ReadyRequest struct {
	Version   int    `json:"version"`
	AttemptID string `json:"attemptId"`
	Nonce     string `json:"nonce"`
}
type ReadyBaseline struct {
	SnapshotID  string `json:"snapshotId"`
	PublishedAt string `json:"publishedAt"`
}
type ReadyResponse struct {
	Version          int           `json:"version"`
	Status           string        `json:"status"`
	AttemptID        string        `json:"attemptId"`
	Nonce            string        `json:"nonce"`
	S0               ReadyBaseline `json:"s0"`
	ProjectionSHA256 string        `json:"projectionSha256"`
	WitnessSHA256    string        `json:"witnessSha256"`
	SourceSHA        string        `json:"sourceSha"`
	FrontendSHA      string        `json:"frontendSha"`
	DeploymentID     string        `json:"deploymentId"`
	ConfirmedAt      string        `json:"confirmedAt"`
	BootID           string        `json:"bootId"`
	ExpiresAt        string        `json:"expiresAt"`
}

func canonicalReady(raw []byte, value any) bool {
	if len(raw) == 0 || len(raw) > ReadyLimit || raw[len(raw)-1] != '\n' {
		return false
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if d.Decode(value) != nil || d.Decode(new(any)) != io.EOF {
		return false
	}
	expected, err := json.Marshal(value)
	return err == nil && bytes.Equal(append(expected, '\n'), raw)
}
func exactReadyTime(v string) (time.Time, bool) {
	t, err := time.Parse(readyTime, v)
	return t, err == nil && len(v) == 24 && t.UTC().Format(readyTime) == v
}

var readyDigest = regexp.MustCompile(`^[a-f0-9]{64}$`)
var readySHA = regexp.MustCompile(`^[a-f0-9]{40}$`)
var readyDeployment = regexp.MustCompile(`^dpl_[a-zA-Z0-9]{1,80}$`)

func validReadyResponse(r ReadyResponse, request ReadyRequest, now time.Time) bool {
	_, s0 := exactReadyTime(r.S0.PublishedAt)
	confirmed, c := exactReadyTime(r.ConfirmedAt)
	expiry, e := exactReadyTime(r.ExpiresAt)
	return r.Version == 1 && r.Status == "READY" && r.AttemptID == request.AttemptID && r.Nonce == request.Nonce &&
		uuidPattern.MatchString(r.S0.SnapshotID) && s0 && readyDigest.MatchString(r.ProjectionSHA256) &&
		readyDigest.MatchString(r.WitnessSHA256) && readySHA.MatchString(r.SourceSHA) && readySHA.MatchString(r.FrontendSHA) &&
		readyDeployment.MatchString(r.DeploymentID) && uuidPattern.MatchString(r.BootID) && c && e &&
		!confirmed.After(now) && expiry.After(now) && expiry.Sub(confirmed) > 0 && expiry.Sub(confirmed) <= 35*time.Minute
}

// Only the checked IPC client can mint a ticket. It is consumed once by the
// baseline comparison, never exported/serialized as a production capability.
type ReadyTicket struct {
	response ReadyResponse
	used     atomic.Bool
}

func (t *ReadyTicket) BindBaseline(snapshot string, at time.Time) bool {
	if t == nil || t.used.Swap(true) || at.IsZero() || at.Nanosecond()%int(time.Millisecond) != 0 {
		return false
	}
	expiry, ok := exactReadyTime(t.response.ExpiresAt)
	return ok && time.Now().Before(expiry) && snapshot == t.response.S0.SnapshotID && at.UTC().Format(readyTime) == t.response.S0.PublishedAt
}
