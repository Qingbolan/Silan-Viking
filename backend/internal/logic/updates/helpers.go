package updates

import (
	"context"
	"database/sql"

	"silan-backend/internal/contenttag"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// resolveLang normalizes an empty language to the default ("en").
func resolveLang(lang string) string {
	if lang == "" {
		return "en"
	}
	return lang
}

// updatePartBody fetches a recent update's prose body for a given Part role
// and language. The content engine stores Part bodies in item_part_translation
// (keyed by the update's item_part rows), not in the recent_updates table — so
// the detail endpoint reads them here. It prefers the requested language, then
// "en", then any. Returns "" when there is no synced body for that role.
func updatePartBody(ctx context.Context, svcCtx *svc.ServiceContext, updateID, role, lang string) string {
	part, err := svcCtx.DB.ItemPart.Query().
		Where(
			itempart.EntityTypeEQ(itempart.EntityTypeUpdate),
			itempart.EntityIDEQ(updateID),
			itempart.Role(role),
		).
		WithTranslations().
		First(ctx)
	if err != nil || part == nil {
		return ""
	}
	trs := part.Edges.Translations
	by := func(code string) string {
		for _, t := range trs {
			if t.LanguageCode == code && t.Body != "" {
				return t.Body
			}
		}
		return ""
	}
	if b := by(resolveLang(lang)); b != "" {
		return b
	}
	if b := by("en"); b != "" {
		return b
	}
	for _, t := range trs {
		if t.Body != "" {
			return t.Body
		}
	}
	return ""
}

func updateToData(ctx context.Context, rawDB *sql.DB, update *ent.RecentUpdate, language string) types.RecentUpdate {
	title := update.Title
	description := update.Description
	for _, translation := range update.Edges.Translations {
		if translation.LanguageCode == language {
			title = translation.Title
			description = translation.Description
			break
		}
	}

	// Tags come from the cross-type `content_tag` table — the engine no
	// longer writes them onto the `recent_updates.tags` column.
	tags, _ := contenttag.Lookup(ctx, rawDB, "update", update.ID)

	return types.RecentUpdate{
		ID:          update.ID,
		UserID:      update.UserID,
		Slug:        update.Slug,
		Type:        string(update.SubjectKind),
		UpdateType:  string(update.UpdateType),
		Visibility:  string(update.Visibility),
		Title:       title,
		Description: description,
		Date:        update.Date,
		Tags:        tags,
		Status:      string(update.Status),
		Priority:    string(update.Priority),
		CreatedAt:   update.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   update.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}
