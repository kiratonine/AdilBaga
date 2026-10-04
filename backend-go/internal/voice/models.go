// Package voice owns deterministic voice state and business decisions. Providers
// may supply only independently validated intent/category/filter primitives.
package voice

import (
	"adilbaga/backend-go/internal/catalog"
	"context"
	"encoding/json"
	"errors"
	"time"
)

var ErrNotFound = errors.New("voice session not found or expired")
var ErrSessionUnavailable = errors.New("voice session unavailable")
var ErrInvalid = errors.New("invalid voice request")

const SessionTTL = 600 * time.Second

type Parsed struct {
	Intent   *string                    `json:"intent"`
	Category *string                    `json:"category"`
	Filters  map[string]json.RawMessage `json:"filters"`
}
type Session struct {
	Parsed
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}
type Input struct {
	Text            string
	Categories      []catalog.Category
	Schemas         []catalog.FilterSchema
	CurrentCategory *string
}
type Parser interface {
	Parse(context.Context, Input) (Parsed, error)
}
type SessionStore interface {
	Get(context.Context, string) (Session, bool, error)
	Set(context.Context, string, Session, time.Duration) error
	Delete(context.Context, string) error
}
type StartRequest struct {
	Text                string
	Latitude, Longitude float64
}
type ContinueRequest struct{ SessionID, Text string }
type Item struct {
	Name           string  `json:"name"`
	Price          int     `json:"price"`
	Store          string  `json:"store"`
	Address        *string `json:"address"`
	DistanceMeters *int    `json:"distanceMeters"`
	ImageURL       *string `json:"imageUrl"`
}

// Response's custom marshaler ensures the two wire branches have exactly their
// own fields, including a non-null empty items array for zero matches.
type Response struct {
	Status        string
	SessionID     string
	Question      string
	MissingFields []string
	Mode          string
	Speech        string
	Items         []Item
}

func (r Response) MarshalJSON() ([]byte, error) {
	if r.Status == "needs_clarification" {
		return json.Marshal(struct {
			Status        string   `json:"status"`
			SessionID     string   `json:"sessionId"`
			Question      string   `json:"question"`
			MissingFields []string `json:"missingFields"`
		}{r.Status, r.SessionID, r.Question, r.MissingFields})
	}
	return json.Marshal(struct {
		Status string `json:"status"`
		Mode   string `json:"mode"`
		Speech string `json:"speech"`
		Items  []Item `json:"items"`
	}{r.Status, r.Mode, r.Speech, r.Items})
}
