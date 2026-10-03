package feedbackmedia

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Trust forwarded addresses only from loopback reverse proxies, walking right to left.
func clientIP(r *http.Request) string {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	ip := net.ParseIP(host)
	if ip == nil {
		return ""
	}
	if ip.IsLoopback() {
		parts := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
		for i := len(parts) - 1; i >= 0; i-- {
			candidate := net.ParseIP(strings.TrimSpace(parts[i]))
			if candidate == nil {
				return ""
			}
			ip = candidate
			if !ip.IsLoopback() {
				break
			}
		}
	}
	// IPv6 privacy addresses share a /64 quota to prevent trivial address rotation.
	if ip.To4() == nil {
		ip = ip.Mask(net.CIDRMask(64, 128))
	}
	return ip.String()
}
func (s *Service) UploadHandler() http.HandlerFunc {
	workers := make(chan struct{}, 2)
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, message string) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
		}
		select {
		case workers <- struct{}{}:
			defer func() { <-workers }()
		default:
			fail(503, "upload service busy; try again later")
			return
		}
		ip := clientIP(r)
		if ip == "" {
			fail(400, "invalid client address")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, VideoLimit+(64<<10))
		reader, err := r.MultipartReader()
		if err != nil {
			fail(400, "multipart file required")
			return
		}
		part, err := reader.NextPart()
		if err != nil || part.FormName() != "file" || part.FileName() == "" {
			fail(400, "file must be the first multipart field")
			return
		}
		defer part.Close()
		result, err := s.Upload(r.Context(), ip, r.URL.Query().Get("kind"), part)
		if err != nil {
			status := 400
			switch {
			case errors.Is(err, ErrQuota):
				status = 429
			case errors.Is(err, ErrScanner):
				status = 503
			case errors.Is(err, ErrInvalid), errors.Is(err, ErrUnsafe):
			default:
				fail(500, "upload could not be completed")
				return
			}
			fail(status, err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(201)
		_ = json.NewEncoder(w).Encode(result)
	}
}

var publicName = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|mp4)$`)

func (s *Service) GetHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/api/v1/feedback-media/")
		if !publicName.MatchString(name) {
			http.NotFound(w, r)
			return
		}
		f, err := os.Open(filepath.Join(s.Root, "published", name))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer f.Close()
		info, err := f.Stat()
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		http.ServeContent(w, r, name, info.ModTime(), f)
	}
}
