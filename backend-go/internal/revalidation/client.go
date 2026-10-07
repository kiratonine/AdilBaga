// Package revalidation signs a fixed post-publication cache invalidation event.
package revalidation

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const Body = `{"event":"snapshot_published"}`

type Client struct {
	endpoint, secret string
	http             *http.Client
}

func New(endpoint, secret, environment string) (*Client, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u == nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "/internal/revalidate" || len(secret) < 32 ||
		(environment != "production" && environment != "test" && environment != "development") ||
		(u.Scheme != "https" && !(environment != "production" && u.Scheme == "http" && (u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost" || u.Hostname() == "::1"))) {
		return nil, errors.New("revalidation configuration invalid")
	}
	return &Client{endpoint: endpoint, secret: secret, http: &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}

func Signature(secret, timestamp string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(timestamp + "." + Body))
	return "v1=" + hex.EncodeToString(mac.Sum(nil))
}

func (c *Client) Notify(ctx context.Context) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, strings.NewReader(Body))
	if err != nil {
		return errors.New("revalidation request unavailable")
	}
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Adilbaga-Timestamp", timestamp)
	request.Header.Set("X-Adilbaga-Signature", Signature(c.secret, timestamp))
	response, err := c.http.Do(request)
	if err != nil {
		return errors.New("revalidation transport unavailable")
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1024))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return errors.New("revalidation rejected")
	}
	return nil
}

// PublishThenNotify preserves committed publication success even on notification
// failure. No notification runs on dry-run or failed publish. A fresh bounded
// context prevents a consumed ingestion deadline from skipping the notification.
func PublishThenNotify(ctx context.Context, apply bool, publish func(context.Context) error, notify func(context.Context) error) (string, error) {
	if !apply {
		return "not_requested", nil
	}
	if err := publish(ctx); err != nil {
		return "not_attempted", err
	}
	notificationCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := notify(notificationCtx); err != nil {
		return "degraded", nil
	}
	return "success", nil
}
