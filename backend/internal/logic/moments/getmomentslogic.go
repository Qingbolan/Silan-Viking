package moments

import (
	"context"

	"entgo.io/ent/dialect/sql"
	"silan-backend/internal/ent/moment"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetMomentsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetMomentsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetMomentsLogic {
	return &GetMomentsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetMomentsLogic) GetMoments(req *types.MomentListRequest) (*types.MomentListResponse, error) {
	moments, err := l.svcCtx.DB.Moment.Query().
		Where(moment.VisibilityEQ(moment.VisibilityPublic)).
		WithTranslations().
		Order(
			moment.ByPinned(sql.OrderDesc()),
			moment.ByDate(sql.OrderDesc()),
		).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(moments))
	for _, moment := range moments {
		ids = append(ids, moment.ID)
	}
	bodies := updatePartBodies(l.ctx, l.svcCtx, ids, "body", req.Language)
	relatedOutputs := relatedMomentOutputs(l.ctx, l.svcCtx, ids, req.Language)

	result := make([]types.Moment, 0, len(moments))
	for _, moment := range moments {
		data := updateToData(l.ctx, l.svcCtx.ContentTags, moment, req.Language)
		if body := bodies[moment.ID]; body != "" {
			data.Description = body
		}
		data.RelatedOutputs = relatedOutputs[moment.ID]
		result = append(result, data)
	}

	return &types.MomentListResponse{
		Moments: result,
		Total:   len(result),
	}, nil
}
