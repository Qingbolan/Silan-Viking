package blog

import (
	"context"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type SearchBlogPostsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Search blog posts with filters
func NewSearchBlogPostsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *SearchBlogPostsLogic {
	return &SearchBlogPostsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *SearchBlogPostsLogic) SearchBlogPosts(req *types.BlogSearchRequest) (resp *types.BlogListResponse, err error) {
	// Convert search request to blog list request
	blogListReq := &types.BlogListRequest{
		Page:     req.Page,
		Size:     req.Size,
		Category: req.Category,
		Search:   req.Query,
		Tag:      req.Tags,
		Author:   req.Author,
		Language: req.Language,
	}

	// Use the existing GetBlogPosts logic
	getBlogPostsLogic := NewGetBlogPostsLogic(l.ctx, l.svcCtx)
	return getBlogPostsLogic.GetBlogPosts(blogListReq)
}
