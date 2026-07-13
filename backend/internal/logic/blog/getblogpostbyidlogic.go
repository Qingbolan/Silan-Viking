package blog

import (
	"context"

	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetBlogPostByIdLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetBlogPostByIdLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetBlogPostByIdLogic {
	return &GetBlogPostByIdLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *GetBlogPostByIdLogic) GetBlogPostById(req *types.BlogByIdRequest) (*types.BlogData, error) {
	post, err := l.svcCtx.DB.BlogPost.Query().
		Where(
			blogpost.ID(req.ID),
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
