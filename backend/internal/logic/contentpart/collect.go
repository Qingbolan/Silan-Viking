// Package contentpart assembles the type-agnostic Part list a detail
// endpoint returns. Every content type stores its Parts in the same four
// tables — item_part, item_part_translation, part_entry,
// part_entry_translation — so one collector serves project, idea, episode
// and update details alike.
//
// The Part list is data-driven: it is whatever Parts the Item actually has,
// in sort_order. The SCHEMA `parts` set is a recommendation, not a closed
// whitelist, so an Item may carry a Part whose role no type predeclares;
// this collector surfaces it unchanged and lets the frontend render a tab
// for it. Nothing here filters on a fixed role list.
package contentpart

import (
	"context"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/ent/partentry"
	"silan-backend/internal/types"
)

// Collect returns every Part of the Item identified by (entityType,
// entityID), ordered by sort_order. A prose Part carries its body keyed by
// language code; an entry_list Part carries its entries. `language` selects
// the preferred entry-translation variant, falling back to the Part's
// canonical language and then any available one.
func Collect(
	ctx context.Context,
	db *ent.Client,
	entityType itempart.EntityType,
	entityID string,
	language string,
) ([]types.ContentPart, error) {
	parts, err := db.ItemPart.Query().
		Where(
			itempart.EntityTypeEQ(entityType),
			itempart.EntityIDEQ(entityID),
		).
		WithTranslations().
		WithEntries(func(q *ent.PartEntryQuery) {
			q.WithTranslations().Order(ent.Asc(partentry.FieldSortOrder))
		}).
		Order(ent.Asc(itempart.FieldSortOrder)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]types.ContentPart, 0, len(parts))
	for _, part := range parts {
		body := make(map[string]string, len(part.Edges.Translations))
		for _, tr := range part.Edges.Translations {
			body[tr.LanguageCode] = tr.Body
		}

		entries := make([]types.ContentEntry, 0, len(part.Edges.Entries))
		for _, entry := range part.Edges.Entries {
			entries = append(entries, types.ContentEntry{
				ID:               entry.ID,
				EntryID:          entry.EntryID,
				SortOrder:        entry.SortOrder,
				SharedPayload:    entry.SharedPayload,
				LocalizedPayload: localizedPayload(entry.Edges.Translations, language, part.CanonicalLang),
			})
		}

		// An Item that carries entries is an entry_list Part; otherwise it
		// is prose. Shape is derived, not stored on item_part.
		shape := "prose"
		if len(entries) > 0 {
			shape = "entry_list"
		}

		result = append(result, types.ContentPart{
			ID:            part.ID,
			PartID:        part.PartID,
			Role:          part.Role,
			Shape:         shape,
			SortOrder:     part.SortOrder,
			CanonicalLang: part.CanonicalLang,
			Body:          body,
			Entries:       entries,
		})
	}

	return result, nil
}

// localizedPayload picks an entry's translation: the requested language
// first, then the Part's canonical language, then any available one.
func localizedPayload(
	translations []*ent.PartEntryTranslation,
	language string,
	canonicalLang string,
) map[string]interface{} {
	if p := findPayload(translations, language); p != nil {
		return p
	}
	if p := findPayload(translations, canonicalLang); p != nil {
		return p
	}
	if len(translations) > 0 {
		return translations[0].LocalizedPayload
	}
	return map[string]interface{}{}
}

func findPayload(translations []*ent.PartEntryTranslation, language string) map[string]interface{} {
	for _, tr := range translations {
		if tr.LanguageCode == language {
			return tr.LocalizedPayload
		}
	}
	return nil
}
