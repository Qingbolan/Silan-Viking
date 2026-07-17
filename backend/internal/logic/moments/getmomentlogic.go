package moments

import (
	"context"

	"silan-backend/internal/ent/moment"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetMomentLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetMomentLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetMomentLogic {
	return &GetMomentLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetMomentLogic) GetMoment(req *types.MomentRequest) (*types.Moment, error) {
	moment, err := l.svcCtx.DB.Moment.Query().
		Where(
			moment.Slug(req.Slug),
			moment.VisibilityEQ(moment.VisibilityPublic),
		).
		WithTranslations().
		First(l.ctx)
	if err != nil {
		return nil, err
	}

	data := updateToData(l.ctx, l.svcCtx.ContentTags, moment, req.Language)

	// Moment is a prose type: the body markdown lives in item_part_translation
	// (the `body` Part), not in the moments table. Override the
	// description with the synced Part body on the detail endpoint.
	if body := updatePartBody(l.ctx, l.svcCtx, moment.ID, "body", req.Language); body != "" {
		data.Description = body
	}

	return &data, nil
}
