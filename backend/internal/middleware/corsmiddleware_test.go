package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/zeromicro/go-zero/rest/router"
)

func TestCorsBeforeRouteMatching(t *testing.T) {
	r := NewCorsRouter(router.NewRouter())
	called := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})
	if err := r.Handle(http.MethodPost, "/api/v1/blog/posts/:id/views", handler); err != nil {
		t.Fatal(err)
	}
	if err := r.Handle(http.MethodGet, "/api/v1/geo", handler); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, method, path, origin string
		status                     int
		allowed, dispatched        bool
	}{
		{"mirror preflight", "OPTIONS", "/api/v1/blog/posts/example/views", "https://qingbolan.github.io", 204, true, false},
		{"mirror geo", "GET", "/api/v1/geo", "https://qingbolan.github.io", 200, true, true},
		{"missing route", "GET", "/missing", "https://qingbolan.github.io", 404, true, false},
		{"wrong method", "DELETE", "/api/v1/geo", "https://qingbolan.github.io", 405, true, false},
		{"untrusted origin", "OPTIONS", "/api/v1/geo", "https://untrusted.example", 204, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			called = false
			req := httptest.NewRequest(tc.method, tc.path, nil)
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("Access-Control-Request-Method", "POST")
			req.Header.Set("Access-Control-Request-Headers", "Content-Type")
			response := httptest.NewRecorder()
			r.ServeHTTP(response, req)
			if response.Code != tc.status {
				t.Fatalf("status = %d, want %d", response.Code, tc.status)
			}
			want := ""
			if tc.allowed {
				want = tc.origin
			}
			if got := response.Header().Get("Access-Control-Allow-Origin"); got != want {
				t.Fatalf("origin = %q, want %q", got, want)
			}
			if called != tc.dispatched {
				t.Fatalf("handler called = %v, want %v", called, tc.dispatched)
			}
			if tc.allowed && response.Header().Get("Access-Control-Allow-Credentials") != "true" {
				t.Fatal("missing credential support")
			}
		})
	}
}
