package utils

import (
	"net"
	"net/http"
	"strings"
)

// GetClientIP extracts the real client IP address from the HTTP request
func GetClientIP(r *http.Request) string {
	// Check X-Forwarded-For header first (handles proxies/load balancers)
	xForwardedFor := r.Header.Get("X-Forwarded-For")
	if xForwardedFor != "" {
		// X-Forwarded-For can contain multiple IPs, take the first one
		ips := strings.Split(xForwardedFor, ",")
		for _, ip := range ips {
			ip = strings.TrimSpace(ip)
			if ip != "" && !isPrivateIP(ip) {
				return ip
			}
		}
	}

	// Check X-Real-IP header (common with nginx)
	xRealIP := r.Header.Get("X-Real-IP")
	if xRealIP != "" && !isPrivateIP(xRealIP) {
		return xRealIP
	}

	// Check CF-Connecting-IP header (Cloudflare)
	cfConnectingIP := r.Header.Get("CF-Connecting-IP")
	if cfConnectingIP != "" && !isPrivateIP(cfConnectingIP) {
		return cfConnectingIP
	}

	// Fallback to RemoteAddr
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// isPrivateIP checks if an IP address is in a private range
func isPrivateIP(ip string) bool {
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return false
	}

	// Check for private IPv4 ranges
	private4Ranges := []string{
		"10.0.0.0/8",     // RFC1918
		"172.16.0.0/12",  // RFC1918
		"192.168.0.0/16", // RFC1918
		"127.0.0.0/8",    // Loopback
		"169.254.0.0/16", // Link-local
	}

	for _, cidr := range private4Ranges {
		_, network, _ := net.ParseCIDR(cidr)
		if network != nil && network.Contains(parsedIP) {
			return true
		}
	}

	// Check for private IPv6 ranges
	if parsedIP.To4() == nil { // IPv6
		if parsedIP.IsLoopback() || parsedIP.IsLinkLocalUnicast() {
			return true
		}
		// Check for unique local addresses (fc00::/7)
		if len(parsedIP) >= 1 && (parsedIP[0]&0xfe) == 0xfc {
			return true
		}
	}

	return false
}

// GetUserAgent extracts and sanitizes the User-Agent header
func GetUserAgent(r *http.Request) string {
	userAgent := r.Header.Get("User-Agent")
	// Limit length to prevent abuse
	if len(userAgent) > 500 {
		userAgent = userAgent[:500]
	}
	return userAgent
}