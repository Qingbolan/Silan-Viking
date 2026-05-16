package resume

import (
	"context"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/workexperience"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetWorkExperienceLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get work experience list
func NewGetWorkExperienceLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetWorkExperienceLogic {
	return &GetWorkExperienceLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetWorkExperienceLogic) GetWorkExperience(req *types.ResumeRequest) (resp []types.WorkExperience, err error) {
	workExperiences, err := l.svcCtx.DB.WorkExperience.Query().
		WithUser().
		WithDetails().
		Order(ent.Asc(workexperience.FieldSortOrder)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	var result []types.WorkExperience
	for _, we := range workExperiences {
		var startDate, endDate string
		if !we.StartDate.IsZero() {
			startDate = we.StartDate.Format("2006-01-02")
		}
		if !we.EndDate.IsZero() {
			endDate = we.EndDate.Format("2006-01-02")
		}

		// Get user ID from edge relationship
		var userID string
		if we.Edges.User != nil {
			userID = we.Edges.User.ID.String()
		}

		// Get details from edge relationship
		var details []string
		if we.Edges.Details != nil {
			for _, detail := range we.Edges.Details {
				details = append(details, detail.DetailText)
			}
		}

		result = append(result, types.WorkExperience{
			ID:             we.ID.String(),
			UserID:         userID,
			Company:        we.Company,
			Position:       we.Position,
			StartDate:      startDate,
			EndDate:        endDate,
			IsCurrent:      we.IsCurrent,
			Location:       we.Location,
			CompanyWebsite: we.CompanyWebsite,
			CompanyLogoURL: we.CompanyLogoURL,
			Details:        details,
			SortOrder:      we.SortOrder,
			CreatedAt:      we.CreatedAt.Format("2006-01-02 15:04:05"),
			UpdatedAt:      we.UpdatedAt.Format("2006-01-02 15:04:05"),
		})
	}

	return result, nil
}
