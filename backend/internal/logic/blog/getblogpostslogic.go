package blog

import (
	"context"
	"fmt"
	"math"

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

	total, err := query.Count(l.ctx)
	if err != nil {
		return nil, err
	}

	offset := (req.Page - 1) * req.Size
	posts, err := query.
		Order(ent.Desc(blogpost.FieldPublishedAt)).
		Offset(offset).
		Limit(req.Size).
		All(l.ctx)
	if err != nil {
		return nil, err
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

		if req.Language != "en" && post.Edges.Translations != nil {
			for _, translation := range post.Edges.Translations {
				if translation.LanguageCode == req.Language {
					title = translation.Title
					excerpt = translation.Excerpt
					break
				}
			}
		}

		result = append(result, types.BlogData{
			ID:          post.ID.String(),
			Title:       title,
			Slug:        post.Slug,
			Author:      author,
			PublishDate: publishDate,
			ReadTime:    readTime,
			Category:    category,
			Tags:        tags,
			Likes:       int64(post.LikeCount),
			Views:       int64(post.ViewCount),
			Summary:     excerpt,
			Type:        string(post.ContentType),
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
