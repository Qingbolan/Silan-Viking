package plans

import (
	"context"
	"fmt"
	"sort"
	"time"

	"silan-backend/internal/ent/project"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetAnnualPlansLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get annual plans list
func NewGetAnnualPlansLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetAnnualPlansLogic {
	return &GetAnnualPlansLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetAnnualPlansLogic) GetAnnualPlans(req *types.AnnualPlanListRequest) (resp []types.AnnualPlan, err error) {
	// Since there's no dedicated annual plan schema, we'll derive plans from project data
	// Group projects by year and create annual plans
	
	projects, err := l.svcCtx.DB.Project.Query().
		Where(project.IsPublic(true)).
		WithTechnologies().
		All(l.ctx)
	if err != nil {
		l.Logger.Errorf("Failed to fetch projects: %v", err)
		return nil, err
	}

	// Group projects by year
	yearGroups := make(map[int][]string)
	yearProjects := make(map[int][]types.PlanProject)
	
	for _, proj := range projects {
		year := proj.CreatedAt.Year()
		if !proj.StartDate.IsZero() {
			year = proj.StartDate.Year()
		}
		
		yearGroups[year] = append(yearGroups[year], proj.Title)
		yearProjects[year] = append(yearProjects[year], types.PlanProject{
			ID:          proj.ID.String(),
			Name:        proj.Title,
			Description: proj.Description,
		})
	}

	// Create annual plans from grouped data
	var annualPlans []types.AnnualPlan
	for year, projectTitles := range yearGroups {
		planName := fmt.Sprintf("Annual Plan %d", year)
		description := fmt.Sprintf("Development plan for %d including %d projects", year, len(projectTitles))
		
		plan := types.AnnualPlan{
			ID:           fmt.Sprintf("plan_%d", year),
			Year:         year,
			Name:         planName,
			Description:  description,
			ProjectCount: len(projectTitles),
			Objectives:   []string{fmt.Sprintf("Complete %d projects", len(projectTitles))},
			Projects:     yearProjects[year],
			CreatedAt:    time.Now().Format("2006-01-02T15:04:05Z"),
			UpdatedAt:    time.Now().Format("2006-01-02T15:04:05Z"),
		}
		annualPlans = append(annualPlans, plan)
	}

	// Sort by year descending
	sort.Slice(annualPlans, func(i, j int) bool {
		return annualPlans[i].Year > annualPlans[j].Year
	})

	return annualPlans, nil
}
