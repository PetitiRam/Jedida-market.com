// Package authtoken validates the exact same access tokens issued by
// backend/src/utils/jwt.js (signAccessToken). There is no second auth
// system here: Go only ever verifies, using the same shared secret and
// algorithm, and never trusts any identity fields a client sends outside
// of this token.
package authtoken

import (
	"errors"
	"fmt"

	"github.com/golang-jwt/jwt/v5"
)

// Claims mirrors the payload shape from backend/src/utils/jwt.js:
// { sub, role, isAdmin, adminRole, mfaEnabled }.
type Claims struct {
	Subject    string `json:"sub"`
	Role       string `json:"role"`
	IsAdmin    bool   `json:"isAdmin"`
	AdminRole  string `json:"adminRole"`
	MFAEnabled bool   `json:"mfaEnabled"`
	jwt.RegisteredClaims
}

var (
	ErrMissingToken = errors.New("authentication token is required")
	ErrInvalidToken = errors.New("session expired or token invalid")
)

type Verifier struct {
	secret []byte
}

func NewVerifier(secret string) *Verifier {
	return &Verifier{secret: []byte(secret)}
}

// Verify parses and validates a raw JWT string, enforcing HS256 exactly as
// backend/src/utils/jwt.js does (algorithms: [ALGORITHM] there too — this
// prevents an alg-confusion attack where a client swaps in an unsigned or
// differently-signed token).
func (v *Verifier) Verify(tokenString string) (*Claims, error) {
	if tokenString == "" {
		return nil, ErrMissingToken
	}

	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return v.secret, nil
	}, jwt.WithValidMethods([]string{"HS256"}))

	if err != nil || !token.Valid {
		return nil, ErrInvalidToken
	}
	if claims.Subject == "" {
		return nil, ErrInvalidToken
	}
	return claims, nil
}
