package revalidation

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"regexp"
	"sync/atomic"
	"time"
)

// Owner-approved READY-only admission ceiling (2026-10-24). One client
// deadline covers admission AND exchange. This is before Stage/COMMIT, not the
// separate five-second convergence SLA measured after an accepted HTTP204.
const ReadyBudget = 5000 * time.Millisecond
const ReadyLimit = 4096
const readyTime = "2006-01-02T15:04:05.000Z"

type readyPhase uint32

const (
	phaseOptIn readyPhase = iota
	phaseAuthorityRead
	phaseAuthorityValidate
	phaseNodeHash
	phaseRelayHash
	phaseSupervisorIdentity
	phaseSupervisorHash
	phaseSelfIdentity
	phaseSocketCheck
	phaseConnect
	phasePeerCheck
	phaseAuthorityRecheck
	phaseRequestWrite
	phaseResponseRead
	phaseResponseValidate
	phaseSocketRecheck
	phaseComplete
	phaseUnsupported
)

type readyReason uint8

const (
	reasonRejected readyReason = iota
	reasonDisabled
	reasonConfiguration
	reasonAuthorityUnavailable
	reasonAuthorityInvalid
	reasonLifetime
	reasonBoot
	reasonFile
	reasonDigest
	reasonProcess
	reasonSocket
	reasonTransport
	reasonPeer
	reasonAuthorityChanged
	reasonSocketChanged
	reasonNonce
	reasonResponse
	reasonDeadline
	reasonParentDeadline
	reasonCancelled
	reasonReady
	reasonUnsupported
)

type readyOutcome uint8

const (
	outcomeNotArmed readyOutcome = iota
	outcomeDisabled
	outcomeArmed
)

// ReadyDiagnostic is a value-only terminal snapshot, never a capability or raw
// error. Private fields and fixed enums prevent input/authority values entering
// telemetry. The optional worker cannot rewrite the returned outcome.
type ReadyDiagnostic struct {
	phase               readyPhase
	reason              readyReason
	outcome             readyOutcome
	elapsedMS           int64
	deadlineOrCancelled bool
}

func (d ReadyDiagnostic) Phase() string {
	values := [...]string{"opt_in", "authority_read", "authority_validate", "hash_node", "hash_relay", "supervisor_identity", "hash_supervisor", "self_identity", "socket_check", "connect", "peer_check", "authority_recheck", "request_write", "response_read", "response_validate", "socket_recheck", "complete", "unsupported"}
	if int(d.phase) >= len(values) {
		return "unsupported"
	}
	return values[d.phase]
}
func (d ReadyDiagnostic) Reason() string {
	values := [...]string{"rejected", "disabled", "configuration_invalid", "authority_unavailable", "authority_invalid", "lifetime_invalid", "boot_mismatch", "file_invalid", "hash_mismatch", "process_identity", "socket_invalid", "transport_error", "peer_rejected", "authority_changed", "socket_changed", "nonce_unavailable", "response_invalid", "deadline", "parent_deadline", "cancelled", "ready", "unsupported"}
	if int(d.reason) >= len(values) {
		return "rejected"
	}
	return values[d.reason]
}
func (d ReadyDiagnostic) Outcome() string {
	if d.outcome == outcomeArmed {
		return "armed"
	}
	if d.outcome == outcomeDisabled {
		return "disabled"
	}
	return "not_armed"
}
func (d ReadyDiagnostic) ElapsedMS() int64          { return d.elapsedMS }
func (d ReadyDiagnostic) DeadlineOrCancelled() bool { return d.deadlineOrCancelled }

type readyProgress struct{ phase atomic.Uint32 }

func (p *readyProgress) enter(phase readyPhase) {
	if p != nil {
		p.phase.Store(uint32(phase))
	}
}
func (p *readyProgress) snapshot() readyPhase {
	if p == nil {
		return phaseOptIn
	}
	return readyPhase(p.phase.Load())
}

type readyFailure readyReason

func (readyFailure) Error() string { return "ready_rejected" }

// Backward-compatible class-only entrypoint; no diagnostic logging or callback.
func RequestReady(parent context.Context, fifo, id string) (*ReadyTicket, string) {
	ticket, d := RequestReadyDetailed(parent, fifo, id)
	return ticket, d.Outcome()
}

// A scheduled context timer can lag under CPU contention. Do not grant a
// ticket past the actual monotonic deadline while Err is still being set.
func readyContextEnded(ctx context.Context) bool {
	if ctx.Err() != nil {
		return true
	}
	deadline, ok := ctx.Deadline()
	return ok && !time.Now().Before(deadline)
}

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
	FrontendSHA      string        `json:"frontendSha,omitempty"`
	DeploymentID     string        `json:"deploymentId,omitempty"`
	ConfirmedAt      string        `json:"confirmedAt"`
	BootID           string        `json:"bootId"`
	ExpiresAt        string        `json:"expiresAt"`
	EvidencePolicy   string        `json:"evidencePolicy,omitempty"`
	PolicyVersion    int           `json:"policyVersion,omitempty"`
	PolicySHA256     string        `json:"policySha256,omitempty"`
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

// The two evidence contracts are disjoint. A site policy is never encoded as
// frontend identity, nor can v1 carry unauthenticated v2 extension fields.
func validReadyPolicy(version int, frontend, deployment, policy string, policyVersion int, digest string) bool {
	if version == 1 {
		return readySHA.MatchString(frontend) && readyDeployment.MatchString(deployment) && policy == "" && policyVersion == 0 && digest == ""
	}
	return version == 2 && frontend == "" && deployment == "" && policy == "site-content-verification" && policyVersion == 2 && readyDigest.MatchString(digest)
}

func validReadyResponse(r ReadyResponse, request ReadyRequest, now time.Time) bool {
	_, s0 := exactReadyTime(r.S0.PublishedAt)
	confirmed, c := exactReadyTime(r.ConfirmedAt)
	expiry, e := exactReadyTime(r.ExpiresAt)
	return validReadyPolicy(r.Version, r.FrontendSHA, r.DeploymentID, r.EvidencePolicy, r.PolicyVersion, r.PolicySHA256) && r.Status == "READY" && r.AttemptID == request.AttemptID && r.Nonce == request.Nonce &&
		uuidPattern.MatchString(r.S0.SnapshotID) && s0 && readyDigest.MatchString(r.ProjectionSHA256) &&
		readyDigest.MatchString(r.WitnessSHA256) && readySHA.MatchString(r.SourceSHA) &&
		uuidPattern.MatchString(r.BootID) && c && e &&
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
