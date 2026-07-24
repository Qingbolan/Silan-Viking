package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"silan-backend/internal/ent"
	"silan-backend/internal/traffic"
	"silan-backend/internal/utils"
)

type AnalyticsMiddleware struct {
	client     *ent.Client
	classifier *traffic.Classifier
	countries  *traffic.CountryResolver
}

var countryHeaders = [...]string{
	"CF-IPCountry",
	"X-Vercel-IP-Country",
	"CloudFront-Viewer-Country",
}

func NewAnalyticsMiddleware(client *ent.Client, classifier *traffic.Classifier, countries ...*traffic.CountryResolver) *AnalyticsMiddleware {
	var resolver *traffic.CountryResolver
	if len(countries) > 0 {
		resolver = countries[0]
	}
	return &AnalyticsMiddleware{client: client, classifier: classifier, countries: resolver}
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
		builder := m.client.RequestLog.Create().
			SetMethod(r.Method).
			SetPath(r.URL.Path).
			SetStatus(wrapped.status).
			SetDurationMs(int(duration)).
			SetReferrer(r.Referer()).
			SetUserAgent(r.UserAgent()).
			SetIP(utils.GetClientIP(r)).
			SetLang(r.URL.Query().Get("lang")).
			SetIsBot(isBot).
			SetBotName(botName)
		location := m.countries.Resolve(utils.GetClientIP(r))
		if country := edgeCountryCode(r); country != "" {
			location.CountryCode = country
		}
		if location.CountryCode != "" {
			builder.SetCountryCode(location.CountryCode)
		}
		if location.RegionCode != "" {
			builder.SetRegionCode(location.RegionCode)
		}
		if location.RegionName != "" {
			builder.SetRegionName(location.RegionName)
		}
		if location.City != "" {
			builder.SetCity(location.City)
		}
		if location.PostalCode != "" {
			builder.SetPostalCode(location.PostalCode)
		}
		if location.PlaceName != "" {
			builder.SetPlaceName(location.PlaceName)
			builder.SetPlaceDistanceKm(location.PlaceDistance)
		}
		if location.PlaceFeature != "" {
			builder.SetPlaceFeatureCode(location.PlaceFeature)
		}
		if location.Latitude != 0 || location.Longitude != 0 {
			builder.SetLatitude(location.Latitude).SetLongitude(location.Longitude)
		}
		if location.TimeZone != "" {
			builder.SetTimeZone(location.TimeZone)
		}
		if location.AccuracyRadius > 0 {
			builder.SetAccuracyRadius(location.AccuracyRadius)
		}
		_, _ = builder.Save(ctx)
	}
}

// edgeCountryCode accepts only canonical ISO-shaped values from supported
// edge providers. Special Cloudflare values such as XX and T1 are excluded.
func edgeCountryCode(r *http.Request) string {
	for _, header := range countryHeaders {
		code := strings.ToUpper(strings.TrimSpace(r.Header.Get(header)))
		if len(code) == 2 &&
			code[0] >= 'A' && code[0] <= 'Z' &&
			code[1] >= 'A' && code[1] <= 'Z' &&
			code != "XX" {
			return code
		}
	}
	return ""
}
