package resume

import (
	"context"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/researchproject"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetResearchProjectsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get research projects list
func NewGetResearchProjectsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetResearchProjectsLogic {
	return &GetResearchProjectsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetResearchProjectsLogic) GetResearchProjects(req *types.ResumeRequest) (resp []types.ResearchProject, err error) {
	researchProjects, err := l.svcCtx.DB.ResearchProject.Query().
		WithUser().
		WithDetails().
		Order(ent.Asc(researchproject.FieldSortOrder)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	var result []types.ResearchProject
	for _, rp := range researchProjects {
		var startDate, endDate string
		if !rp.StartDate.IsZero() {
			startDate = rp.StartDate.Format("2006-01-02")
		}
		if !rp.EndDate.IsZero() {
			endDate = rp.EndDate.Format("2006-01-02")
		}

		// Get user ID from edge relationship
		var userID string
		if rp.Edges.User != nil {
			userID = rp.Edges.User.ID.String()
		}

		// Get details from edge relationship
		var details []string
		if rp.Edges.Details != nil {
			for _, detail := range rp.Edges.Details {
				details = append(details, detail.DetailText)
			}
		}

		result = append(result, types.ResearchProject{
			ID:          rp.ID.String(),
			UserID:      userID,
			Title:       rp.Title,
			Institution: "", // Institution field not in schema
			Location:    rp.Location,
			StartDate:   startDate,
			EndDate:     endDate,
			Details:     details,
			SortOrder:   rp.SortOrder,
			CreatedAt:   rp.CreatedAt.Format("2006-01-02 15:04:05"),
			UpdatedAt:   rp.UpdatedAt.Format("2006-01-02 15:04:05"),
		})
	}

	return result, nil
}
