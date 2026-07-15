package middleware

import (
	"context"
	"net"
	"net/http"
	"strings"
	"time"

	"silan-backend/internal/ent"
	"silan-backend/internal/traffic"
)

type AnalyticsMiddleware struct {
	client     *ent.Client
	classifier *traffic.Classifier
}

func NewAnalyticsMiddleware(client *ent.Client, classifier *traffic.Classifier) *AnalyticsMiddleware {
	return &AnalyticsMiddleware{client: client, classifier: classifier}
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

		if m.client == nil || r.Method == http.MethodOptions {
			return
		}

		duration := time.Since(start).Milliseconds()
		// Flag known search-engine / social crawlers so bot traffic is
		// queryable straight from request_logs.
		isBot := false
		botName := ""
		if m.classifier != nil {
			isBot, botName = m.classifier.DetectBot(r.UserAgent())
		}

		// Persist the access-log row via the ent client. Best-effort —
		// a logging failure must never affect the response. A fresh,
		// short context decouples it from the (already-finished) request.
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_, _ = m.client.RequestLog.Create().
			SetMethod(r.Method).
			SetPath(r.URL.Path).
			SetStatus(wrapped.status).
			SetDurationMs(int(duration)).
			SetReferrer(r.Referer()).
			SetUserAgent(r.UserAgent()).
			SetIP(clientIP(r)).
			SetLang(r.URL.Query().Get("lang")).
			SetIsBot(isBot).
			SetBotName(botName).
			Save(ctx)
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
