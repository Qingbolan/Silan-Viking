package blog

import (
	"context"
	"fmt"
	"math"
	"sort"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/blogcategory"
	"silan-backend/internal/ent/blogpost"
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
		WithUser().
		WithCategory().
		WithSeries(func(q *ent.BlogSeriesQuery) {
			q.WithTranslations()
		}).
		WithTags().
		WithTranslations()

	// Apply filters
	if req.Category != "" {
		query = query.Where(blogpost.HasCategoryWith(
			blogcategory.Slug(req.Category),
		))
	}

	if req.Featured {
		query = query.Where(blogpost.IsFeatured(true))
	}

	if req.ContentType != "" {
		query = query.Where(blogpost.ContentTypeEQ(blogpost.ContentType(req.ContentType)))
	}

	if req.Search != "" {
		query = query.Where(blogpost.Or(
			blogpost.TitleContains(req.Search),
			blogpost.ExcerptContains(req.Search),
			blogpost.ContentContains(req.Search),
		))
	}

	nonEpisodePosts, err := query.
		Where(blogpost.SeriesIDIsNil()).
		Order(ent.Desc(blogpost.FieldPublishedAt)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	var seriesRepresentatives []*ent.BlogPost
	allSeries, err := l.svcCtx.DB.BlogSeries.Query().
		WithTranslations().
		WithBlogPosts(func(bpq *ent.BlogPostQuery) {
			bpq.WithUser().
				WithCategory().
				WithSeries(func(q *ent.BlogSeriesQuery) {
					q.WithTranslations()
				}).
				WithTags().
				WithTranslations().
				Where(
					blogpost.StatusEQ(blogpost.StatusPublished),
					blogpost.VisibilityEQ(blogpost.VisibilityPublic),
				)
		}).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	for _, series := range allSeries {
		if len(series.Edges.BlogPosts) == 0 {
			continue
		}
		var latestEpisode *ent.BlogPost
		for _, episode := range series.Edges.BlogPosts {
			if latestEpisode == nil || episode.SeriesOrder > latestEpisode.SeriesOrder {
				latestEpisode = episode
			}
		}
		if latestEpisode != nil {
			seriesRepresentatives = append(seriesRepresentatives, latestEpisode)
		}
	}

	allFilteredPosts := append([]*ent.BlogPost{}, nonEpisodePosts...)
	allFilteredPosts = append(allFilteredPosts, seriesRepresentatives...)
	sort.Slice(allFilteredPosts, func(i, j int) bool {
		return allFilteredPosts[i].PublishedAt.After(allFilteredPosts[j].PublishedAt)
	})

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

	var result []types.BlogData
	for _, post := range posts {
		var publishDate string
		if !post.PublishedAt.IsZero() {
			publishDate = post.PublishedAt.Format("2006-01-02")
		}

		var readTime string
		if post.ReadingTimeMinutes > 0 {
			readTime = fmt.Sprintf("%d min read", post.ReadingTimeMinutes)
		}

		var category string
		if post.Edges.Category != nil {
			category = post.Edges.Category.Name
		}

		var tags []string
		for _, tag := range post.Edges.Tags {
			tags = append(tags, tag.Name)
		}

		var author string
		if post.Edges.User != nil {
			author = post.Edges.User.FirstName + " " + post.Edges.User.LastName
		}

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

		var seriesID, seriesSlug, seriesTitle, seriesTitleZh, seriesDescription, seriesDescriptionZh, seriesImage string
		var episodeNumber, totalEpisodes int
		contentType := string(post.ContentType)
		if post.Edges.Series != nil {
			seriesID = post.Edges.Series.ID
			seriesSlug = post.Edges.Series.Slug
			seriesTitle = post.Edges.Series.Title
			seriesDescription = post.Edges.Series.Description
			seriesImage = post.Edges.Series.ThumbnailURL
			episodeNumber = post.SeriesOrder
			totalEpisodes = post.Edges.Series.EpisodeCount
			contentType = "episode"
			for _, translation := range post.Edges.Series.Edges.Translations {
				if translation.LanguageCode == "zh" {
					seriesTitleZh = translation.Title
					seriesDescriptionZh = translation.Description
					break
				}
			}
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
			Likes:               int64(post.LikeCount),
			Views:               int64(post.ViewCount),
			Summary:             excerpt,
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
