package utils

import (
	"net/http/httptest"
	"testing"
)

func TestGetClientIPUsesForwardedPublicAddressBeforeProxyLoopback(t *testing.T) {
	request := httptest.NewRequest("GET", "/", nil)
	request.RemoteAddr = "127.0.0.1:5200"
	request.Header.Set("X-Forwarded-For", "203.0.113.9, 127.0.0.1")
	request.Header.Set("X-Real-IP", "127.0.0.1")

	if got := GetClientIP(request); got != "203.0.113.9" {
		t.Fatalf("GetClientIP() = %q, want 203.0.113.9", got)
	}
}

func TestGetClientIPFallsBackToRemoteAddrWhenOnlyLoopbackIsAvailable(t *testing.T) {
	request := httptest.NewRequest("GET", "/", nil)
	request.RemoteAddr = "127.0.0.1:5200"
	request.Header.Set("X-Forwarded-For", "127.0.0.1")

	if got := GetClientIP(request); got != "127.0.0.1" {
		t.Fatalf("GetClientIP() = %q, want 127.0.0.1", got)
	}
}

func TestGetCountryCodeUsesValidatedEdgeCountry(t *testing.T) {
	request := httptest.NewRequest("GET", "/", nil)
	request.Header.Set("CF-IPCountry", "sg")
	if got := GetCountryCode(request, nil); got != "SG" {
		t.Fatalf("GetCountryCode() = %q, want SG", got)
	}
}

func TestGetCountryCodeRejectsNonCountryEdgeValues(t *testing.T) {
	for _, value := range []string{"XX", "T1", "Singapore", "1A"} {
		request := httptest.NewRequest("GET", "/", nil)
		request.Header.Set("CF-IPCountry", value)
		if got := GetCountryCode(request, nil); got != "" {
			t.Fatalf("GetCountryCode(%q) = %q, want empty", value, got)
		}
	}
}

func TestGetGeoLocationUsesValidatedEdgeRegion(t *testing.T) {
	request := httptest.NewRequest("GET", "/", nil)
	request.Header.Set("X-Vercel-IP-Country", "cn")
	request.Header.Set("X-Vercel-IP-Country-Region", "bj")

	location := GetGeoLocation(request, nil)
	if location.CountryCode != "CN" || location.RegionCode != "BJ" {
		t.Fatalf("GetGeoLocation() = %#v, want CN/BJ", location)
	}
}
