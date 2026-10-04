package projects

import (
	"database/sql"
	"errors"
	"silan-backend/internal/types"
	"testing"
)

func TestSectionProjection(t *testing.T) {
	fixture := func() []types.ContentPart {
		return []types.ContentPart{{Role: "overview", Body: map[string]string{"en": "Overview"}}, {Role: "goals", Body: map[string]string{"en": "Goals"}}, {Role: "empty"}}
	}
	for _, section := range []string{"default", "goals", "feedback"} {
		parts, err := selectProjectSection(fixture(), section)
		if err != nil {
			t.Fatal(err)
		}
		if len(parts) != 3 || !*parts[0].HasContent || *parts[2].HasContent {
			t.Fatal("navigation manifest lost")
		}
		for _, part := range parts {
			want := section == part.Role || (section == "default" && part.Role == "overview")
			if (len(part.Body) > 0) != want {
				t.Fatalf("%s: unexpected body for %s", section, part.Role)
			}
		}
	}
	for _, section := range []string{"missing", "empty"} {
		if _, err := selectProjectSection(fixture(), section); !errors.Is(err, sql.ErrNoRows) {
			t.Fatal("expected not found", err)
		}
	}
	if _, err := selectProjectSection(nil, "default"); err != nil {
		t.Fatal(err)
	}
}
