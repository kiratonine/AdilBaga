package ingestion

import (
	"testing"
	"time"
)

func TestStageBaselineValueOnly(t *testing.T) {
	at := time.Now().UTC().Truncate(time.Millisecond)
	s := &Staged{previous: baseline{ID: "prior", PublishedAt: &at}}
	id, copy := s.Baseline()
	if id != "prior" || !copy.Equal(at) {
		t.Fatal("baseline mismatch")
	}
	copy = copy.Add(time.Hour)
	_, again := s.Baseline()
	if again.Equal(copy) || !again.Equal(at) {
		t.Fatal("accessor exposes mutable baseline")
	}
	empty := &Staged{}
	id, zero := empty.Baseline()
	if id != "" || !zero.IsZero() {
		t.Fatal("missing baseline invented")
	}
}
