package ideas

import (
	"context"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/idea"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/svc"
)

// resolveIdeaID accepts either an idea's stable slug (the new URL key
// for `/ideas/<slug>` and its sub-routes, M0.5b GOAL #6) or its legacy
// UUID, and returns the UUID — the natural key of comment / interaction
// / annotation tables. Sub-routes (`:id/comments`, `:id/like`, etc.)
// still join runtime data by UUID; only the main detail route is
// keyed by slug. This helper is the bridge.
//
// Resolution order:
//   1. treat the input as a slug; if an idea with that slug exists,
//      return its UUID.
//   2. fall through to treating the input as a UUID directly, so
//      bookmarked or cached UUID-shaped URLs still work.
//
// Returns the resolved UUID and ok=true on success.
func resolveIdeaID(ctx context.Context, svcCtx *svc.ServiceContext, ref string) (string, bool) {
	if ref == "" {
		return "", false
	}
	if entity, err := svcCtx.DB.Idea.Query().Where(idea.Slug(ref)).First(ctx); err == nil {
		return entity.ID, true
	}
	if entity, err := svcCtx.DB.Idea.Query().Where(idea.ID(ref)).First(ctx); err == nil {
		return entity.ID, true
	}
	return "", false
}

// resolveLang normalizes an empty language to the default ("en").
func resolveLang(lang string) string {
	if lang == "" {
		return "en"
	}
	return lang
}

// pickIdeaTranslation selects the best idea translation for a language:
// the requested language, then "en", then the first available. It returns
// nil when there are no translations.
func pickIdeaTranslation(trs []*ent.IdeaTranslation, lang string) *ent.IdeaTranslation {
	by := func(code string) *ent.IdeaTranslation {
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

// ideaPartBody fetches an idea's prose body for a given Part role and
// language. The content engine stores Part bodies in item_part_translation
// (keyed by the idea's item_part rows), not in the ideas table — so the
// detail endpoint reads them here. It prefers the requested language, then
// "en", then any. Returns "" when the idea has no synced body for that role.
func ideaPartBody(ctx context.Context, svcCtx *svc.ServiceContext, ideaID, role, lang string) string {
	part, err := svcCtx.DB.ItemPart.Query().
		Where(
			itempart.EntityTypeEQ(itempart.EntityTypeIdea),
			itempart.EntityIDEQ(ideaID),
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
