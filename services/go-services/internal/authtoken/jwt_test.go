package authtoken

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-secret-do-not-use-in-prod"

func signToken(t *testing.T, secret string, claims Claims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign test token: %v", err)
	}
	return signed
}

func TestVerify_ValidToken(t *testing.T) {
	v := NewVerifier(testSecret)
	claims := Claims{
		Subject: "user-123",
		Role:    "buyer",
		IsAdmin: false,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
		},
	}
	tok := signToken(t, testSecret, claims)

	got, err := v.Verify(tok)
	if err != nil {
		t.Fatalf("expected valid token to verify, got error: %v", err)
	}
	if got.Subject != "user-123" || got.Role != "buyer" {
		t.Fatalf("unexpected claims: %+v", got)
	}
}

func TestVerify_ExpiredToken(t *testing.T) {
	v := NewVerifier(testSecret)
	claims := Claims{
		Subject: "user-123",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Minute)),
		},
	}
	tok := signToken(t, testSecret, claims)

	if _, err := v.Verify(tok); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken for expired token, got: %v", err)
	}
}

func TestVerify_WrongSecret(t *testing.T) {
	v := NewVerifier(testSecret)
	claims := Claims{
		Subject: "user-123",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
		},
	}
	tok := signToken(t, "a-completely-different-secret", claims)

	if _, err := v.Verify(tok); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken for wrong secret, got: %v", err)
	}
}

func TestVerify_EmptyToken(t *testing.T) {
	v := NewVerifier(testSecret)
	if _, err := v.Verify(""); err != ErrMissingToken {
		t.Fatalf("expected ErrMissingToken, got: %v", err)
	}
}

func TestVerify_RejectsAlgNone(t *testing.T) {
	v := NewVerifier(testSecret)
	// Deliberately craft a token with "none" algorithm — the classic
	// alg-confusion attack. Must be rejected even though it "parses".
	token := jwt.NewWithClaims(jwt.SigningMethodNone, Claims{Subject: "attacker"})
	tok, err := token.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("failed to build none-alg token: %v", err)
	}
	if _, err := v.Verify(tok); err == nil {
		t.Fatal("expected none-alg token to be rejected")
	}
}
