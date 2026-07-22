package engagement

import (
	"context"
	"crypto/sha256"
	"fmt"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/projectlike"
	"silan-backend/internal/ent/useridentity"
)

// Liker is the public-safe identity projection for a content like.
type Liker struct {
	Kind          string
	CountryCode   string
	VisitorNumber string
	AvatarURL     string
	Label         string
}

// ProjectLikers returns the most recent active project likers. Authenticated
// users expose their profile avatar; anonymous actors are represented by a
// stable visitor number derived from the browser fingerprint.
func ProjectLikers(ctx context.Context, client *ent.Client, projectID string, limit int) ([]Liker, error) {
	if limit <= 0 {
		limit = 24
	}
	rows, err := client.ProjectLike.Query().
		Where(projectlike.ProjectID(projectID)).
		Order(ent.Desc(projectlike.FieldCreatedAt)).
		Limit(limit).
		All(ctx)
	if err != nil {
		return nil, err
	}

	identityIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.UserIdentityID != "" {
			identityIDs = append(identityIDs, row.UserIdentityID)
		}
	}
	identities := make(map[string]*ent.UserIdentity, len(identityIDs))
	if len(identityIDs) > 0 {
		users, queryErr := client.UserIdentity.Query().
			Where(useridentity.IDIn(identityIDs...)).
			All(ctx)
		if queryErr != nil {
			return nil, queryErr
		}
		for _, user := range users {
			identities[user.ID] = user
		}
	}

	likers := make([]Liker, 0, len(rows))
	for _, row := range rows {
		if user := identities[row.UserIdentityID]; user != nil {
			likers = append(likers, Liker{
				Kind:      "user",
				AvatarURL: user.AvatarURL,
				Label:     user.DisplayName,
			})
			continue
		}
		likers = append(likers, Liker{
			Kind:          "visitor",
			VisitorNumber: VisitorNumber(row.Fingerprint),
		})
	}
	return likers, nil
}

// ContentLikers returns the most recent active likers from the unified
// interaction table used by blogs, episodes, moments, and similar content.
func ContentLikers(ctx context.Context, client *ent.Client, entityType contentinteraction.EntityType, entityID string, limit int) ([]Liker, error) {
	if limit <= 0 {
		limit = 24
	}
	rows, err := client.ContentInteraction.Query().
		Where(
			contentinteraction.EntityTypeEQ(entityType),
			contentinteraction.EntityIDEQ(entityID),
			contentinteraction.KindEQ(contentinteraction.KindLike),
		).
		Order(ent.Desc(contentinteraction.FieldCreatedAt)).
		Limit(limit).
		All(ctx)
	if err != nil {
		return nil, err
	}

	identityIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.UserIdentityID != nil && *row.UserIdentityID != "" {
			identityIDs = append(identityIDs, *row.UserIdentityID)
		}
	}
	identities := make(map[string]*ent.UserIdentity, len(identityIDs))
	if len(identityIDs) > 0 {
		users, queryErr := client.UserIdentity.Query().
			Where(useridentity.IDIn(identityIDs...)).
			All(ctx)
		if queryErr != nil {
			return nil, queryErr
		}
		for _, user := range users {
			identities[user.ID] = user
		}
	}

	likers := make([]Liker, 0, len(rows))
	for _, row := range rows {
		if row.UserIdentityID != nil {
			if user := identities[*row.UserIdentityID]; user != nil {
				likers = append(likers, Liker{
					Kind:      "user",
					AvatarURL: user.AvatarURL,
					Label:     user.DisplayName,
				})
				continue
			}
		}
		fingerprint := ""
		if row.Fingerprint != nil {
			fingerprint = *row.Fingerprint
		}
		likers = append(likers, Liker{
			Kind:          "visitor",
			CountryCode:   row.CountryCode,
			VisitorNumber: VisitorNumber(fingerprint),
		})
	}
	return likers, nil
}

// VisitorNumber maps a fingerprint to a small stable anonymous label.
func VisitorNumber(fingerprint string) string {
	sum := sha256.Sum256([]byte(fingerprint))
	number := (int(sum[0])<<8|int(sum[1]))%99 + 1
	return fmt.Sprintf("%02d", number)
}
