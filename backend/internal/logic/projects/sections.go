package projects

import (
	"database/sql"
	"silan-backend/internal/types"
	"strings"
)

// Section projection retains the navigation manifest but only one document body.
// An omitted section on the public detail API retains its established full response.
func selectProjectSection(parts []types.ContentPart, section string) ([]types.ContentPart, error) {
	selected := section
	if selected == "default" {
		selected = "feedback"
	}
	for i := range parts {
		has := len(parts[i].Entries) > 0
		for _, body := range parts[i].Body {
			has = has || strings.TrimSpace(body) != ""
		}
		parts[i].HasContent = &has
		if section == "default" && selected == "feedback" && has {
			selected = parts[i].Role
		}
	}
	found := selected == "feedback"
	for i := range parts {
		if parts[i].Role == selected && *parts[i].HasContent {
			found = true
		} else {
			parts[i].Body = nil
			parts[i].Entries = nil
		}
	}
	if !found {
		return nil, sql.ErrNoRows
	}
	return parts, nil
}
