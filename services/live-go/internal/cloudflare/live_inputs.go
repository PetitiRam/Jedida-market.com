package cloudflare

import (
	"context"
	"encoding/json"
	"fmt"
)

// LiveInput mirrors the fields Jedida actually uses from Cloudflare's
// live_inputs response. StreamKey is only ever present in the create
// response and is the caller's responsibility to hand to the seller once
// and never persist in plaintext outside that single response — see
// handlers/live.go's StartLive handler, the only place this field is read.
type LiveInput struct {
	UID  string `json:"uid"`
	RTMPS struct {
		URL       string `json:"url"`
		StreamKey string `json:"streamKey"`
	} `json:"rtmps"`
	SRT struct {
		URL         string `json:"url"`
		StreamID    string `json:"streamId"`
		Passphrase  string `json:"passphrase"`
	} `json:"srt"`
	Status struct {
		Current string `json:"current"`
	} `json:"status"`
	Meta map[string]string `json:"meta"`
}

type createLiveInputRequest struct {
	Meta              map[string]string `json:"meta"`
	Recording         recordingConfig   `json:"recording"`
	DeleteRecordingAfterDays *int       `json:"deleteRecordingAfterDays,omitempty"`
}

type recordingConfig struct {
	Mode              string `json:"mode"` // "automatic" — spec §6 "use automatic recording where appropriate"
	RequireSignedURLs bool   `json:"requireSignedURLs"`
	TimeoutSeconds    int    `json:"timeoutSeconds"`
}

// CreateLiveInput provisions a new Cloudflare Live Input for one Jedida
// live event. Not retried automatically (see client.go's `do`) — the
// caller (internal/live/service.go) is responsible for wrapping this in
// its own database-transaction-level idempotency check first (spec §32),
// so a duplicate "Start Live" tap never reaches this function twice for
// the same event in the first place.
func (c *Client) CreateLiveInput(ctx context.Context, eventID string, requireSignedURLs bool, retentionDays int) (*LiveInput, error) {
	req := createLiveInputRequest{
		Meta: map[string]string{"jedida_live_event_id": eventID},
		Recording: recordingConfig{
			Mode:              "automatic",
			RequireSignedURLs: requireSignedURLs,
			TimeoutSeconds:    60,
		},
	}
	if retentionDays > 0 {
		req.DeleteRecordingAfterDays = &retentionDays
	}

	env, err := c.do(ctx, "POST", fmt.Sprintf("/accounts/%s/stream/live_inputs", c.accountID), req, false)
	if err != nil {
		return nil, err
	}
	var input LiveInput
	if err := json.Unmarshal(env.Result, &input); err != nil {
		return nil, fmt.Errorf("decode live input: %w", err)
	}
	return &input, nil
}

func (c *Client) GetLiveInput(ctx context.Context, uid string) (*LiveInput, error) {
	env, err := c.do(ctx, "GET", fmt.Sprintf("/accounts/%s/stream/live_inputs/%s", c.accountID, uid), nil, true)
	if err != nil {
		return nil, err
	}
	var input LiveInput
	if err := json.Unmarshal(env.Result, &input); err != nil {
		return nil, fmt.Errorf("decode live input: %w", err)
	}
	return &input, nil
}

// DisableLiveInput stops accepting new broadcaster connections (spec
// §17.3) without deleting the input or its already-produced recording.
func (c *Client) DisableLiveInput(ctx context.Context, uid string) error {
	_, err := c.do(ctx, "PUT", fmt.Sprintf("/accounts/%s/stream/live_inputs/%s", c.accountID, uid),
		map[string]bool{"disabled": true}, false)
	return err
}

func (c *Client) DeleteLiveInput(ctx context.Context, uid string) error {
	_, err := c.do(ctx, "DELETE", fmt.Sprintf("/accounts/%s/stream/live_inputs/%s", c.accountID, uid), nil, false)
	return err
}
