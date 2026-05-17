package resume

import (
	"context"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/education"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetEducationLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get education list
func NewGetEducationLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetEducationLogic {
	return &GetEducationLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetEducationLogic) GetEducation(req *types.ResumeRequest) (resp []types.Education, err error) {
	educations, err := l.svcCtx.DB.Education.Query().
		WithUser().
		WithDetails().
		Order(ent.Asc(education.FieldSortOrder)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	var result []types.Education
	for _, edu := range educations {
		var startDate, endDate string
		if !edu.StartDate.IsZero() {
			startDate = edu.StartDate.Format("2006-01-02")
		}
		if !edu.EndDate.IsZero() {
			endDate = edu.EndDate.Format("2006-01-02")
		}

		// Get user ID from edge relationship
		var userID string
		if edu.Edges.User != nil {
			userID = edu.Edges.User.ID.String()
		}

		// Get details from edge relationship
		var details []string
		if edu.Edges.Details != nil {
			for _, detail := range edu.Edges.Details {
				details = append(details, detail.DetailText)
			}
		}

		result = append(result, types.Education{
			ID:                 edu.ID.String(),
			UserID:             userID,
			Institution:        edu.Institution,
			Degree:             edu.Degree,
			FieldOfStudy:       edu.FieldOfStudy,
			StartDate:          startDate,
			EndDate:            endDate,
			IsCurrent:          edu.IsCurrent,
			GPA:                edu.Gpa, // Note: GPA -> Gpa
			Location:           edu.Location,
			InstitutionWebsite: edu.InstitutionWebsite,
			InstitutionLogoURL: edu.InstitutionLogoURL,
			Details:            details,
			SortOrder:          edu.SortOrder,
			CreatedAt:          edu.CreatedAt.Format("2006-01-02 15:04:05"),
			UpdatedAt:          edu.UpdatedAt.Format("2006-01-02 15:04:05"),
		})
	}

	return result, nil
}
