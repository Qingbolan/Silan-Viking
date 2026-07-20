package middleware

import "net/http"

type CorsMiddleware struct {
}

func NewCorsMiddleware() *CorsMiddleware {
	return &CorsMiddleware{}
}

func (m *CorsMiddleware) Handle(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers
		// Allow specific origins for better security
		origin := r.Header.Get("Origin")
		allowedOrigins := []string{
			"http://localhost:3000", // Frontend development server
			"http://localhost:3001", // Alternative frontend port
			"http://localhost:5173", // Alternative Vite dev server port
			"http://127.0.0.1:3000",
			"http://127.0.0.1:3001",
			"http://127.0.0.1:5173",
			// Production domains
			"https://silan.tech",
			"https://www.silan.tech",
			// GitHub Pages mirror
			"https://qingbolan.github.io",
			// NUS domain where the site may be embedded or proxied
			"https://www.comp.nus.edu.sg",
			"https://comp.nus.edu.sg",
		}

		// Check if the origin is allowed
		isAllowed := false
		for _, allowedOrigin := range allowedOrigins {
			if origin == allowedOrigin {
				isAllowed = true
				break
			}
		}

		// Ensure caches know the response may vary by Origin
		w.Header().Add("Vary", "Origin")

		if isAllowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else if origin == "" {
			// Allow requests without origin (like direct API calls)
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Type")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Max-Age", "86400") // 24 hours

		// Handle preflight OPTIONS request
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Continue to the next handler
		next(w, r)
	}
}
