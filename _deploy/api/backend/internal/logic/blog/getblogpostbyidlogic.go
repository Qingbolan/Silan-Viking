package blog

import (
	"context"
	"fmt"

	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/google/uuid"
	"github.com/zeromicro/go-zero/core/logx"
)

type GetBlogPostByIdLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get single blog post by ID
func NewGetBlogPostByIdLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetBlogPostByIdLogic {
	return &GetBlogPostByIdLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetBlogPostByIdLogic) GetBlogPostById(req *types.BlogByIdRequest) (resp *types.BlogData, err error) {
	// Parse UUID
	postId, err := uuid.Parse(req.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid blog post ID: %w", err)
	}

	post, err := l.svcCtx.DB.BlogPost.Query().
		Where(blogpost.ID(postId)).
		WithUser().
		WithCategory().
		WithSeries().
		WithTags().
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

	// Parse content - create structured blog content
	content := []types.BlogContent{
		{
			Type:    "text",
			Content: post.Content,
			ID:      post.ID.String() + "-content",
		},
	}

	// Add series information if this is part of a series
	var seriesID, seriesTitle, seriesDescription string
	var episodeNumber, totalEpisodes int
	if post.Edges.Series != nil {
		seriesID = post.Edges.Series.ID.String()
		seriesTitle = post.Edges.Series.Title
		seriesDescription = post.Edges.Series.Description
		episodeNumber = post.SeriesOrder
		totalEpisodes = post.Edges.Series.EpisodeCount
	}

	return &types.BlogData{
		ID:                post.ID.String(),
		Title:             post.Title,
		Slug:              post.Slug,
		Author:            author,
		PublishDate:       publishDate,
		ReadTime:          readTime,
		Category:          category,
		Tags:              tags,
		Content:           content,
		Likes:             int64(post.LikeCount),
		Views:             int64(post.ViewCount),
		Summary:           post.Excerpt,
		Type:              string(post.ContentType),
		SeriesID:          seriesID,
		SeriesTitle:       seriesTitle,
		SeriesDescription: seriesDescription,
		EpisodeNumber:     episodeNumber,
		TotalEpisodes:     totalEpisodes,
	}, nil
}
