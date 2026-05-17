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
		Where(
			blogpost.ID(postId),
			blogpost.StatusEQ(blogpost.StatusPublished),
			blogpost.VisibilityEQ(blogpost.VisibilityPublic),
		).
		WithUser().
		WithCategory().
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

	title := post.Title
	excerpt := post.Excerpt
	body := post.Content
	if req.Language != "en" && post.Edges.Translations != nil {
		for _, translation := range post.Edges.Translations {
			if translation.LanguageCode == req.Language {
				title = translation.Title
				excerpt = translation.Excerpt
				body = translation.Content
				break
			}
		}
	}

	content := []types.BlogContent{
		{
			Type:    "text",
			Content: body,
			ID:      post.ID.String() + "-content",
		},
	}

	return &types.BlogData{
		ID:          post.ID.String(),
		Title:       title,
		Slug:        post.Slug,
		Author:      author,
		PublishDate: publishDate,
		ReadTime:    readTime,
		Category:    category,
		Tags:        tags,
		Content:     content,
		Likes:       int64(post.LikeCount),
		Views:       int64(post.ViewCount),
		Summary:     excerpt,
		Type:        string(post.ContentType),
	}, nil
}
