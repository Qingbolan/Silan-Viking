package plans

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/types"
)

var planYearPattern = regexp.MustCompile(`\d{4}`)

func fetchPublicProjects(ctx context.Context, client *ent.Client) ([]*ent.Project, error) {
	return client.Project.Query().
		Where(project.VisibilityEQ(project.VisibilityPublic)).
		WithTechnologies().
		Order(ent.Desc(project.FieldSortOrder), ent.Desc(project.FieldCreatedAt)).
		All(ctx)
}

func projectYear(proj *ent.Project) int {
	if !proj.StartDate.IsZero() {
		return proj.StartDate.Year()
	}
	return proj.CreatedAt.Year()
}

func annualPlanName(year int) string {
	return fmt.Sprintf("Annual Plan %d", year)
}

func annualPlanID(year int) string {
	return fmt.Sprintf("plan_%d", year)
}

func parsePlanYear(name string) (int, bool) {
	match := planYearPattern.FindString(strings.TrimSpace(name))
	if match == "" {
		return 0, false
	}
	year, err := strconv.Atoi(match)
	if err != nil {
		return 0, false
	}
	return year, true
}

func mapPlanProject(proj *ent.Project) types.PlanProject {
	return types.PlanProject{
		ID:          proj.ID,
		Name:        proj.Title,
		Description: proj.Description,
	}
}

func mapProject(proj *ent.Project) types.Project {
	technologies := make([]string, 0, len(proj.Edges.Technologies))
	for _, tech := range proj.Edges.Technologies {
		technologies = append(technologies, tech.TechnologyName)
	}
	sort.Strings(technologies)

	year := projectYear(proj)
	return types.Project{
		ID:          proj.ID,
		Name:        proj.Title,
		Description: proj.Description,
		Tags:        technologies,
		Year:        year,
		AnnualPlan:  annualPlanName(year),
	}
}

func buildAnnualPlans(projects []*ent.Project) []types.AnnualPlan {
	now := time.Now().UTC().Format(time.RFC3339)
	yearProjects := make(map[int][]types.PlanProject)

	for _, proj := range projects {
		year := projectYear(proj)
		yearProjects[year] = append(yearProjects[year], mapPlanProject(proj))
	}

	years := make([]int, 0, len(yearProjects))
	for year := range yearProjects {
		years = append(years, year)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(years)))

	annualPlans := make([]types.AnnualPlan, 0, len(years))
	for _, year := range years {
		projects := yearProjects[year]
		sort.Slice(projects, func(i, j int) bool {
			return projects[i].Name < projects[j].Name
		})

		annualPlans = append(annualPlans, types.AnnualPlan{
			ID:           annualPlanID(year),
			Year:         year,
			Name:         annualPlanName(year),
			Description:  fmt.Sprintf("Development plan for %d including %d projects", year, len(projects)),
			ProjectCount: len(projects),
			Objectives:   []string{fmt.Sprintf("Complete %d projects", len(projects))},
			Projects:     projects,
			CreatedAt:    now,
			UpdatedAt:    now,
		})
	}

	return annualPlans
}
