// Package engagement owns user-generated counters. Content rows are rebuilt
// by the publishing engine, so likes and views must always be read from the
// runtime tables that survive sync and deploy.
package engagement

import (
	"context"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/projectlike"
	"silan-backend/internal/ent/projectview"
)

// Counts is the public engagement projection for one content item.
type Counts struct {
	Likes int
	Views int
}

type projectCountRow struct {
	ProjectID string `json:"project_id"`
	Count     int    `json:"count"`
}

type contentCountRow struct {
	EntityID string                  `json:"entity_id"`
	Kind     contentinteraction.Kind `json:"kind"`
	Count    int                     `json:"count"`
}

// ProjectCounts batches the project-specific runtime tables into one map.
func ProjectCounts(ctx context.Context, client *ent.Client, projectIDs []string) (map[string]Counts, error) {
	counts := make(map[string]Counts, len(projectIDs))
	if len(projectIDs) == 0 {
		return counts, nil
	}

	var likeRows []projectCountRow
	if err := client.ProjectLike.Query().
		Where(projectlike.ProjectIDIn(projectIDs...)).
		GroupBy(projectlike.FieldProjectID).
		Aggregate(ent.Count()).
		Scan(ctx, &likeRows); err != nil {
		return nil, err
	}
	for _, row := range likeRows {
		value := counts[row.ProjectID]
		value.Likes = row.Count
		counts[row.ProjectID] = value
	}

	var viewRows []projectCountRow
	if err := client.ProjectView.Query().
		Where(projectview.ProjectIDIn(projectIDs...)).
		GroupBy(projectview.FieldProjectID).
		Aggregate(ent.Count()).
		Scan(ctx, &viewRows); err != nil {
		return nil, err
	}
	for _, row := range viewRows {
		value := counts[row.ProjectID]
		value.Views = row.Count
		counts[row.ProjectID] = value
	}

	return counts, nil
}

// ProjectCount reads one project's runtime counters.
func ProjectCount(ctx context.Context, client *ent.Client, projectID string) (Counts, error) {
	counts, err := ProjectCounts(ctx, client, []string{projectID})
	if err != nil {
		return Counts{}, err
	}
	return counts[projectID], nil
}

// IsProjectLiked reports the current actor state from project_likes. A request
// without an actor cannot own a like and therefore returns false.
func IsProjectLiked(ctx context.Context, client *ent.Client, projectID, userIdentityID, fingerprint string) (bool, error) {
	query := client.ProjectLike.Query().Where(projectlike.ProjectID(projectID))
	switch {
	case userIdentityID != "" && fingerprint != "":
		query = query.Where(projectlike.Or(
			projectlike.UserIdentityID(userIdentityID),
			projectlike.Fingerprint(fingerprint),
		))
	case userIdentityID != "":
		query = query.Where(projectlike.UserIdentityID(userIdentityID))
	case fingerprint != "":
		query = query.Where(projectlike.Fingerprint(fingerprint))
	default:
		return false, nil
	}
	return query.Exist(ctx)
}

// ContentCounts batches active likes and deduplicated view rows from the
// unified runtime interaction table. Unlike removes the actor's like row;
// views remain immutable events.
func ContentCounts(ctx context.Context, client *ent.Client, entityType contentinteraction.EntityType, entityIDs []string) (map[string]Counts, error) {
	counts := make(map[string]Counts, len(entityIDs))
	if len(entityIDs) == 0 {
		return counts, nil
	}

	var rows []contentCountRow
	if err := client.ContentInteraction.Query().
		Where(
			contentinteraction.EntityTypeEQ(entityType),
			contentinteraction.EntityIDIn(entityIDs...),
		).
		GroupBy(contentinteraction.FieldEntityID, contentinteraction.FieldKind).
		Aggregate(ent.Count()).
		Scan(ctx, &rows); err != nil {
		return nil, err
	}
	for _, row := range rows {
		value := counts[row.EntityID]
		switch row.Kind {
		case contentinteraction.KindLike:
			value.Likes = row.Count
		case contentinteraction.KindView:
			value.Views = row.Count
		}
		counts[row.EntityID] = value
	}

	return counts, nil
}

// ContentCount reads one content item's runtime counters.
func ContentCount(ctx context.Context, client *ent.Client, entityType contentinteraction.EntityType, entityID string) (Counts, error) {
	counts, err := ContentCounts(ctx, client, entityType, []string{entityID})
	if err != nil {
		return Counts{}, err
	}
	return counts[entityID], nil
}

// IsContentLiked reports the current actor state for one content item.
func IsContentLiked(ctx context.Context, client *ent.Client, entityType contentinteraction.EntityType, entityID, userIdentityID, fingerprint string) (bool, error) {
	query := client.ContentInteraction.Query().Where(
		contentinteraction.EntityTypeEQ(entityType),
		contentinteraction.EntityIDEQ(entityID),
		contentinteraction.KindEQ(contentinteraction.KindLike),
	)
	switch {
	case userIdentityID != "" && fingerprint != "":
		query = query.Where(contentinteraction.Or(
			contentinteraction.UserIdentityIDEQ(userIdentityID),
			contentinteraction.FingerprintEQ(fingerprint),
		))
	case userIdentityID != "":
		query = query.Where(contentinteraction.UserIdentityIDEQ(userIdentityID))
	case fingerprint != "":
		query = query.Where(contentinteraction.FingerprintEQ(fingerprint))
	default:
		return false, nil
	}
	return query.Exist(ctx)
}

// BlogCounts batches active likes and deduplicated view rows from the unified
// runtime interaction table. Unlike removes the actor's like row; views remain
// immutable events.
func BlogCounts(ctx context.Context, client *ent.Client, blogIDs []string) (map[string]Counts, error) {
	return ContentCounts(ctx, client, contentinteraction.EntityTypeBlog, blogIDs)
}

// BlogCount reads one blog post's runtime counters.
func BlogCount(ctx context.Context, client *ent.Client, blogID string) (Counts, error) {
	return ContentCount(ctx, client, contentinteraction.EntityTypeBlog, blogID)
}

// IsBlogLiked reports the current actor state. It deliberately mirrors the
// actor precedence used by project likes.
func IsBlogLiked(ctx context.Context, client *ent.Client, blogID, userIdentityID, fingerprint string) (bool, error) {
	return IsContentLiked(ctx, client, contentinteraction.EntityTypeBlog, blogID, userIdentityID, fingerprint)
}
