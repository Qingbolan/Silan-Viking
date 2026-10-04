package projects

import (
	"entgo.io/ent/dialect/sql"
	"fmt"
	"silan-backend/internal/ent/predicate"
	"silan-backend/internal/ent/project"
	"time"
)

// projectInYear mirrors projectYear without loading projects into application
// memory. Validate the prefix before matching: SQL integer casts silently accept
// malformed dates, whereas strconv.Atoi rejects them.
func projectInYear(year int) predicate.Project {
	return func(s *sql.Selector) {
		characterIn := func(position int, values string) *sql.Predicate {
			return sql.P(func(b *sql.Builder) {
				b.WriteString("SUBSTR(COALESCE(").Ident(s.C(project.FieldStartDate)).WriteString(", ''), ").WriteString(fmt.Sprint(position)).WriteString(", 1) IN (")
				for i, value := range values {
					if i > 0 {
						b.WriteString(", ")
					}
					b.Arg(string(value))
				}
				b.WriteString(")")
			})
		}
		valid := sql.And(sql.Or(characterIn(1, "0123456789"), characterIn(1, "+-")), characterIn(2, "0123456789"), characterIn(3, "0123456789"), characterIn(4, "0123456789"))
		prefixes := []string{}
		if year >= 0 && year <= 9999 {
			prefixes = append(prefixes, fmt.Sprintf("%04d", year))
		}
		if year >= 0 && year <= 999 {
			prefixes = append(prefixes, fmt.Sprintf("+%03d", year))
		}
		matches := sql.False()
		if len(prefixes) > 0 {
			matches = sql.P(func(b *sql.Builder) {
				b.WriteString("SUBSTR(").Ident(s.C(project.FieldStartDate)).WriteString(", 1, 4) IN (")
				for i, prefix := range prefixes {
					if i > 0 {
						b.WriteString(", ")
					}
					b.Arg(prefix)
				}
				b.WriteString(")")
			})
		}
		start := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
		s.Where(sql.Or(matches, sql.And(sql.Not(valid), sql.GTE(s.C(project.FieldCreatedAt), start), sql.LT(s.C(project.FieldCreatedAt), start.AddDate(1, 0, 0)))))
	}
}
