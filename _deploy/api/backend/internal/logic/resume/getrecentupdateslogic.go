package resume

import (
	"context"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"entgo.io/ent/dialect/sql"
	"github.com/zeromicro/go-zero/core/logx"
)

type GetRecentUpdatesLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get recent updates
func NewGetRecentUpdatesLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetRecentUpdatesLogic {
	return &GetRecentUpdatesLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetRecentUpdatesLogic) GetRecentUpdates(req *types.ResumeRequest) (resp []types.RecentUpdate, err error) {
	// Query recent updates from database
	recentUpdates, err := l.svcCtx.DB.RecentUpdate.
		Query().
		Where(
			// Filter by user if needed (for now get all)
		).
		Order(func(s *sql.Selector) {
			s.OrderBy(sql.Desc("date"))
		}).
		Limit(10). // Limit to latest 10 updates
		All(l.ctx)
	
	if err != nil {
		l.Logger.Errorf("Failed to query recent updates: %v", err)
		return nil, err
	}
	
	// Convert to response format
	resp = make([]types.RecentUpdate, len(recentUpdates))
	for i, update := range recentUpdates {
		resp[i] = types.RecentUpdate{
			ID:          update.ID.String(),
			UserID:      update.UserID.String(),
			Type:        update.Type.String(),
			Title:       update.Title,
			Description: update.Description,
			Date:        update.Date.Format("2006-01-02"),
			Tags:        update.Tags,
			Status:      update.Status.String(),
			Priority:    update.Priority.String(),
			CreatedAt:   update.CreatedAt.Format("2006-01-02T15:04:05Z"),
			UpdatedAt:   update.UpdatedAt.Format("2006-01-02T15:04:05Z"),
		}
	}
	
	return resp, nil
}
