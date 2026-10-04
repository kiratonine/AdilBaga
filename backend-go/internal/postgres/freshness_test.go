package postgres

import (
	"testing"
	"time"
)

func TestStaleUsesCallerAge(t *testing.T) {
	now := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name string
		last time.Time
		age  time.Duration
		want bool
	}{
		{"missing", time.Time{}, time.Hour, true},
		{"invalid caller age", now, 0, true},
		{"boundary", now.Add(-time.Hour), time.Hour, false},
		{"older", now.Add(-time.Hour - time.Nanosecond), time.Hour, true},
		{"fresh", now.Add(-time.Minute), time.Hour, false},
		{"future capture", now.Add(time.Minute), time.Hour, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if IsStale(now, tc.last, tc.age) != tc.want {
				t.Fatal("caller age semantics")
			}
		})
	}
}
