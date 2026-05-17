package blog

import (
	"context"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/svc"
)

// resolveLang normalizes an empty language to the default ("en").
func resolveLang(lang string) string {
	if lang == "" {
		return "en"
	}
	return lang
}

// pickBlogTranslation selects the best blog translation for a language:
// the requested language, then "en", then the first available. It returns
// nil when there are no translations.
func pickBlogTranslation(trs []*ent.BlogPostTranslation, lang string) *ent.BlogPostTranslation {
	by := func(code string) *ent.BlogPostTranslation {
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

// blogBody fetches a blog post's prose body for a language. The content
// engine stores the body in item_part_translation (keyed by the `body`
// item_part of the owning blog Item), not in blog_posts.content — so the
// detail endpoints read it here. It prefers the requested language, then
// "en", then any. Returns "" when the post has no synced body part.
func blogBody(ctx context.Context, svcCtx *svc.ServiceContext, postID, lang string) string {
	part, err := svcCtx.DB.ItemPart.Query().
		Where(
			itempart.EntityTypeEQ(itempart.EntityTypeBlog),
			itempart.EntityIDEQ(postID),
			itempart.Role("body"),
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
