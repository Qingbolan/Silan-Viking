package utils

import (
	"net/http"
	"strings"

	"silan-backend/internal/traffic"
)

var countryHeaders = [...]string{
	"CF-IPCountry",
	"X-Vercel-IP-Country",
	"CloudFront-Viewer-Country",
}

// GetCountryCode returns only a coarse ISO country code. Edge-provided
// geolocation takes precedence because it remains available when the local
// MaxMind database is not installed.
func GetCountryCode(r *http.Request, resolver *traffic.CountryResolver) string {
	for _, header := range countryHeaders {
		if code := normalizedCountryCode(r.Header.Get(header)); code != "" {
			return code
		}
	}
	return normalizedCountryCode(resolver.Resolve(GetClientIP(r)).CountryCode)
}

func normalizedCountryCode(value string) string {
	code := strings.ToUpper(strings.TrimSpace(value))
	if len(code) != 2 || code == "XX" || code == "T1" {
		return ""
	}
	for _, character := range code {
		if character < 'A' || character > 'Z' {
			return ""
		}
	}
	return code
}
