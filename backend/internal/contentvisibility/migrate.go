// Package contentvisibility owns the one-time migration from content status
// plus visibility to visibility alone. Runtime interaction tables are untouched.
package contentvisibility

import (
	"context"
	"database/sql"
	"fmt"
)

func Migrate(ctx context.Context, driver, source string) error {
	db, err := sql.Open(driver, source)
	if err != nil {
		return err
	}
	defer db.Close()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	tables := []string{"blog_posts", "projects", "ideas", "moments", "episodes", "episode_series", "blog_series"}
	columns := map[string]map[string]bool{}
	for _, table := range tables {
		query := "SELECT name FROM pragma_table_info(?)"
		if driver == "postgres" {
			query = "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1"
		}
		if driver == "mysql" {
			query = "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?"
		}
		rows, err := tx.QueryContext(ctx, query, table)
		if err != nil {
			return fmt.Errorf("inspect content schema: %w", err)
		}
		found := map[string]bool{}
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				rows.Close()
				return err
			}
			found[name] = true
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		columns[table] = found
	}
	// A formerly archived series must not expose its children on upgrade.
	for _, pair := range [][2]string{{"episode_series", "episodes"}, {"blog_series", "blog_posts"}} {
		if columns[pair[0]]["status"] && columns[pair[1]]["series_id"] && columns[pair[1]]["visibility"] {
			query := fmt.Sprintf("UPDATE %s SET visibility = 'private' WHERE series_id IN (SELECT id FROM %s WHERE status = 'archived')", pair[1], pair[0])
			if _, err := tx.ExecContext(ctx, query); err != nil {
				return err
			}
		}
	}
	for _, table := range tables {
		c := columns[table]
		if c["visibility"] {
			predicate := "visibility NOT IN ('public', 'private')"
			if c["status"] {
				predicate += " OR status IN ('archived', 'draft')"
			}
			if _, err := tx.ExecContext(ctx, fmt.Sprintf("UPDATE %s SET visibility = 'private' WHERE %s", table, predicate)); err != nil {
				return err
			}
		}
		if c["status"] {
			if _, err := tx.ExecContext(ctx, fmt.Sprintf("ALTER TABLE %s DROP COLUMN status", table)); err != nil {
				return fmt.Errorf("remove obsolete %s.status: %w", table, err)
			}
		}
	}
	return tx.Commit()
}
