package resume

import (
	"context"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/award"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetAwardsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get awards list
func NewGetAwardsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetAwardsLogic {
	return &GetAwardsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetAwardsLogic) GetAwards(req *types.ResumeRequest) (resp []types.Award, err error) {
	awards, err := l.svcCtx.DB.Award.Query().
		WithUser().
		Order(ent.Asc(award.FieldSortOrder)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	var result []types.Award
	for _, awardEntity := range awards {
		var awardDate string
		if !awardEntity.AwardDate.IsZero() {
			awardDate = awardEntity.AwardDate.Format("2006-01-02")
		}

		// Get user ID from edge relationship
		var userID string
		if awardEntity.Edges.User != nil {
			userID = awardEntity.Edges.User.ID.String()
		}

		result = append(result, types.Award{
			ID:           awardEntity.ID.String(),
			UserID:       userID,
			Title:        awardEntity.Title,
			Organization: awardEntity.AwardingOrganization,
			Description:  awardEntity.Description,
			AwardDate:    awardDate,
			Category:     awardEntity.AwardType,
			SortOrder:    awardEntity.SortOrder,
			CreatedAt:    awardEntity.CreatedAt.Format("2006-01-02 15:04:05"),
			UpdatedAt:    awardEntity.UpdatedAt.Format("2006-01-02 15:04:05"),
		})
	}

	return result, nil
}
