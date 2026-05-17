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
		Where(blogpost.Or(
			blogpost.StatusEQ(blogpost.StatusPublished),
			blogpost.StatusEQ(blogpost.StatusDraft),
		)).
		WithUser().
		WithCategory().
		WithSeries().
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

	// First, get all non-episode posts (posts without series_id) that match the filters
	nonEpisodePosts, err := query.
		Where(blogpost.SeriesIDIsNil()).
		Order(ent.Desc(blogpost.FieldPublishedAt)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	// Then get all series and find the latest episode for each
	var seriesRepresentatives []*ent.BlogPost
	allSeries, err := l.svcCtx.DB.BlogSeries.Query().
		WithBlogPosts(func(bpq *ent.BlogPostQuery) {
			bpq.WithUser().WithCategory().WithSeries().WithTags().WithTranslations().
				Where(blogpost.StatusEQ(blogpost.StatusPublished))
		}).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	for _, series := range allSeries {
		if len(series.Edges.BlogPosts) > 0 {
			// Find the episode with the highest series_order
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
	}

	// Combine all posts and sort by published date
	var allFilteredPosts []*ent.BlogPost
	allFilteredPosts = append(allFilteredPosts, nonEpisodePosts...)
	allFilteredPosts = append(allFilteredPosts, seriesRepresentatives...)

	// Sort all posts by published date (descending)
	sort.Slice(allFilteredPosts, func(i, j int) bool {
		return allFilteredPosts[i].PublishedAt.After(allFilteredPosts[j].PublishedAt)
	})

	// Calculate total count of final filtered results
	total := len(allFilteredPosts)

	// Apply pagination to the final filtered results
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

		// Handle language-specific content
		title := post.Title
		excerpt := post.Excerpt
		
		// If requesting non-English content, look for translations
		if req.Language != "en" && post.Edges.Translations != nil {
			for _, translation := range post.Edges.Translations {
				if translation.LanguageCode == req.Language {
					title = translation.Title
					excerpt = translation.Excerpt
					break
				}
			}
		}

		// Add series information if this is part of a series
		var seriesID, seriesTitle, seriesDescription string
		var episodeNumber, totalEpisodes int
		var contentType string
		if post.Edges.Series != nil {
			seriesID = post.Edges.Series.ID.String()
			seriesTitle = post.Edges.Series.Title
			seriesDescription = post.Edges.Series.Description
			episodeNumber = post.SeriesOrder
			totalEpisodes = post.Edges.Series.EpisodeCount
			contentType = "episode"  // Override type for posts with series
		} else {
			contentType = string(post.ContentType)
		}

		result = append(result, types.BlogData{
			ID:                post.ID.String(),
			Title:             title,
			Slug:              post.Slug,
			Author:            author,
			PublishDate:       publishDate,
			ReadTime:          readTime,
			Category:          category,
			Tags:              tags,
			Likes:             int64(post.LikeCount),
			Views:             int64(post.ViewCount),
			Summary:           excerpt,
			Type:              contentType,
			SeriesID:          seriesID,
			SeriesTitle:       seriesTitle,
			SeriesDescription: seriesDescription,
			EpisodeNumber:     episodeNumber,
			TotalEpisodes:     totalEpisodes,
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
