// Package contentsearch contains the storage-aware primitives shared by the
// public search endpoints. Author-written prose does not live on the entity
// rows: silan-viking stores it in item_part_translation. Keeping that detail
// here prevents each content type from silently implementing a different,
// incomplete definition of "search".
package contentsearch

import (
	"context"
	"strings"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/ent/itemparttranslation"
)

// Languages returns the requested locale and the English fallback, without
// duplicates. Search follows the same language fallback contract as reads.
func Languages(language string) []string {
	language = strings.TrimSpace(strings.ToLower(language))
	if language == "" || language == "en" {
		return []string{"en"}
	}
	return []string{language, "en"}
}

// EntityIDsMatchingParts returns entity ids whose authored Part body contains
// query in the requested language or the English fallback. The slice is
// always non-nil, which lets callers safely compose it into IDIn predicates.
func EntityIDsMatchingParts(
	ctx context.Context,
	client *ent.Client,
	entityType itempart.EntityType,
	query string,
	language string,
) ([]string, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []string{}, nil
	}

	parts, err := client.ItemPart.Query().
		Where(
			itempart.EntityTypeEQ(entityType),
			itempart.HasTranslationsWith(
				itemparttranslation.LanguageCodeIn(Languages(language)...),
				itemparttranslation.BodyContainsFold(query),
			),
		).
		Select(itempart.FieldEntityID).
		All(ctx)
	if err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(parts))
	ids := make([]string, 0, len(parts))
	for _, part := range parts {
		if _, exists := seen[part.EntityID]; exists {
			continue
		}
		seen[part.EntityID] = struct{}{}
		ids = append(ids, part.EntityID)
	}
	return ids, nil
}
