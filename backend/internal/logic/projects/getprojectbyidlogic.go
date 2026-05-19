package projects

import (
	"context"
	"fmt"
	"strconv"

	"silan-backend/internal/ent/project"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

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
	projectID := req.ID

	// Get the project by id
	proj, err := l.svcCtx.DB.Project.Query().
		Where(project.ID(projectID)).
		Where(project.VisibilityEQ(project.VisibilityPublic)).
		WithTechnologies().
		WithTranslations().
		First(l.ctx)
	if err != nil {
		return nil, fmt.Errorf("project with ID %s not found", req.ID)
	}

	var technologies []string
	for _, tech := range proj.Edges.Technologies {
		technologies = append(technologies, tech.TechnologyName)
	}

	// Get the year from the start date (a plain `YYYY-MM-DD` string) or,
	// failing that, the created-at timestamp.
	year := proj.CreatedAt.Year()
	if len(proj.StartDate) >= 4 {
		if y, err := strconv.Atoi(proj.StartDate[:4]); err == nil {
			year = y
		}
	}

	// Generate annual plan name based on year
	annualPlan := fmt.Sprintf("Annual Plan %d", year)

	// title/description live in project_translations — the content engine
	// leaves the main projects row's title/description empty.
	name := proj.Title
	description := proj.Description
	if tr := pickProjectTranslation(proj.Edges.Translations, req.Language); tr != nil {
		if tr.Title != "" {
			name = tr.Title
		}
		if tr.Description != "" {
			description = tr.Description
		}
	}

	return &types.Project{
		ID:          proj.ID,
		Name:        name,
		Description: description,
		Tags:        technologies,
		Year:        year,
		AnnualPlan:  annualPlan,
	}, nil
}
