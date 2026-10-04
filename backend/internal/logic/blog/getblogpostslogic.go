package blog

import (
	"context"
	"fmt"
	"strings"

	"silan-backend/internal/contentsearch"
	"silan-backend/internal/contenttag"
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
		query = query.Where(blogpost.Or(
			blogpost.TitleContainsFold(search),
			blogpost.ExcerptContainsFold(search),
			blogpost.ContentContainsFold(search),
			contentsearch.MatchesParts(itempart.EntityTypeBlog, search, req.Language),
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

	if strings.TrimSpace(req.Tag) != "" {
		query = query.Where(contenttag.MatchesTags("blog", []string{req.Tag}))
	}

	// The silan-viking model has no separate `blog_series` table, so the
	// listing does not fold a series into one representative post — every
	// published post is listed, newest first. Each post still carries its
	// `series_id` / `series_order`, so a client can group by series itself.
	total, err := query.Clone().Count(l.ctx)
	if err != nil {
		return nil, err
	}
	page, size := req.Page, req.Size
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 10
	}
	// Compare page indexes before multiplying to avoid overflow on hostile input.
	posts := []*ent.BlogPost{}
	if total > 0 && page-1 <= (total-1)/size {
		posts, err = query.Order(ent.Desc(blogpost.FieldPublishedAt), ent.Asc(blogpost.FieldID)).Offset((page - 1) * size).Limit(size).All(l.ctx)
		if err != nil {
			return nil, err
		}
	}
	postIDs := make([]string, 0, len(posts))
	for _, post := range posts {
		postIDs = append(postIDs, post.ID)
	}
	engagementCounts, err := engagement.BlogCounts(l.ctx, l.svcCtx.DB, postIDs)
	if err != nil {
		return nil, err
	}

	tagsByPost, tagErr := l.svcCtx.ContentTags.LookupMany(l.ctx, "blog", postIDs)
	if tagErr != nil {
		l.Errorf("content_tag lookup for blog page: %v", tagErr)
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
		tags := tagsByPost[post.ID]

		// Single-owner system: content has no per-item author. The site
		// owner is the author of everything; the frontend supplies that.
		var author string

		// Resolve language-variant fields. The content engine keeps title,
		// excerpt, and featured image metadata in blog_post_translations.
		title := post.Title
		excerpt := post.Excerpt

		if translation := pickBlogTranslation(post.Edges.Translations, req.Language); translation != nil {
			if translation.Title != "" {
				title = translation.Title
			}
			if translation.Excerpt != "" {
				excerpt = translation.Excerpt
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
			FeaturedImageURL:    blogFeaturedImageURL(post, req.Language),
			FeaturedImageURLs:   blogFeaturedImageURLs(post),
			ProjectName:         post.ProjectName,
			PublicationVenue:    post.PublicationVenue,
			ProjectURL:          post.ProjectURL,
			ExternalResources:   parseBlogResources(post.ExternalResources),
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

	totalPages := total / size
	if total%size != 0 {
		totalPages++
	}

	return &types.BlogListResponse{
		Posts:      result,
		Total:      int64(total),
		Page:       page,
		Size:       size,
		TotalPages: totalPages,
	}, nil
}
