// Package config loads environment configuration for the Live service.
// Deliberately reuses the exact same env var names as backend/.env
// (DATABASE_URL / PG*, JWT_ACCESS_SECRET) so the same .env file that
// configures the Node backend also configures this service — no second
// set of credentials to keep in sync.
package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	Port                  string
	DatabaseURL           string
	JWTAccessSecret       string
	CloudflareAccountID   string
	CloudflareAPIToken    string
	CloudflareCustomerCode string
	MaxWSConnPerEvent     int
}

func Load() (*Config, error) {
	c := &Config{
		Port:                   getEnv("LIVE_SERVICE_PORT", "8081"),
		DatabaseURL:            os.Getenv("DATABASE_URL"),
		JWTAccessSecret:        os.Getenv("JWT_ACCESS_SECRET"),
		CloudflareAccountID:    os.Getenv("CLOUDFLARE_ACCOUNT_ID"),
		CloudflareAPIToken:     os.Getenv("CLOUDFLARE_STREAM_API_TOKEN"),
		CloudflareCustomerCode: os.Getenv("CLOUDFLARE_STREAM_CUSTOMER_CODE"),
	}

	if c.DatabaseURL == "" {
		// Fall back to discrete PG* vars, same fallback order as the Node
		// backend's db.js, so either .env shape works unmodified.
		host := getEnv("PGHOST", "localhost")
		port := getEnv("PGPORT", "5432")
		user := os.Getenv("PGUSER")
		pass := os.Getenv("PGPASSWORD")
		name := os.Getenv("PGDATABASE")
		if user == "" || name == "" {
			return nil, fmt.Errorf("no DATABASE_URL and PGUSER/PGDATABASE are unset — cannot connect to Postgres")
		}
		c.DatabaseURL = fmt.Sprintf("postgres://%s:%s@%s:%s/%s", user, pass, host, port, name)
	}

	if c.JWTAccessSecret == "" {
		return nil, fmt.Errorf("JWT_ACCESS_SECRET is required — the Live service validates the same access tokens the Node backend issues")
	}
	if c.CloudflareAccountID == "" || c.CloudflareAPIToken == "" {
		return nil, fmt.Errorf("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_API_TOKEN are required")
	}

	maxConn, _ := strconv.Atoi(getEnv("LIVE_MAX_WS_PER_EVENT", "5000"))
	c.MaxWSConnPerEvent = maxConn

	return c, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
