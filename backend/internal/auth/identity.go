package auth

import (
	"context"
	"strings"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/useridentity"

	"github.com/google/uuid"
)

// NewUserID returns a fresh user identity ID (prefixed UUID, no dashes).
func NewUserID() string {
	return "u_" + strings.ReplaceAll(uuid.NewString(), "-", "")
}

// displayNameFor derives a display name from the claims, falling back to the
// email local-part when Google did not provide a name.
func displayNameFor(claims *GoogleClaims) string {
	if claims.Name != "" {
		return claims.Name
	}
	if i := strings.IndexByte(claims.Email, '@'); i > 0 {
		return claims.Email[:i]
	}
	return ""
}

// UpsertGoogleIdentity finds or creates the UserIdentity for a verified set of
// Google claims, keeping email/name/avatar in sync with Google on every login.
//
// The claims MUST come from VerifyGoogleIDToken — never from an unverified
// token — since the identity is keyed on the (provider, sub) pair.
func UpsertGoogleIdentity(ctx context.Context, db *ent.Client, claims *GoogleClaims) (*ent.UserIdentity, error) {
	existing, err := db.UserIdentity.Query().
		Where(
			useridentity.ProviderEQ("google"),
			useridentity.ExternalIDEQ(claims.Sub),
		).
		First(ctx)

	if err == nil {
		upd := existing.Update().SetVerified(claims.EmailVerified)
		if claims.Email != "" && existing.Email != claims.Email {
			upd.SetEmail(claims.Email)
		}
		if name := displayNameFor(claims); name != "" && existing.DisplayName != name {
			upd.SetDisplayName(name)
		}
		if claims.Picture != "" && existing.AvatarURL != claims.Picture {
			upd.SetAvatarURL(claims.Picture)
		}
		updated, uErr := upd.Save(ctx)
		if uErr != nil {
			return existing, nil // fall back to the stored identity
		}
		return updated, nil
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}

	create := db.UserIdentity.Create().
		SetID(NewUserID()).
		SetProvider("google").
		SetExternalID(claims.Sub).
		SetVerified(claims.EmailVerified)
	if claims.Email != "" {
		create.SetEmail(claims.Email)
	}
	if name := displayNameFor(claims); name != "" {
		create.SetDisplayName(name)
	}
	if claims.Picture != "" {
		create.SetAvatarURL(claims.Picture)
	}
	return create.Save(ctx)
}
