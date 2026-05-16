package projects

import (
	"context"
	"fmt"
	"math"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetProjectsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get projects list with pagination and filtering
func NewGetProjectsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetProjectsLogic {
	return &GetProjectsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetProjectsLogic) GetProjects(req *types.ProjectListRequest) (resp *types.ProjectListResponse, err error) {
	query := l.svcCtx.DB.Project.Query().
		Where(project.IsPublic(true)).
		WithUser().
		WithTechnologies()

	// Apply filters
	if req.Type != "" {
		query = query.Where(project.ProjectType(req.Type))
	}

	if req.Featured {
		query = query.Where(project.IsFeatured(true))
	}

	if req.Status != "" {
		query = query.Where(project.StatusEQ(project.Status(req.Status)))
	}

	if req.Search != "" {
		query = query.Where(project.Or(
			project.TitleContains(req.Search),
			project.DescriptionContains(req.Search),
		))
	}

	if req.Year > 0 {
		// This would need to be implemented based on project year field
		// For now, we'll skip this filter
	}

	// Get total count
	total, err := query.Count(l.ctx)
	if err != nil {
		return nil, err
	}

	// Apply pagination
	offset := (req.Page - 1) * req.Size
	projects, err := query.
		Order(ent.Desc(project.FieldSortOrder), ent.Desc(project.FieldCreatedAt)).
		Limit(req.Size).
		Offset(offset).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	result := make([]types.Project, 0)
	for _, proj := range projects {
		var technologies []string
		for _, tech := range proj.Edges.Technologies {
			technologies = append(technologies, tech.TechnologyName)
		}

		// Get the year from start date or created date
		year := proj.CreatedAt.Year()
		if !proj.StartDate.IsZero() {
			year = proj.StartDate.Year()
		}

		// Generate annual plan name based on year
		annualPlan := fmt.Sprintf("Annual Plan %d", year)

		// Handle description field (now non-nullable)
		description := proj.Description

		result = append(result, types.Project{
			ID:          proj.ID.String(),
			Name:        proj.Title,
			Description: description,
			Tags:        technologies,
			Year:        year,
			AnnualPlan:  annualPlan,
		})
	}

	totalPages := int(math.Ceil(float64(total) / float64(req.Size)))

	return &types.ProjectListResponse{
		Projects:   result,
		Total:      int64(total),
		Page:       req.Page,
		Size:       req.Size,
		TotalPages: totalPages,
	}, nil
}
