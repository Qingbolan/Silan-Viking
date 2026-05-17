package projects

import (
	"context"

	"silan-backend/internal/ent/project"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetProjectCategoriesLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get project categories
func NewGetProjectCategoriesLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetProjectCategoriesLogic {
	return &GetProjectCategoriesLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetProjectCategoriesLogic) GetProjectCategories(req *types.ResumeRequest) (resp []string, err error) {
	// Get distinct project types from projects
	projects, err := l.svcCtx.DB.Project.Query().
		Where(project.IsPublic(true)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	// Extract unique categories
	categoryMap := make(map[string]bool)
	for _, proj := range projects {
		if proj.ProjectType != "" {
			categoryMap[proj.ProjectType] = true
		}
	}

	var categories []string
	for category := range categoryMap {
		categories = append(categories, category)
	}

	return categories, nil
}
