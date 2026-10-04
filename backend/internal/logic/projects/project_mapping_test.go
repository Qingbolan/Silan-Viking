package projects

import (
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/project"
	"testing"
)

func TestBasicProjectMappingUsesLoadedCoverAndTags(t *testing.T) {
	input := &ent.Project{ID: "project", StartDate: "2026-01-01", CoverSourceType: project.CoverSourceTypeWebsite, CoverWebsiteURL: " https://example.org/project ", Title: "Project"}
	got := mapBasicProject(input, "en", []string{"Research"})
	if got.CoverSourceType != "website" || got.CoverWebsiteURL != "https://example.org/project" || got.Year != 2026 || len(got.Tags) != 1 || got.Tags[0] != "Research" {
		t.Fatalf("loaded projection not preserved: %+v", got)
	}
}
