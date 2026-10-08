package httpapi

import (
	"adilbaga/backend-go/internal/middleware"
	"adilbaga/backend-go/internal/voice"
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

type VoiceService interface {
	Start(context.Context, voice.StartRequest) (voice.Response, error)
	Continue(context.Context, voice.ContinueRequest) (voice.Response, error)
}

var numericCoordinate = regexp.MustCompile(`^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$`)

type coordinate float64

func (c *coordinate) UnmarshalJSON(raw []byte) error {
	value := string(raw)
	if len(raw) > 0 && raw[0] == '"' {
		if json.Unmarshal(raw, &value) != nil {
			return voice.ErrInvalid
		}
		value = strings.TrimSpace(value)
	}
	if !numericCoordinate.MatchString(value) {
		return voice.ErrInvalid
	}
	n, err := strconv.ParseFloat(value, 64)
	if err != nil || math.IsNaN(n) || math.IsInf(n, 0) {
		return voice.ErrInvalid
	}
	*c = coordinate(n)
	return nil
}
func decodeVoice(r *http.Request, target any) error {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil {
		return voice.ErrInvalid
	}
	var reader io.Reader = r.Body
	switch mediaType {
	case "application/json":
	case "application/x-www-form-urlencoded":
		// NestJS also accepts forms. Preserve that existing wire behavior without
		// merging URL query values into the body or introducing a 415 response.
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			return voice.ErrInvalid
		}
		values, err := url.ParseQuery(string(raw))
		if err != nil {
			return voice.ErrInvalid
		}
		body := map[string]string{}
		for key, options := range values {
			if len(options) != 1 {
				return voice.ErrInvalid
			}
			body[key] = options[0]
		}
		raw, err = json.Marshal(body)
		if err != nil {
			return voice.ErrInvalid
		}
		reader = strings.NewReader(string(raw))
	default:
		return voice.ErrInvalid
	}
	dec := json.NewDecoder(reader)
	dec.DisallowUnknownFields()
	if dec.Decode(target) != nil || dec.Decode(new(any)) != io.EOF {
		return voice.ErrInvalid
	}
	return nil
}
func voiceResponse(w http.ResponseWriter, response voice.Response, err error) {
	w.Header().Set("Cache-Control", "no-store")
	if err != nil {
		status := 500
		if errors.Is(err, voice.ErrInvalid) {
			status = 400
		} else if errors.Is(err, voice.ErrNotFound) {
			status = 404
		} else if errors.Is(err, voice.ErrSessionUnavailable) {
			status = 503
		}
		middleware.WriteError(w, status)
		return
	}
	raw, err := json.Marshal(response)
	if err != nil {
		middleware.WriteError(w, 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(201)
	_, _ = w.Write(raw)
}
func (d Dependencies) voiceStart(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text      *string     `json:"text"`
		Latitude  *coordinate `json:"latitude"`
		Longitude *coordinate `json:"longitude"`
	}
	if decodeVoice(r, &body) != nil || body.Text == nil || strings.TrimSpace(*body.Text) == "" || body.Latitude == nil || body.Longitude == nil || math.Abs(float64(*body.Latitude)) > 90 || math.Abs(float64(*body.Longitude)) > 180 {
		voiceResponse(w, voice.Response{}, voice.ErrInvalid)
		return
	}
	if d.Voice == nil {
		voiceResponse(w, voice.Response{}, voice.ErrSessionUnavailable)
		return
	}
	response, err := d.Voice.Start(r.Context(), voice.StartRequest{Text: *body.Text, Latitude: float64(*body.Latitude), Longitude: float64(*body.Longitude)})
	voiceResponse(w, response, err)
}
func (d Dependencies) voiceContinue(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text      *string `json:"text"`
		SessionID *string `json:"sessionId"`
	}
	if decodeVoice(r, &body) != nil || body.Text == nil || strings.TrimSpace(*body.Text) == "" || body.SessionID == nil || strings.TrimSpace(*body.SessionID) == "" {
		voiceResponse(w, voice.Response{}, voice.ErrInvalid)
		return
	}
	if d.Voice == nil {
		voiceResponse(w, voice.Response{}, voice.ErrSessionUnavailable)
		return
	}
	response, err := d.Voice.Continue(r.Context(), voice.ContinueRequest{Text: *body.Text, SessionID: *body.SessionID})
	voiceResponse(w, response, err)
}
