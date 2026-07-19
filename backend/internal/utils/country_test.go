package utils

import (
	"net/http/httptest"
	"testing"
)

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
