package blog

import (
	"context"

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

func NewGetBlogPostLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetBlogPostLogic {
	return &GetBlogPostLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *GetBlogPostLogic) GetBlogPost(req *types.BlogRequest) (*types.BlogData, error) {
	post, err := l.svcCtx.DB.BlogPost.Query().
		Where(
			blogpost.Slug(req.Slug),
			blogpost.StatusEQ(blogpost.StatusPublished),
			blogpost.VisibilityEQ(blogpost.VisibilityPublic),
		).
		WithTranslations().
		First(l.ctx)
	if err != nil {
		return nil, err
	}
	return blogDetailData(
		l.ctx, l.svcCtx, post, req.Language, req.AuthenticatedUserID, req.Fingerprint,
	)
}
