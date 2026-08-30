// Package cloudflare wraps the Cloudflare Stream API (spec §2/§31).
// Video ingest/encoding/delivery/recording all happen on Cloudflare's
// infrastructure — this package only ever exchanges small JSON metadata
// with Cloudflare's control API, never video bytes.
package cloudflare

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const baseURL = "https://api.cloudflare.com/client/v4"

type Client struct {
	accountID  string
	apiToken   string
	httpClient *http.Client
}

func NewClient(accountID, apiToken string) *Client {
	return &Client{
		accountID: accountID,
		apiToken:  apiToken,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

type apiError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type apiEnvelope struct {
	Success bool            `json:"success"`
	Errors  []apiError      `json:"errors"`
	Result  json.RawMessage `json:"result"`
}

// CloudflareAPIError is returned for any non-2xx or {success:false}
// response, with the raw Cloudflare error message preserved for logs —
// but never the request body, which may have contained the API token or,
// on some endpoints, a stream key. Callers must not log this error's
// underlying request context.
type CloudflareAPIError struct {
	StatusCode int
	Messages   []string
}

func (e *CloudflareAPIError) Error() string {
	return fmt.Sprintf("cloudflare stream api error (status %d): %v", e.StatusCode, e.Messages)
}

// do performs the request with retry-on-5xx (spec §31: "retries where
// safe" — GET is always safe to retry; POST is only retried here for
// idempotent calls like GetLiveInput, never for CreateLiveInput, which
// callers must guard with their own idempotency key at the database
// level instead, per spec §32).
func (c *Client) do(ctx context.Context, method, path string, body interface{}, retryable bool) (*apiEnvelope, error) {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(b)
	}

	var lastErr error
	attempts := 1
	if retryable {
		attempts = 3
	}

	for attempt := 0; attempt < attempts; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
			if reqBody != nil {
				b, _ := json.Marshal(body)
				reqBody = bytes.NewReader(b)
			}
		}

		req, err := http.NewRequestWithContext(ctx, method, baseURL+path, reqBody)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+c.apiToken)
		req.Header.Set("Content-Type", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		respBody, err := io.ReadAll(resp.Body)
		if err != nil {
			lastErr = err
			continue
		}

		if resp.StatusCode >= 500 {
			lastErr = &CloudflareAPIError{StatusCode: resp.StatusCode, Messages: []string{"server error"}}
			continue
		}

		var envelope apiEnvelope
		if err := json.Unmarshal(respBody, &envelope); err != nil {
			return nil, fmt.Errorf("decode cloudflare response: %w", err)
		}

		if !envelope.Success || resp.StatusCode >= 400 {
			msgs := make([]string, 0, len(envelope.Errors))
			for _, e := range envelope.Errors {
				msgs = append(msgs, e.Message)
			}
			return nil, &CloudflareAPIError{StatusCode: resp.StatusCode, Messages: msgs}
		}

		return &envelope, nil
	}

	return nil, fmt.Errorf("cloudflare request failed after retries: %w", lastErr)
}
