// Package redis is a bounded Upstash REST session adapter, not a catalog cache.
package redis

import (
	"adilbaga/backend-go/internal/voice"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

const MaxResponseBytes = 1 << 20

func sessionKey(id string) string {
	digest := sha256.Sum256([]byte(id))
	return "voice-session:v1:" + hex.EncodeToString(digest[:])
}

type Store struct {
	url, token string
	http       *http.Client
}

func New(url, token string) *Store {
	return &Store{url: url, token: token, http: &http.Client{Timeout: 3 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}
func (s *Store) command(ctx context.Context, command []any) (json.RawMessage, error) {
	if s.url == "" || s.token == "" {
		return nil, voice.ErrSessionUnavailable
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	raw, err := json.Marshal(command)
	if err != nil {
		return nil, voice.ErrSessionUnavailable
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, bytes.NewReader(raw))
	if err != nil {
		return nil, voice.ErrSessionUnavailable
	}
	req.Header.Set("Authorization", "Bearer "+s.token)
	req.Header.Set("Content-Type", "application/json")
	response, err := s.http.Do(req)
	if err != nil {
		return nil, voice.ErrSessionUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, voice.ErrSessionUnavailable
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, MaxResponseBytes+1))
	if err != nil || len(data) > MaxResponseBytes {
		return nil, voice.ErrSessionUnavailable
	}
	var result struct {
		Result json.RawMessage `json:"result"`
		Error  json.RawMessage `json:"error"`
	}
	if json.Unmarshal(data, &result) != nil || result.Result == nil || (len(result.Error) > 0 && string(result.Error) != "null") {
		return nil, voice.ErrSessionUnavailable
	}
	return result.Result, nil
}
func (s *Store) Set(ctx context.Context, id string, state voice.Session, ttl time.Duration) error {
	if ttl != voice.SessionTTL {
		return voice.ErrSessionUnavailable
	}
	raw, err := json.Marshal(state)
	if err != nil {
		return voice.ErrSessionUnavailable
	}
	result, err := s.command(ctx, []any{"SET", sessionKey(id), string(raw), "EX", 600})
	if err != nil {
		return err
	}
	var ok string
	if json.Unmarshal(result, &ok) != nil || ok != "OK" {
		return voice.ErrSessionUnavailable
	}
	return nil
}
func (s *Store) Get(ctx context.Context, id string) (voice.Session, bool, error) {
	result, err := s.command(ctx, []any{"GET", sessionKey(id)})
	if err != nil {
		return voice.Session{}, false, err
	}
	if string(result) == "null" {
		return voice.Session{}, false, nil
	}
	var raw string
	var state voice.Session
	if json.Unmarshal(result, &raw) != nil || json.Unmarshal([]byte(raw), &state) != nil || state.Filters == nil {
		return state, false, voice.ErrSessionUnavailable
	}
	return state, true, nil
}
func (s *Store) Delete(ctx context.Context, id string) error {
	result, err := s.command(ctx, []any{"DEL", sessionKey(id)})
	if err != nil {
		return err
	}
	var count int
	if json.Unmarshal(result, &count) != nil || count < 0 || count > 1 {
		return voice.ErrSessionUnavailable
	}
	return nil
}
