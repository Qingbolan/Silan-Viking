package blog

import (
	"context"
	"fmt"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetBlogPostLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get single blog post by slug
func NewGetBlogPostLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetBlogPostLogic {
	return &GetBlogPostLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetBlogPostLogic) GetBlogPost(req *types.BlogRequest) (resp *types.BlogData, err error) {
	post, err := l.svcCtx.DB.BlogPost.Query().
		Where(
			blogpost.Slug(req.Slug),
			blogpost.StatusEQ(blogpost.StatusPublished),
			blogpost.VisibilityEQ(blogpost.VisibilityPublic),
		).
		WithUser().
		WithCategory().
		WithSeries(func(q *ent.BlogSeriesQuery) {
			q.WithTranslations()
		}).
		WithTags().
		WithTranslations().
		First(l.ctx)
	if err != nil {
		return nil, err
	}

	// Convert to response format
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

	// title/excerpt come from blog_post_translations, the prose body from
	// item_part_translation — the content engine leaves the main blog_posts
	// row's title/content empty (same as the by-id endpoint).
	title := post.Title
	excerpt := post.Excerpt
	if tr := pickBlogTranslation(post.Edges.Translations, req.Language); tr != nil {
		if tr.Title != "" {
			title = tr.Title
		}
		if tr.Excerpt != "" {
			excerpt = tr.Excerpt
		}
	}
	body := post.Content
	if synced := blogBody(l.ctx, l.svcCtx, post.ID, req.Language); synced != "" {
		body = synced
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

	content := []types.BlogContent{
		{
			Type:    "text",
			Content: body,
			ID:      post.ID,
		},
	}

	return &types.BlogData{
		ID:                  post.ID,
		Title:               title,
		Slug:                post.Slug,
		Author:              author,
		PublishDate:         publishDate,
		ReadTime:            readTime,
		Category:            category,
		Tags:                tags,
		Content:             content,
		Likes:               int64(post.LikeCount),
		Views:               int64(post.ViewCount),
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
	}, nil
}
