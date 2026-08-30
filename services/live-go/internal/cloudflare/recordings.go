package cloudflare

import (
	"context"
	"encoding/json"
	"fmt"
)

// VideoStatus mirrors the subset of Cloudflare's video-details response
// Jedida cares about (spec §18: "do not assume the recording is
// immediately ready — check its processing state").
type VideoStatus struct {
	UID    string `json:"uid"`
	Status struct {
		State       string `json:"state"` // "inprogress" | "ready" | "error"
		ErrorReason string `json:"errReasonCode,omitempty"`
	} `json:"status"`
	Duration     float64 `json:"duration"`
	Playback struct {
		HLS  string `json:"hls"`
		Dash string `json:"dash"`
	} `json:"playback"`
	ReadyToStream bool `json:"readyToStream"`
}

func (c *Client) GetVideoStatus(ctx context.Context, videoUID string) (*VideoStatus, error) {
	env, err := c.do(ctx, "GET", fmt.Sprintf("/accounts/%s/stream/%s", c.accountID, videoUID), nil, true)
	if err != nil {
		return nil, err
	}
	var status VideoStatus
	if err := json.Unmarshal(env.Result, &status); err != nil {
		return nil, fmt.Errorf("decode video status: %w", err)
	}
	return &status, nil
}

// SignedPlaybackToken requests a short-lived signed playback token for a
// video that has requireSignedURLs enabled (spec §19). Only called for
// private/restricted live events — public events use the plain playback
// URL Cloudflare returns directly.
func (c *Client) SignedPlaybackToken(ctx context.Context, videoUID string, expirySeconds int) (string, error) {
	env, err := c.do(ctx, "POST", fmt.Sprintf("/accounts/%s/stream/%s/token", c.accountID, videoUID),
		map[string]int{"exp": expirySeconds}, false)
	if err != nil {
		return "", err
	}
	var result struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(env.Result, &result); err != nil {
		return "", fmt.Errorf("decode signed token: %w", err)
	}
	return result.Token, nil
}
