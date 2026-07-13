package blog

import (
	"context"
	"fmt"
	"math"
	"strings"

	"silan-backend/internal/contentsearch"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/ent/blogposttranslation"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/logic/engagement"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetBlogPostsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get blog posts list with pagination and filtering
func NewGetBlogPostsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetBlogPostsLogic {
	return &GetBlogPostsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetBlogPostsLogic) GetBlogPosts(req *types.BlogListRequest) (resp *types.BlogListResponse, err error) {
	query := l.svcCtx.DB.BlogPost.Query().
		Where(
			blogpost.StatusEQ(blogpost.StatusPublished),
			blogpost.VisibilityEQ(blogpost.VisibilityPublic),
		).
		WithTranslations()

	// Category filter: the schema's `category_id` column holds a free-text
	// frontmatter label (see BlogPost.Edges — no FK to blog_categories), so
	// the filter is a plain equality on that label.
	if req.Category != "" {
		query = query.Where(blogpost.CategoryIDEQ(req.Category))
	}

	if req.Featured {
		query = query.Where(blogpost.IsFeatured(true))
	}

	if req.ContentType != "" {
		query = query.Where(blogpost.ContentTypeEQ(blogpost.ContentType(req.ContentType)))
	}

	if search := strings.TrimSpace(req.Search); search != "" {
		partIDs, partErr := contentsearch.EntityIDsMatchingParts(
			l.ctx, l.svcCtx.DB, itempart.EntityTypeBlog, search, req.Language,
		)
		if partErr != nil {
			return nil, partErr
		}
		query = query.Where(blogpost.Or(
			blogpost.TitleContainsFold(search),
			blogpost.ExcerptContainsFold(search),
			blogpost.ContentContainsFold(search),
			blogpost.IDIn(partIDs...),
			blogpost.HasTranslationsWith(
				blogposttranslation.LanguageCodeIn(contentsearch.Languages(req.Language)...),
				blogposttranslation.Or(
					blogposttranslation.TitleContainsFold(search),
					blogposttranslation.ExcerptContainsFold(search),
					blogposttranslation.ContentContainsFold(search),
				),
			),
		))
	}

	// Tag filter — resolved through the cross-type `content_tag` table.
	// `EntityIDsMatchingTags` returns the blog ids carrying the tag; an
	// empty (non-nil) result means nothing matches, so `IDIn` correctly
	// narrows the query to zero rows rather than skipping the filter.
	if req.Tag != "" {
		ids, tagErr := l.svcCtx.ContentTags.EntityIDsMatchingTags(l.ctx, "blog", []string{req.Tag})
		if tagErr != nil {
			return nil, tagErr
		}
		query = query.Where(blogpost.IDIn(ids...))
	}

	// The silan-viking model has no separate `blog_series` table, so the
	// listing does not fold a series into one representative post — every
	// published post is listed, newest first. Each post still carries its
	// `series_id` / `series_order`, so a client can group by series itself.
	allFilteredPosts, err := query.
		Order(ent.Desc(blogpost.FieldPublishedAt)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	total := len(allFilteredPosts)
	offset := (req.Page - 1) * req.Size
	end := offset + req.Size
	if end > len(allFilteredPosts) {
		end = len(allFilteredPosts)
	}

	var posts []*ent.BlogPost
	if offset < len(allFilteredPosts) {
		posts = allFilteredPosts[offset:end]
	}
	postIDs := make([]string, 0, len(posts))
	for _, post := range posts {
		postIDs = append(postIDs, post.ID)
	}
	engagementCounts, err := engagement.BlogCounts(l.ctx, l.svcCtx.DB, postIDs)
	if err != nil {
		return nil, err
	}

	result := make([]types.BlogData, 0, len(posts))
	for _, post := range posts {
		counts := engagementCounts[post.ID]
		// `published_at` is a plain date string.
		publishDate := post.PublishedAt

		var readTime string
		if post.ReadingTimeMinutes > 0 {
			readTime = fmt.Sprintf("%d min read", post.ReadingTimeMinutes)
		}

		// SCHEMA.md `blog.category` is a free-text label written straight
		// into `category_id`; surface it directly. See BlogPost.Edges.
		category := post.CategoryID

		// Tags come from the cross-type `content_tag` table — the engine no
		// longer populates the legacy ent `Tags` edge.
		tags, err := l.svcCtx.ContentTags.Lookup(l.ctx, "blog", post.ID)
		if err != nil {
			l.Errorf("content_tag lookup for blog %s: %v", post.ID, err)
		}

		// Single-owner system: content has no per-item author. The site
		// owner is the author of everything; the frontend supplies that.
		var author string

		// Resolve language-variant fields. The content engine keeps title /
		// excerpt in blog_post_translations for every language (the main
		// blog_posts row leaves them empty), so always consult translations:
		// prefer the requested language, then "en", then any available.
		title := post.Title
		excerpt := post.Excerpt

		if post.Edges.Translations != nil {
			lang := req.Language
			if lang == "" {
				lang = "en"
			}
			pick := func(code string) *ent.BlogPostTranslation {
				for _, t := range post.Edges.Translations {
					if t.LanguageCode == code {
						return t
					}
				}
				return nil
			}
			tr := pick(lang)
			if tr == nil {
				tr = pick("en")
			}
			if tr == nil && len(post.Edges.Translations) > 0 {
				tr = post.Edges.Translations[0]
			}
			if tr != nil {
				if tr.Title != "" {
					title = tr.Title
				}
				if tr.Excerpt != "" {
					excerpt = tr.Excerpt
				}
			}
		}

		// A blog's series is just the `series_id` / `series_order` fields on
		// the post — no separate `blog_series` table. `series_id` is the
		// series slug; it doubles as id and slug.
		var seriesID, seriesSlug, seriesTitle, seriesTitleZh, seriesDescription, seriesDescriptionZh, seriesImage string
		var episodeNumber, totalEpisodes int
		contentType := string(post.ContentType)
		if post.SeriesID != "" {
			seriesID = post.SeriesID
			seriesSlug = post.SeriesID
			seriesTitle = post.SeriesID
			episodeNumber = post.SeriesOrder
		}

		result = append(result, types.BlogData{
			ID:                  post.ID,
			Title:               title,
			Slug:                post.Slug,
			Author:              author,
			PublishDate:         publishDate,
			ReadTime:            readTime,
			Category:            category,
			Tags:                tags,
			Likes:               int64(counts.Likes),
			Views:               int64(counts.Views),
			Summary:             excerpt,
			FeaturedImageURL:    post.FeaturedImageURL,
			Type:                contentType,
			SeriesID:            seriesID,
			SeriesSlug:          seriesSlug,
			SeriesTitle:         seriesTitle,
			SeriesTitleZh:       seriesTitleZh,
			SeriesDescription:   seriesDescription,
			SeriesDescriptionZh: seriesDescriptionZh,
			EpisodeNumber:       episodeNumber,
			TotalEpisodes:       totalEpisodes,
			SeriesImage:         seriesImage,
		})
	}

	totalPages := int(math.Ceil(float64(total) / float64(req.Size)))

	return &types.BlogListResponse{
		Posts:      result,
		Total:      int64(total),
		Page:       req.Page,
		Size:       req.Size,
		TotalPages: totalPages,
	}, nil
}
