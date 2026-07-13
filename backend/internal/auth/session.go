package auth

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"silan-backend/internal/ent"
)

const SessionCookieName = "silan_google_session"

// SetSessionCookie stores the already-verified Google ID token in an
// HttpOnly same-site cookie. The token remains Google-signed; the backend
// verifies it again before trusting an identity on later requests.
func SetSessionCookie(w http.ResponseWriter, r *http.Request, idToken string) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    idToken,
		Path:     "/api/v1",
		MaxAge:   int(time.Hour.Seconds()),
		HttpOnly: true,
		Secure:   requestIsHTTPS(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func ClearSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/api/v1",
		MaxAge:   -1,
		Expires:  time.Unix(1, 0),
		HttpOnly: true,
		Secure:   requestIsHTTPS(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func requestIsHTTPS(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

// SessionIdentity resolves the current request's server-authenticated user.
// Client-provided user_identity_id values are never consulted.
func SessionIdentity(
	ctx context.Context,
	r *http.Request,
	db *ent.Client,
	googleClientID string,
) (*ent.UserIdentity, error) {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil {
		return nil, fmt.Errorf("session cookie: %w", err)
	}
	claims, err := VerifyGoogleIDToken(ctx, cookie.Value, googleClientID)
	if err != nil {
		return nil, err
	}
	return UpsertGoogleIdentity(ctx, db, claims)
}

// SessionIdentityID returns an empty ID for anonymous or expired sessions.
// Handlers assign this value over any untrusted request payload field.
func SessionIdentityID(ctx context.Context, r *http.Request, db *ent.Client, googleClientID string) string {
	identity, err := SessionIdentity(ctx, r, db, googleClientID)
	if err != nil {
		return ""
	}
	return identity.ID
}
