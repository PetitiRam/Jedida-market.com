package handlers

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"jedida.com/live/internal/models"
)

type ctxKey string

const userCtxKey ctxKey = "authedUser"

// authClaims mirrors exactly what backend/src/utils/jwt.js's
// signAccessToken puts in the token (sub/role/isAdmin/adminRole/
// mfaEnabled) — this service must accept the same tokens the Node
// backend issues, not a second token format.
type authClaims struct {
	Subject   string `json:"sub"`
	Role      string `json:"role"`
	IsAdmin   bool   `json:"isAdmin"`
	AdminRole string `json:"adminRole"`
	jwt.RegisteredClaims
}

// ValidateToken is the shared core both RequireAuth (for normal HTTP
// requests, via the Authorization header) and the WebSocket handshake
// (internal/handlers/chat_ws.go — browsers cannot set custom headers on a
// WebSocket connection, so it can't use this same header-based path) use
// to check a token against the same secret/algorithm/claims shape the
// Node backend signs.
func ValidateToken(secret, tokenStr string) (models.AuthedUser, error) {
	claims := &authClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	}, jwt.WithValidMethods([]string{"HS256"}))

	if err != nil || !token.Valid || claims.Subject == "" {
		return models.AuthedUser{}, jwt.ErrTokenInvalidClaims
	}
	return models.AuthedUser{
		UserID:    claims.Subject,
		Role:      claims.Role,
		IsAdmin:   claims.IsAdmin,
		AdminRole: claims.AdminRole,
	}, nil
}

func RequireAuth(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if !strings.HasPrefix(authHeader, "Bearer ") {
				writeError(w, http.StatusUnauthorized, "Missing or malformed Authorization header.")
				return
			}
			user, err := ValidateToken(secret, strings.TrimPrefix(authHeader, "Bearer "))
			if err != nil {
				writeError(w, http.StatusUnauthorized, "Invalid or expired token.")
				return
			}
			ctx := context.WithValue(r.Context(), userCtxKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func UserFromContext(r *http.Request) (models.AuthedUser, bool) {
	u, ok := r.Context().Value(userCtxKey).(models.AuthedUser)
	return u, ok
}
