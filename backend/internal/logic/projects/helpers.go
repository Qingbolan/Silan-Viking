package projects

import (
	"context"
	"time"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/svc"
)

func formatContentTime(value time.Time, layout string) string {
	if value.IsZero() || value.Year() <= 1 {
		return ""
	}
	return value.Format(layout)
}

// resolveLang normalizes an empty language to the default ("en").
func resolveLang(lang string) string {
	if lang == "" {
		return "en"
	}
	return lang
}

// pickProjectTranslation selects the best project translation for a language:
// the requested language, then "en", then the first available. It returns
// nil when there are no translations.
func pickProjectTranslation(trs []*ent.ProjectTranslation, lang string) *ent.ProjectTranslation {
	by := func(code string) *ent.ProjectTranslation {
		for _, t := range trs {
			if t.LanguageCode == code {
				return t
			}
		}
		return nil
	}
	if t := by(resolveLang(lang)); t != nil {
		return t
	}
	if t := by("en"); t != nil {
		return t
	}
	if len(trs) > 0 {
		return trs[0]
	}
	return nil
}

// projectPartBody fetches a project's prose body for a given Part role and
// language. The content engine stores Part bodies in item_part_translation
// (keyed by the project's item_part rows), not in the projects table — so the
// detail endpoints read them here. It prefers the requested language, then
// "en", then any. Returns "" when the project has no synced body for that role.
func projectPartBody(ctx context.Context, svcCtx *svc.ServiceContext, projectID, role, lang string) string {
	part, err := svcCtx.DB.ItemPart.Query().
		Where(
			itempart.EntityTypeEQ(itempart.EntityTypeProject),
			itempart.EntityIDEQ(projectID),
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
