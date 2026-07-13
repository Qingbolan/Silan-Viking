package updates

import (
	"context"

	"silan-backend/internal/ent/recentupdate"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetUpdateLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetUpdateLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetUpdateLogic {
	return &GetUpdateLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetUpdateLogic) GetUpdate(req *types.UpdateRequest) (*types.RecentUpdate, error) {
	update, err := l.svcCtx.DB.RecentUpdate.Query().
		Where(
			recentupdate.Slug(req.Slug),
			recentupdate.VisibilityEQ(recentupdate.VisibilityPublic),
		).
		WithTranslations().
		First(l.ctx)
	if err != nil {
		return nil, err
	}

	data := updateToData(l.ctx, l.svcCtx.ContentTags, update, req.Language)

	// Update is a prose type: the body markdown lives in item_part_translation
	// (the `body` Part), not in the recent_updates table. Override the
	// description with the synced Part body on the detail endpoint.
	if body := updatePartBody(l.ctx, l.svcCtx, update.ID, "body", req.Language); body != "" {
		data.Description = body
	}

	return &data, nil
}
