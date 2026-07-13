package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSessionCookieIsHttpOnlySameSiteAndSecureBehindProxy(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "http://backend/api/v1/auth/google/verify", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	recorder := httptest.NewRecorder()

	SetSessionCookie(recorder, req, "signed-google-token")
	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookies = %d, want 1", len(cookies))
	}
	cookie := cookies[0]
	if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode {
		t.Fatalf("cookie security flags = HttpOnly:%v Secure:%v SameSite:%v", cookie.HttpOnly, cookie.Secure, cookie.SameSite)
	}
	if cookie.Path != "/api/v1" || cookie.Value != "signed-google-token" {
		t.Fatalf("cookie scope/value = %q %q", cookie.Path, cookie.Value)
	}
}

func TestAnonymousRequestCannotSupplyAnIdentity(t *testing.T) {
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/blog/comments/c1", nil)
	if got := SessionIdentityID(context.Background(), req, nil, "client-id"); got != "" {
		t.Fatalf("anonymous identity = %q, want empty", got)
	}
}
