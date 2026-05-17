// Package auth provides verified Google ID token handling shared across
// handlers. Tokens are verified against Google's published RSA public keys
// (JWKS) — never trusted unverified.
package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v4"
)

// googleCertsURL is Google's JWKS endpoint (RSA public keys, in JWK form).
const googleCertsURL = "https://www.googleapis.com/oauth2/v3/certs"

// googleIssuers are the accepted `iss` claim values for Google-signed tokens.
var googleIssuers = map[string]bool{
	"accounts.google.com":         true,
	"https://accounts.google.com": true,
}

// GoogleClaims is the subset of Google ID token claims we rely on.
type GoogleClaims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	GivenName     string `json:"given_name"`
	FamilyName    string `json:"family_name"`
	Sub           string `json:"sub"` // stable Google user ID
	jwt.RegisteredClaims
}

// jwk is one key in a JWKS document.
type jwk struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// keyCache holds Google's public keys with a TTL so we are not refetching
// JWKS on every verification while still picking up Google's key rotation.
type keyCache struct {
	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	expiresAt time.Time
}

var cache = &keyCache{keys: map[string]*rsa.PublicKey{}}

// publicKey returns the RSA public key for the given key ID, refreshing the
// JWKS cache from Google when the entry is missing or stale.
func (c *keyCache) publicKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	c.mu.RLock()
	if time.Now().Before(c.expiresAt) {
		if k, ok := c.keys[kid]; ok {
			c.mu.RUnlock()
			return k, nil
		}
	}
	c.mu.RUnlock()

	if err := c.refresh(ctx); err != nil {
		return nil, err
	}

	c.mu.RLock()
	defer c.mu.RUnlock()
	k, ok := c.keys[kid]
	if !ok {
		return nil, fmt.Errorf("no Google public key for kid %q", kid)
	}
	return k, nil
}

// refresh fetches and parses the JWKS document from Google.
func (c *keyCache) refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleCertsURL, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetch Google JWKS: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("fetch Google JWKS: status %d", resp.StatusCode)
	}

	var doc struct {
		Keys []jwk `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&doc); err != nil {
		return fmt.Errorf("decode Google JWKS: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey, len(doc.Keys))
	for _, k := range doc.Keys {
		if k.Kty != "RSA" {
			continue
		}
		pub, err := k.toRSAPublicKey()
		if err != nil {
			return fmt.Errorf("parse JWK %q: %w", k.Kid, err)
		}
		keys[k.Kid] = pub
	}
	if len(keys) == 0 {
		return fmt.Errorf("Google JWKS contained no usable RSA keys")
	}

	c.mu.Lock()
	c.keys = keys
	// Google rotates keys roughly daily; a 1h TTL keeps us fresh cheaply.
	c.expiresAt = time.Now().Add(time.Hour)
	c.mu.Unlock()
	return nil
}

// toRSAPublicKey converts a base64url-encoded JWK modulus/exponent pair into
// an rsa.PublicKey.
func (k jwk) toRSAPublicKey() (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
	if err != nil {
		return nil, fmt.Errorf("modulus: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
	if err != nil {
		return nil, fmt.Errorf("exponent: %w", err)
	}
	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: int(new(big.Int).SetBytes(eBytes).Int64()),
	}, nil
}

// VerifyGoogleIDToken verifies a Google-issued ID token: it checks the RS256
// signature against Google's current public keys and validates the issuer,
// expiry, and — when clientID is non-empty — the audience.
//
// It returns the parsed claims only when the token is fully trustworthy.
func VerifyGoogleIDToken(ctx context.Context, idToken, clientID string) (*GoogleClaims, error) {
	if idToken == "" {
		return nil, fmt.Errorf("id_token is required")
	}

	claims := &GoogleClaims{}
	parser := jwt.NewParser(jwt.WithValidMethods([]string{"RS256"}))

	token, err := parser.ParseWithClaims(idToken, claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, fmt.Errorf("token missing kid header")
		}
		return cache.publicKey(ctx, kid)
	})
	if err != nil {
		return nil, fmt.Errorf("token verification failed: %w", err)
	}
	if !token.Valid {
		return nil, fmt.Errorf("token is invalid")
	}

	// Issuer must be Google.
	if !googleIssuers[claims.Issuer] {
		return nil, fmt.Errorf("untrusted token issuer %q", claims.Issuer)
	}

	// Audience must match our OAuth client when one is configured.
	if clientID != "" && !claims.VerifyAudience(clientID, true) {
		return nil, fmt.Errorf("token audience does not match this application")
	}

	if !claims.EmailVerified {
		return nil, fmt.Errorf("Google account email is not verified")
	}
	if claims.Email == "" {
		return nil, fmt.Errorf("token did not include an email")
	}

	return claims, nil
}
