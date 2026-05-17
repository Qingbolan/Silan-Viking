package auth

import (
	"context"
	"testing"

	"silan-backend/internal/types"
)

// VerifyEmail is a pure validation — no DB — so it runs with a nil svcCtx.
func TestVerifyEmail(t *testing.T) {
	l := NewVerifyEmailLogic(context.Background(), nil)

	accepted := []string{
		"jane@acme-corp.com",
		"recruiter@company.io",
		"Jane Doe <jane@acme-corp.com>",
	}
	for _, e := range accepted {
		resp, err := l.VerifyEmail(&types.VerifyEmailRequest{Email: e})
		if err != nil {
			t.Errorf("VerifyEmail(%q) rejected a company email: %v", e, err)
			continue
		}
		if !resp.Valid {
			t.Errorf("VerifyEmail(%q) returned Valid=false", e)
		}
	}

	rejected := []string{
		"",                  // empty
		"not-an-email",      // malformed
		"someone@gmail.com", // free-mail provider
		"someone@QQ.com",    // free-mail, case-insensitive
	}
	for _, e := range rejected {
		if _, err := l.VerifyEmail(&types.VerifyEmailRequest{Email: e}); err == nil {
			t.Errorf("VerifyEmail(%q) accepted an address it should reject", e)
		}
	}
}
