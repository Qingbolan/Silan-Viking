package moments

import (
	"context"

	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/moment"
	"silan-backend/internal/logic/analytics"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type UpdateMomentViewsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewUpdateMomentViewsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *UpdateMomentViewsLogic {
	return &UpdateMomentViewsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *UpdateMomentViewsLogic) UpdateMomentViews(req *types.UpdateBlogViewsRequest) error {
	if _, err := l.svcCtx.DB.Moment.Query().Where(moment.IDEQ(req.ID), moment.VisibilityEQ(moment.VisibilityPublic)).Only(l.ctx); err != nil {
		return err
	}
	return analytics.NewContentViewsRecorder(l.ctx, l.svcCtx).
		Record(req, contentinteraction.EntityTypeMoment)
}
