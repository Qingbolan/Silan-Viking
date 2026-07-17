package moments

import (
	"context"

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

// updatePartBody fetches a recent moment's prose body for a given Part role
// and language. The content engine stores Part bodies in item_part_translation
// (keyed by the moment's item_part rows), not in the moments table — so
// the detail endpoint reads them here. It prefers the requested language, then
// "en", then any. Returns "" when there is no synced body for that role.
func updatePartBody(ctx context.Context, svcCtx *svc.ServiceContext, updateID, role, lang string) string {
	return updatePartBodies(ctx, svcCtx, []string{updateID}, role, lang)[updateID]
}

// updatePartBodies resolves one prose Part for a set of moments in a single
// query. List endpoints must not issue one query per moment simply because
// prose lives in the generic Part model.
func updatePartBodies(
	ctx context.Context,
	svcCtx *svc.ServiceContext,
	updateIDs []string,
	role string,
	lang string,
) map[string]string {
	bodies := make(map[string]string, len(updateIDs))
	if len(updateIDs) == 0 {
		return bodies
	}
	parts, err := svcCtx.DB.ItemPart.Query().
		Where(
			itempart.EntityTypeEQ(itempart.EntityTypeMoment),
			itempart.EntityIDIn(updateIDs...),
			itempart.Role(role),
		).
		WithTranslations().
		All(ctx)
	if err != nil {
		return bodies
	}
	for _, part := range parts {
		trs := part.Edges.Translations
		by := func(code string) string {
			for _, translation := range trs {
				if translation.LanguageCode == code && translation.Body != "" {
					return translation.Body
				}
			}
			return ""
		}
		if body := by(resolveLang(lang)); body != "" {
			bodies[part.EntityID] = body
			continue
		}
		if body := by("en"); body != "" {
			bodies[part.EntityID] = body
			continue
		}
		for _, translation := range trs {
			if translation.Body != "" {
				bodies[part.EntityID] = translation.Body
				break
			}
		}
	}
	return bodies
}

func updateToData(ctx context.Context, tags *contenttag.Repository, moment *ent.Moment, language string) types.Moment {
	title := moment.Title
	description := moment.Description
	for _, translation := range moment.Edges.Translations {
		if translation.LanguageCode == language {
			title = translation.Title
			description = translation.Description
			break
		}
	}

	// Tags come from the cross-type `content_tag` table — the engine no
	// longer writes them onto the `moments.tags` column.
	labels, _ := tags.Lookup(ctx, "moment", moment.ID)

	return types.Moment{
		ID:          moment.ID,
		UserID:      moment.UserID,
		Slug:        moment.Slug,
		Type:        string(moment.SubjectKind),
		MomentType:  string(moment.MomentType),
		Visibility:  string(moment.Visibility),
		Title:       title,
		Description: description,
		Date:        moment.Date,
		Tags:        labels,
		Status:      string(moment.Status),
		Priority:    string(moment.Priority),
		Pinned:      moment.Pinned,
		CreatedAt:   moment.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   moment.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}
