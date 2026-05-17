package projects

import (
	"context"
	"fmt"

	"silan-backend/internal/ent/project"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/google/uuid"
	"github.com/zeromicro/go-zero/core/logx"
)

type GetProjectByIdLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get single project by ID (numeric)
func NewGetProjectByIdLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetProjectByIdLogic {
	return &GetProjectByIdLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetProjectByIdLogic) GetProjectById(req *types.ProjectByIdRequest) (resp *types.Project, err error) {
	// Parse the UUID from the request ID
	projectID, err := uuid.Parse(req.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid project ID format: %v", err)
	}

	// Get the project by UUID
	proj, err := l.svcCtx.DB.Project.Query().
		Where(project.ID(projectID)).
		Where(project.IsPublic(true)).
		WithTechnologies().
		First(l.ctx)
	if err != nil {
		return nil, fmt.Errorf("project with ID %s not found", req.ID)
	}

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

	return &types.Project{
		ID:          proj.ID.String(),
		Name:        proj.Title,
		Description: description,
		Tags:        technologies,
		Year:        year,
		AnnualPlan:  annualPlan,
	}, nil
}
