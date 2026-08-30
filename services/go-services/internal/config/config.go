// Package config centralizes environment configuration for every Go service
// (chat, live, affiliate). It deliberately reads the SAME variable names the
// Node backend already uses (DATABASE_URL, JWT_ACCESS_SECRET, ...) so a
// single .env can serve both runtimes — there is no separate Go auth system
// and no separate database.
package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	// DatabaseURL must point at the SAME Postgres database the Node backend
	// uses. Go never owns a database of its own.
	DatabaseURL string

	// JWTAccessSecret must be byte-identical to backend/.env's
	// JWT_ACCESS_SECRET. Go validates the exact same access tokens Node
	// issues; it never mints its own tokens and never uses a different
	// secret or algorithm (HS256, matching backend/src/utils/jwt.js).
	JWTAccessSecret string

	// ChatPort is where the Go Chat Engine's WebSocket endpoint listens.
	// Runs alongside (not instead of) the existing Socket.IO server during
	// the migration window — see go-services/README.md.
	ChatPort int

	// LivePort is where the Go Live Events Engine's WebSocket endpoint
	// listens. Separate port/binary from Chat — independently deployable
	// and independently restartable.
	LivePort int

	// FrontendOrigin mirrors backend's FRONTEND_URL, used for the WS
	// handshake's CORS/origin check.
	FrontendOrigin string

	// MaxConnectionsPerUser bounds how many concurrent sockets a single
	// user may hold open (multiple tabs/devices), to keep the connection
	// table bounded under abuse.
	MaxConnectionsPerUser int

	// MaxViewersPerSession bounds concurrent connections to a single live
	// session room. 0 means unbounded.
	MaxViewersPerSession int

	// AffiliatePort is where the Go Affiliate Engine's internal HTTP API
	// listens. Not customer-facing — only the Node backend (and cron/admin
	// tooling) should ever call it.
	AffiliatePort int

	// InternalServiceSecret authenticates ALL server-to-server calls
	// between Node and Go (no end-user ever holds this) — both directions:
	// Node calling into the Go Affiliate Engine's /events and
	// /payouts/prepare-batch, and Go Chat calling back into Node's
	// internal push-notification endpoint. This is a NEW shared secret —
	// nothing like it existed in the base repo, since nothing previously
	// needed backend-to-backend auth. Must be set to the same value
	// everywhere for calls to succeed.
	InternalServiceSecret string

	// NodeInternalBaseURL is where the Go Chat Engine reaches the Node
	// backend's internal API (currently just the push-notification
	// callback) — e.g. http://localhost:5000 (no /api prefix — internal
	// routes are mounted separately from the public API, see
	// backend/src/routes/internalPush.js). Empty disables push
	// notifications entirely (same effect as pushService.js's
	// isPushConfigured() returning false).
	NodeInternalBaseURL string
}

func mustEnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func Load() (*Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required (same value as backend/.env)")
	}
	secret := os.Getenv("JWT_ACCESS_SECRET")
	if secret == "" {
		return nil, fmt.Errorf("JWT_ACCESS_SECRET is required (must match backend/.env exactly)")
	}

	port := 8081
	if p := os.Getenv("GO_CHAT_PORT"); p != "" {
		parsed, err := strconv.Atoi(p)
		if err != nil {
			return nil, fmt.Errorf("GO_CHAT_PORT must be an integer: %w", err)
		}
		port = parsed
	}

	maxConn := 8
	if m := os.Getenv("GO_CHAT_MAX_CONNS_PER_USER"); m != "" {
		parsed, err := strconv.Atoi(m)
		if err == nil && parsed > 0 {
			maxConn = parsed
		}
	}

	livePort := 8082
	if p := os.Getenv("GO_LIVE_PORT"); p != "" {
		parsed, err := strconv.Atoi(p)
		if err != nil {
			return nil, fmt.Errorf("GO_LIVE_PORT must be an integer: %w", err)
		}
		livePort = parsed
	}

	maxViewers := 0
	if m := os.Getenv("GO_LIVE_MAX_VIEWERS_PER_SESSION"); m != "" {
		parsed, err := strconv.Atoi(m)
		if err == nil && parsed > 0 {
			maxViewers = parsed
		}
	}

	affiliatePort := 8083
	if p := os.Getenv("GO_AFFILIATE_PORT"); p != "" {
		parsed, err := strconv.Atoi(p)
		if err != nil {
			return nil, fmt.Errorf("GO_AFFILIATE_PORT must be an integer: %w", err)
		}
		affiliatePort = parsed
	}

	internalSecret := os.Getenv("GO_AFFILIATE_INTERNAL_SECRET")
	// Deliberately not required at load time (chat/live services also call
	// config.Load and don't need this var); cmd/affiliate/main.go itself
	// refuses to start without it — see there for why.

	nodeInternalURL := os.Getenv("GO_NODE_INTERNAL_URL")

	return &Config{
		DatabaseURL:           dbURL,
		JWTAccessSecret:       secret,
		ChatPort:              port,
		LivePort:              livePort,
		FrontendOrigin:        mustEnvOrDefault("FRONTEND_URL", "*"),
		MaxConnectionsPerUser: maxConn,
		MaxViewersPerSession:  maxViewers,
		AffiliatePort:         affiliatePort,
		InternalServiceSecret: internalSecret,
		NodeInternalBaseURL:   nodeInternalURL,
	}, nil
}
