package commentruntime

import (
	"strings"

	"silan-backend/internal/ent"
)

// Actor is the server-resolved identity of a discussion participant. A
// verified session identity is authoritative; the browser fingerprint keeps
// anonymous comments manageable from the browser that created them.
type Actor struct {
	UserIdentityID string
	Fingerprint    string
}

func NewActor(userIdentityID, fingerprint string) Actor {
	return Actor{
		UserIdentityID: strings.TrimSpace(userIdentityID),
		Fingerprint:    strings.TrimSpace(fingerprint),
	}
}

// CanDelete reports whether this actor owns the comment. Fingerprints are
// parsed as a complete stored token instead of matched as a substring, so
// "browser-1" can never authorize a comment owned by "browser-10".
func (a Actor) CanDelete(comment *ent.Comment) bool {
	if comment == nil {
		return false
	}
	if a.UserIdentityID != "" && comment.UserIdentityID == a.UserIdentityID {
		return true
	}
	return a.Fingerprint != "" && storedFingerprint(comment.UserAgent) == a.Fingerprint
}

func Fingerprint(comment *ent.Comment) string {
	if comment == nil {
		return ""
	}
	return storedFingerprint(comment.UserAgent)
}

func storedFingerprint(userAgent string) string {
	const prefix = "fp:"
	if !strings.HasPrefix(userAgent, prefix) {
		return ""
	}
	value := strings.TrimPrefix(userAgent, prefix)
	if separator := strings.Index(value, " | "); separator >= 0 {
		value = value[:separator]
	}
	return strings.TrimSpace(value)
}
