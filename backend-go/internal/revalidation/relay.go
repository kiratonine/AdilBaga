package revalidation

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"regexp"
)

type Attempt struct {
	Status                                 int
	StartMono, EndMono, BootID, ErrorClass string
}

// Only allowlisted metadata; no URL, headers, payload or captures without membership.
type RelayEvent struct {
	Version    int    `json:"version"`
	SnapshotID string `json:"snapshotId"`
	AttemptID  string `json:"attemptId"`
	Status     int    `json:"status"`
	StartMono  string `json:"startMono"`
	EndMono    string `json:"endMono"`
	BootID     string `json:"bootId"`
	ErrorClass string `json:"errorClass"`
}

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var attemptPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)
var nsPattern = regexp.MustCompile(`^[1-9][0-9]{0,19}$`)

func AttemptID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return ""
	}
	return hex.EncodeToString(b[:])
}

func Event(snapshot, id string, a Attempt) RelayEvent {
	return RelayEvent{1, snapshot, id, a.Status, a.StartMono, a.EndMono, a.BootID, a.ErrorClass}
}

func eventBytes(e RelayEvent) []byte {
	if e.Version != 1 || !uuidPattern.MatchString(e.SnapshotID) || !attemptPattern.MatchString(e.AttemptID) || !uuidPattern.MatchString(e.BootID) || !nsPattern.MatchString(e.StartMono) || !nsPattern.MatchString(e.EndMono) || e.Status < 0 || e.Status > 599 {
		return nil
	}
	switch e.ErrorClass {
	case "none", "transport", "timeout", "canceled", "rejected", "clock_unavailable":
	default:
		return nil
	}
	b, err := json.Marshal(e)
	if err != nil || len(b)+1 > 4096 {
		return nil
	}
	return append(b, '\n')
}
