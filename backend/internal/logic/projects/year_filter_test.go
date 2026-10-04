package projects

import (
	"context"
	"entgo.io/ent/dialect"
	"fmt"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
	"testing"
	"time"
)

func TestProjectYearFilterMatchesMappingAndPaginates(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:"+t.Name()+"?mode=memory&cache=shared&_fk=1")
	dates := []string{"2026-01-01", "2025-12-31", "", "oops", "202x", "26", "+026", "-026", "0000", "2026suffix", "２０２６", " 026"}
	expected := map[int][]string{}
	for i, date := range dates {
		id := fmt.Sprintf("p-%02d", i)
		p := client.Project.Create().SetID(id).SetSlug(id).SetStartDate(date).SetCreatedAt(time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)).SetVisibility("public").SaveX(ctx)
		expected[projectYear(p)] = append(expected[projectYear(p)], id)
	}
	logic := NewGetProjectsLogic(ctx, &svc.ServiceContext{DB: client})
	for _, year := range []int{26, 2024, 2025, 2026, 2030} {
		want := expected[year]
		for page := 1; page <= len(want)+1; page++ {
			got, err := logic.GetProjects(&types.ProjectListRequest{Year: year, Page: page, Size: 1})
			if err != nil {
				t.Fatal(err)
			}
			if got.Total != int64(len(want)) {
				t.Fatalf("year %d: total %d want %d", year, got.Total, len(want))
			}
			if page <= len(want) {
				if len(got.Projects) != 1 || got.Projects[0].ID != want[page-1] {
					t.Fatalf("year %d page %d: %+v", year, page, got.Projects)
				}
			} else if len(got.Projects) != 0 {
				t.Fatalf("non-empty final page: %+v", got)
			}
		}
	}
}
