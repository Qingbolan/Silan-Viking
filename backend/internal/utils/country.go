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

var regionHeaders = [...]string{
	"X-Vercel-IP-Country-Region",
	"CloudFront-Viewer-Country-Region",
}

// GetGeoLocation returns the coarse country and province/region available for
// the request. Edge country/region headers override local MaxMind data when
// present; the local resolver fills in fields an edge did not provide.
func GetGeoLocation(r *http.Request, resolver *traffic.CountryResolver) traffic.GeoLocation {
	location := resolver.Resolve(GetClientIP(r))
	for _, header := range countryHeaders {
		if code := normalizedCountryCode(r.Header.Get(header)); code != "" {
			location.CountryCode = code
			break
		}
	}
	for _, header := range regionHeaders {
		if code := normalizedRegionCode(r.Header.Get(header)); code != "" {
			location.RegionCode = code
			break
		}
	}
	location.CountryCode = normalizedCountryCode(location.CountryCode)
	location.RegionCode = normalizedRegionCode(location.RegionCode)
	return location
}

// GetCountryCode returns only a coarse ISO country code. Edge-provided
// geolocation takes precedence because it remains available when the local
// MaxMind database is not installed.
func GetCountryCode(r *http.Request, resolver *traffic.CountryResolver) string {
	return GetGeoLocation(r, resolver).CountryCode
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

func normalizedRegionCode(value string) string {
	code := strings.ToUpper(strings.TrimSpace(value))
	if code == "" || len(code) > 16 {
		return ""
	}
	for _, character := range code {
		if (character < 'A' || character > 'Z') &&
			(character < '0' || character > '9') &&
			character != '-' {
			return ""
		}
	}
	return code
}
