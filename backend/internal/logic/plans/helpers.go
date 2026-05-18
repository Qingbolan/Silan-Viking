package plans

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"silan-backend/internal/contenttag"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/types"
)

var planYearPattern = regexp.MustCompile(`\d{4}`)

func fetchPublicProjects(ctx context.Context, client *ent.Client) ([]*ent.Project, error) {
	// `WithTranslations` is eager-loaded because the content engine leaves
	// the main `projects` row's title/description empty — they live in
	// `project_translations`. `projectTitleDesc` resolves them below.
	return client.Project.Query().
		Where(project.VisibilityEQ(project.VisibilityPublic)).
		WithTechnologies().
		WithTranslations().
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

// resolveLang normalises an empty language to the default ("en").
func resolveLang(lang string) string {
	if lang == "" {
		return "en"
	}
	return lang
}

// pickProjectTranslation selects the best project translation for a language:
// the requested language, then "en", then the first available. Nil when the
// project has no translations.
func pickProjectTranslation(trs []*ent.ProjectTranslation, lang string) *ent.ProjectTranslation {
	by := func(code string) *ent.ProjectTranslation {
		for _, t := range trs {
			if t.LanguageCode == code {
				return t
			}
		}
		return nil
	}
	if t := by(resolveLang(lang)); t != nil {
		return t
	}
	if t := by("en"); t != nil {
		return t
	}
	if len(trs) > 0 {
		return trs[0]
	}
	return nil
}

// projectTitleDesc resolves a project's display title and description,
// preferring the language-variant translation over the (engine-empty) main
// row.
func projectTitleDesc(proj *ent.Project, lang string) (string, string) {
	title, description := proj.Title, proj.Description
	if tr := pickProjectTranslation(proj.Edges.Translations, lang); tr != nil {
		if tr.Title != "" {
			title = tr.Title
		}
		if tr.Description != "" {
			description = tr.Description
		}
	}
	return title, description
}

func mapPlanProject(proj *ent.Project, lang string) types.PlanProject {
	title, description := projectTitleDesc(proj, lang)
	return types.PlanProject{
		ID:          proj.ID,
		Name:        title,
		Description: description,
	}
}

// mapProject builds the API `Project` shape. `Name`/`Description` come from
// the language-variant translation (the main row is engine-empty), and `Tags`
// from the cross-type `content_tag` table — the legacy `project_technologies`
// edge is no longer populated by `index sync`. A nil `rawDB` yields empty
// tags rather than failing.
func mapProject(ctx context.Context, rawDB *sql.DB, proj *ent.Project, lang string) types.Project {
	title, description := projectTitleDesc(proj, lang)
	tags, err := contenttag.Lookup(ctx, rawDB, "project", proj.ID)
	if err != nil {
		tags = []string{}
	}
	year := projectYear(proj)
	return types.Project{
		ID:          proj.ID,
		Name:        title,
		Description: description,
		Tags:        tags,
		Year:        year,
		AnnualPlan:  annualPlanName(year),
	}
}

func buildAnnualPlans(projects []*ent.Project, lang string) []types.AnnualPlan {
	now := time.Now().UTC().Format(time.RFC3339)
	yearProjects := make(map[int][]types.PlanProject)

	for _, proj := range projects {
		year := projectYear(proj)
		yearProjects[year] = append(yearProjects[year], mapPlanProject(proj, lang))
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
