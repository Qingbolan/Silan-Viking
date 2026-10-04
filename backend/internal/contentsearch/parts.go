// Package contentsearch contains the storage-aware primitives shared by the
// public search endpoints. Author-written prose does not live on the entity
// rows: silan-viking stores it in item_part_translation. Keeping that detail
// here prevents each content type from silently implementing a different,
// incomplete definition of "search".
package contentsearch

import (
	"strings"

	"entgo.io/ent/dialect/sql"
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

// MatchesParts keeps body matching inside the database instead of materializing
// every matching entity ID in Go. The subquery has fixed parameter cardinality,
// independent of how many parts match, and composes with visibility/pagination.
func MatchesParts(entityType itempart.EntityType, query, language string) func(*sql.Selector) {
	query = strings.TrimSpace(query)
	return func(outer *sql.Selector) {
		if query == "" {
			outer.Where(sql.False())
			return
		}
		table := sql.Table(itempart.Table)
		matched := sql.Dialect(outer.Dialect()).Select(table.C(itempart.FieldEntityID)).From(table)
		itempart.EntityTypeEQ(entityType)(matched)
		itempart.HasTranslationsWith(
			itemparttranslation.LanguageCodeIn(Languages(language)...),
			itemparttranslation.BodyContainsFold(query),
		)(matched)
		outer.Where(sql.In(outer.C("id"), matched))
	}
}
