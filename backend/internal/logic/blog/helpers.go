package blog

import (
	"context"
	"fmt"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/logic/engagement"
	"silan-backend/internal/siteidentity"
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

// blogDetailData is the single projection for both slug and ID detail
// transports. Keeping it here prevents the two public routes from drifting in
// content IDs, actor state, author metadata, or language fallback.
func blogDetailData(
	ctx context.Context,
	svcCtx *svc.ServiceContext,
	post *ent.BlogPost,
	language string,
	userIdentityID string,
	fingerprint string,
) (*types.BlogData, error) {
	tags, err := svcCtx.ContentTags.Lookup(ctx, "blog", post.ID)
	if err != nil {
		return nil, err
	}

	title := post.Title
	excerpt := post.Excerpt
	if tr := pickBlogTranslation(post.Edges.Translations, language); tr != nil {
		if tr.Title != "" {
			title = tr.Title
		}
		if tr.Excerpt != "" {
			excerpt = tr.Excerpt
		}
	}
	body := post.Content
	if synced := blogBody(ctx, svcCtx, post.ID, language); synced != "" {
		body = synced
	}

	author, err := siteidentity.OwnerName(ctx, svcCtx.DB, language)
	if err != nil {
		return nil, err
	}

	counts, err := engagement.BlogCount(ctx, svcCtx.DB, post.ID)
	if err != nil {
		return nil, err
	}
	liked, err := engagement.IsBlogLiked(ctx, svcCtx.DB, post.ID, userIdentityID, fingerprint)
	if err != nil {
		return nil, err
	}

	readTime := ""
	if post.ReadingTimeMinutes > 0 {
		readTime = fmt.Sprintf("%d min read", post.ReadingTimeMinutes)
	}
	seriesID := post.SeriesID
	seriesTitle := ""
	if seriesID != "" {
		seriesTitle = seriesID
	}

	return &types.BlogData{
		ID:               post.ID,
		Title:            title,
		Slug:             post.Slug,
		Author:           author,
		PublishDate:      post.PublishedAt,
		ReadTime:         readTime,
		Category:         post.CategoryID,
		Tags:             tags,
		Content:          []types.BlogContent{{Type: "text", Content: body, ID: post.ID + "-content"}},
		Likes:            int64(counts.Likes),
		IsLikedByUser:    liked,
		Views:            int64(counts.Views),
		Summary:          excerpt,
		FeaturedImageURL: post.FeaturedImageURL,
		Type:             string(post.ContentType),
		SeriesID:         seriesID,
		SeriesSlug:       seriesID,
		SeriesTitle:      seriesTitle,
		EpisodeNumber:    post.SeriesOrder,
	}, nil
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
