package engagement

import (
	"context"
	"crypto/sha256"
	"fmt"
	"silan-backend/internal/traffic"
	"sort"
	"strings"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/projectlike"
	"silan-backend/internal/ent/useridentity"
	"silan-backend/internal/publicactor"
)

// Liker is the public-safe identity projection for a content like.
type Liker struct {
	ActorID       string
	Kind          string
	CountryCode   string
	VisitorNumber string
	AvatarURL     string
	Label         string
}

// ProjectLikers returns the most recent active project likers. Authenticated
// users expose their profile avatar; anonymous actors are represented by a
// stable visitor number derived from the browser fingerprint.
type CountryLookup interface {
	Resolve(string) traffic.GeoLocation
}

func ProjectLikers(ctx context.Context, client *ent.Client, projectID string, limit int, countries CountryLookup) ([]Liker, error) {
	if limit == 0 {
		limit = 24
	}
	query := client.ProjectLike.Query().
		Where(projectlike.ProjectID(projectID)).
		Order(ent.Desc(projectlike.FieldCreatedAt))
	if limit > 0 {
		query = query.Limit(limit)
	}
	rows, err := query.All(ctx)
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
				ActorID:   publicactor.ID(publicactor.User, user.ID),
				Kind:      "user",
				AvatarURL: user.AvatarURL,
				Label:     user.DisplayName,
			})
			continue
		}
		country := ""
		if countries != nil {
			country = strings.ToUpper(countries.Resolve(row.IPAddress).CountryCode)
		}
		likers = append(likers, Liker{
			ActorID:       publicactor.ID(publicactor.Visitor, row.Fingerprint),
			CountryCode:   country,
			Kind:          "visitor",
			VisitorNumber: VisitorNumber(row.Fingerprint),
		})
	}
	return likers, nil
}

// ContentLikers returns the most recent active likers from the unified
// interaction table used by blogs, episodes, moments, and similar content.
func ContentLikers(ctx context.Context, client *ent.Client, entityType contentinteraction.EntityType, entityID string, limit int) ([]Liker, error) {
	if limit == 0 {
		limit = 24
	}
	query := client.ContentInteraction.Query().
		Where(
			contentinteraction.EntityTypeEQ(entityType),
			contentinteraction.EntityIDEQ(entityID),
			contentinteraction.KindEQ(contentinteraction.KindLike),
		).
		Order(ent.Desc(contentinteraction.FieldCreatedAt))
	if limit > 0 {
		query = query.Limit(limit)
	}
	rows, err := query.All(ctx)
	if err != nil {
		return nil, err
	}

	return ContentLikersFromRows(ctx, client, rows)
}

// ContentLikersFromRows shares identity projection with full-site snapshots,
// without re-reading interactions for each item. It accepts all interaction
// kinds and preserves the newest-first ordering of the public endpoint.
func ContentLikersFromRows(ctx context.Context, client *ent.Client, interactions []*ent.ContentInteraction) ([]Liker, error) {
	rows := make([]*ent.ContentInteraction, 0)
	for _, row := range interactions {
		if row.Kind == contentinteraction.KindLike {
			rows = append(rows, row)
		}
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].CreatedAt.After(rows[j].CreatedAt) })

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
					ActorID:   publicactor.ID(publicactor.User, user.ID),
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
			ActorID:       publicactor.ID(publicactor.Visitor, fingerprint),
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
