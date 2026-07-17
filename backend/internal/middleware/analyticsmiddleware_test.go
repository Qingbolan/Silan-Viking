package middleware

import (
	"net/http/httptest"
	"testing"
)

func TestEdgeCountryCode(t *testing.T) {
	tests := []struct {
		name    string
		headers map[string]string
		want    string
	}{
		{name: "cloudflare", headers: map[string]string{"CF-IPCountry": "sg"}, want: "SG"},
		{name: "vercel fallback", headers: map[string]string{"X-Vercel-IP-Country": "US"}, want: "US"},
		{name: "cloudfront fallback", headers: map[string]string{"CloudFront-Viewer-Country": "DE"}, want: "DE"},
		{name: "cloudflare unknown", headers: map[string]string{"CF-IPCountry": "XX"}, want: ""},
		{name: "cloudflare tor code", headers: map[string]string{"CF-IPCountry": "T1"}, want: ""},
		{name: "invalid value", headers: map[string]string{"CF-IPCountry": "Singapore"}, want: ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest("GET", "/", nil)
			for key, value := range test.headers {
				request.Header.Set(key, value)
			}
			if got := edgeCountryCode(request); got != test.want {
				t.Fatalf("edgeCountryCode() = %q, want %q", got, test.want)
			}
		})
	}
}
