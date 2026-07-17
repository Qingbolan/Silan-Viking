package middleware

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"
)

// MachineTokenMiddleware protects private machine-to-machine read APIs.
// An unconfigured token fails closed so a deployment mistake cannot expose
// statistics or deployment provenance.
type MachineTokenMiddleware struct {
	expectedDigest [sha256.Size]byte
	configured     bool
}

func NewMachineTokenMiddleware(token string) *MachineTokenMiddleware {
	token = strings.TrimSpace(token)
	return &MachineTokenMiddleware{
		expectedDigest: sha256.Sum256([]byte(token)),
		configured:     token != "",
	}
}

func (m *MachineTokenMiddleware) Handle(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Vary", "Authorization")

		if !m.configured {
			writeAuthError(w, http.StatusServiceUnavailable, "private API credential is not configured")
			return
		}

		token, ok := bearerToken(r.Header.Get("Authorization"))
		digest := sha256.Sum256([]byte(token))
		if !ok || subtle.ConstantTimeCompare(digest[:], m.expectedDigest[:]) != 1 {
			w.Header().Set("WWW-Authenticate", `Bearer realm="silan-private-api"`)
			writeAuthError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next(w, r)
	}
}

func bearerToken(header string) (string, bool) {
	scheme, token, found := strings.Cut(strings.TrimSpace(header), " ")
	token = strings.TrimSpace(token)
	return token, found && strings.EqualFold(scheme, "Bearer") && token != ""
}

func writeAuthError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
