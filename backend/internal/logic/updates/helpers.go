package updates

import (
	"silan-backend/internal/ent"
	"silan-backend/internal/types"
)

func updateToData(update *ent.RecentUpdate, language string) types.RecentUpdate {
	title := update.Title
	description := update.Description
	for _, translation := range update.Edges.Translations {
		if translation.LanguageCode == language {
			title = translation.Title
			description = translation.Description
			break
		}
	}

	return types.RecentUpdate{
		ID:          update.ID.String(),
		UserID:      update.UserID.String(),
		Slug:        update.Slug,
		Type:        string(update.SubjectKind),
		UpdateType:  string(update.UpdateType),
		Visibility:  string(update.Visibility),
		Title:       title,
		Description: description,
		Date:        update.Date.Format("2006-01-02"),
		Tags:        update.Tags,
		Status:      string(update.Status),
		Priority:    string(update.Priority),
		CreatedAt:   update.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   update.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}
