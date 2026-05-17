package middleware

import (
	"database/sql"
	"net"
	"net/http"
	"strings"
	"time"
)

type AnalyticsMiddleware struct {
	db     *sql.DB
	driver string
}

func NewAnalyticsMiddleware(db *sql.DB, driver string) *AnalyticsMiddleware {
	return &AnalyticsMiddleware{db: db, driver: driver}
}

type analyticsResponseWriter struct {
	http.ResponseWriter
	status int
}

func (w *analyticsResponseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *analyticsResponseWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

func (m *AnalyticsMiddleware) Handle(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapped := &analyticsResponseWriter{ResponseWriter: w, status: http.StatusOK}

		next(wrapped, r)

		if m.db == nil || r.Method == http.MethodOptions {
			return
		}

		duration := time.Since(start).Milliseconds()
		query := `INSERT INTO request_logs (method, path, status, duration_ms, referrer, user_agent, ip, lang, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		if m.driver == "postgres" || m.driver == "postgresql" {
			query = `INSERT INTO request_logs (method, path, status, duration_ms, referrer, user_agent, ip, lang, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
		}

		_, _ = m.db.Exec(
			query,
			r.Method,
			r.URL.Path,
			wrapped.status,
			duration,
			r.Referer(),
			r.UserAgent(),
			clientIP(r),
			r.URL.Query().Get("lang"),
			time.Now(),
		)
	}
}

func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		return strings.TrimSpace(parts[0])
	}
	if realIP := r.Header.Get("X-Real-IP"); realIP != "" {
		return strings.TrimSpace(realIP)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}
