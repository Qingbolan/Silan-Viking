package commentruntime

import (
	"context"
	"fmt"
	"hash/fnv"
	"strconv"
	"strings"

	"silan-backend/internal/ent"
)

const (
	unknownCountry = "XX"
	unknownRegion  = "NA"
)

// Author is the server-resolved public identity attached to a comment.
// Session identities remain authoritative. Anonymous identities carry no
// email address and are instead anchored to the browser fingerprint used by
// the comment ownership runtime.
type Author struct {
	Name           string
	Email          string
	AvatarURL      string
	AuthProvider   string
	UserIdentityID string
}

// ResolveAuthor applies the same identity rules to every comment domain.
func ResolveAuthor(
	ctx context.Context,
	client *ent.Client,
	authenticatedUserID string,
	requestedName string,
	fingerprint string,
	countryCode string,
	regionCode string,
) (Author, error) {
	identityID := strings.TrimSpace(authenticatedUserID)
	if identityID != "" {
		identity, err := client.UserIdentity.Get(ctx, identityID)
		if err != nil {
			return Author{}, fmt.Errorf("invalid user identity")
		}
		return Author{
			Name:           identity.DisplayName,
			Email:          identity.Email,
			AvatarURL:      identity.AvatarURL,
			AuthProvider:   identity.Provider,
			UserIdentityID: identity.ID,
		}, nil
	}

	fingerprint = strings.TrimSpace(fingerprint)
	if fingerprint == "" {
		return Author{}, fmt.Errorf("fingerprint is required for guest comments")
	}
	name := strings.TrimSpace(requestedName)
	if name == "" || isGeneratedGuestName(name) {
		name = DefaultGuestName(countryCode, regionCode, fingerprint)
	}
	return Author{Name: name}, nil
}

// DefaultGuestName is intentionally deterministic across requests and mirrors
// the browser implementation: guest-id<country/province/stable-id>.
func DefaultGuestName(countryCode, regionCode, fingerprint string) string {
	return fmt.Sprintf(
		"guest-id<%s/%s/%s>",
		locationToken(countryCode, unknownCountry),
		locationToken(regionCode, unknownRegion),
		stableGuestID(fingerprint),
	)
}

func stableGuestID(fingerprint string) string {
	hasher := fnv.New32a()
	_, _ = hasher.Write([]byte(strings.TrimSpace(fingerprint)))
	value := strings.ToUpper(strconv.FormatUint(uint64(hasher.Sum32()), 36))
	if len(value) < 7 {
		value = strings.Repeat("0", 7-len(value)) + value
	}
	if len(value) > 7 {
		value = value[len(value)-7:]
	}
	return value
}

func locationToken(value, fallback string) string {
	var token strings.Builder
	for _, character := range strings.ToUpper(strings.TrimSpace(value)) {
		if (character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			character == '-' {
			token.WriteRune(character)
			if token.Len() == 16 {
				break
			}
		}
	}
	if token.Len() == 0 {
		return fallback
	}
	return token.String()
}

func isGeneratedGuestName(value string) bool {
	return strings.HasPrefix(value, "guest-id<") &&
		strings.HasSuffix(value, ">") &&
		strings.Count(value, "/") == 2
}
