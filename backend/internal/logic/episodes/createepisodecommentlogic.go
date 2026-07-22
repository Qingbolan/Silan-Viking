package episodes

import (
	"context"

	"silan-backend/internal/ent/comment"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	bloglogic "silan-backend/internal/logic/blog"

	"github.com/zeromicro/go-zero/core/logx"
)

type CreateEpisodeCommentLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewCreateEpisodeCommentLogic(ctx context.Context, svcCtx *svc.ServiceContext) *CreateEpisodeCommentLogic {
	return &CreateEpisodeCommentLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *CreateEpisodeCommentLogic) CreateEpisodeComment(req *types.CreateBlogCommentRequest) (*types.BlogCommentData, error) {
	if _, err := l.svcCtx.DB.Episode.Get(l.ctx, req.ID); err != nil {
		return nil, err
	}
	return bloglogic.NewCreateBlogCommentLogic(l.ctx, l.svcCtx).
		CreateComment(req, comment.EntityTypeEpisode)
}
