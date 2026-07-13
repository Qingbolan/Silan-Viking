package updates

import (
	"context"

	"entgo.io/ent/dialect/sql"
	"silan-backend/internal/ent/recentupdate"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetUpdatesLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetUpdatesLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetUpdatesLogic {
	return &GetUpdatesLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetUpdatesLogic) GetUpdates(req *types.UpdateListRequest) (*types.UpdateListResponse, error) {
	updates, err := l.svcCtx.DB.RecentUpdate.Query().
		Where(recentupdate.VisibilityEQ(recentupdate.VisibilityPublic)).
		WithTranslations().
		Order(recentupdate.ByDate(sql.OrderDesc())).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(updates))
	for _, update := range updates {
		ids = append(ids, update.ID)
	}
	bodies := updatePartBodies(l.ctx, l.svcCtx, ids, "body", req.Language)

	result := make([]types.RecentUpdate, 0, len(updates))
	for _, update := range updates {
		data := updateToData(l.ctx, l.svcCtx.ContentTags, update, req.Language)
		if body := bodies[update.ID]; body != "" {
			data.Description = body
		}
		result = append(result, data)
	}

	return &types.UpdateListResponse{
		Updates: result,
		Total:   len(result),
	}, nil
}
