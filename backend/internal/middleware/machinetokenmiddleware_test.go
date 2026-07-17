package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMachineTokenMiddlewareAuthorizesOnlyExactBearerToken(t *testing.T) {
	calls := 0
	protected := NewMachineTokenMiddleware("correct-token").Handle(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusNoContent)
	})

	tests := []struct {
		name          string
		authorization string
		wantStatus    int
		wantCalls     int
	}{
		{name: "missing", wantStatus: http.StatusUnauthorized},
		{name: "wrong scheme", authorization: "Basic correct-token", wantStatus: http.StatusUnauthorized},
		{name: "wrong token", authorization: "Bearer incorrect-token", wantStatus: http.StatusUnauthorized},
		{name: "correct", authorization: "Bearer correct-token", wantStatus: http.StatusNoContent, wantCalls: 1},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			calls = 0
			request := httptest.NewRequest(http.MethodGet, "/private", nil)
			request.Header.Set("Authorization", test.authorization)
			response := httptest.NewRecorder()
			protected(response, request)

			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d", response.Code, test.wantStatus)
			}
			if calls != test.wantCalls {
				t.Fatalf("handler calls = %d, want %d", calls, test.wantCalls)
			}
			if got := response.Header().Get("Cache-Control"); got != "no-store" {
				t.Fatalf("Cache-Control = %q", got)
			}
			if got := response.Header().Get("Vary"); got != "Authorization" {
				t.Fatalf("Vary = %q", got)
			}
			if test.wantStatus == http.StatusUnauthorized &&
				response.Header().Get("WWW-Authenticate") == "" {
				t.Fatal("unauthorized response has no Bearer challenge")
			}
		})
	}
}

func TestMachineTokenMiddlewareFailsClosedWhenUnconfigured(t *testing.T) {
	called := false
	protected := NewMachineTokenMiddleware("").Handle(func(http.ResponseWriter, *http.Request) {
		called = true
	})
	response := httptest.NewRecorder()
	protected(response, httptest.NewRequest(http.MethodGet, "/private", nil))

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
	if called {
		t.Fatal("unconfigured middleware called the protected handler")
	}
}
