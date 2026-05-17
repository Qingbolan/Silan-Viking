// Command migrate brings an existing database up to the current Ent schema.
//
// It runs Ent's schema migration in additive-only mode: missing tables and
// columns are created, but nothing is dropped — existing data is preserved.
//
// Usage:
//
//	go run ./cmd/migrate -db-driver sqlite3 -db-source "/path/to/portfolio.db?_fk=1"
package main

import (
	"context"
	"flag"
	"log"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/language"

	_ "github.com/mattn/go-sqlite3"
)

func main() {
	dbDriver := flag.String("db-driver", "sqlite3", "database driver")
	dbSource := flag.String("db-source", "", "database connection string")
	flag.Parse()

	if *dbSource == "" {
		log.Fatal("migrate: -db-source is required")
	}

	client, err := ent.Open(*dbDriver, *dbSource)
	if err != nil {
		log.Fatalf("migrate: failed to open database: %v", err)
	}
	defer client.Close()

	ctx := context.Background()

	// Additive-only migration: create missing tables/columns, drop nothing.
	// WithDropColumn / WithDropIndex are left at their default (false), so
	// the existing data and legacy columns are kept intact.
	if err := client.Schema.Create(ctx); err != nil {
		log.Fatalf("migrate: schema create failed: %v", err)
	}

	// Seed the `languages` reference table. It is static lookup data — not
	// derived from content — and the translation tables have a FK onto it
	// (`*_translations.language_code` → `languages.code`). Without it, a
	// content `promote` of any translated row fails the FK check.
	if err := seedLanguages(ctx, client); err != nil {
		log.Fatalf("migrate: language seed failed: %v", err)
	}

	log.Println("migrate: schema is up to date")
}

// seedLanguages idempotently inserts the supported language rows. Existing
// rows are left untouched, so it is safe to run on every container start.
func seedLanguages(ctx context.Context, client *ent.Client) error {
	langs := []struct{ code, name, native string }{
		{"en", "English", "English"},
		{"zh", "Chinese", "中文"},
	}
	for _, l := range langs {
		exists, err := client.Language.Query().
			Where(language.IDEQ(l.code)).
			Exist(ctx)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		if _, err := client.Language.Create().
			SetID(l.code).
			SetName(l.name).
			SetNativeName(l.native).
			SetIsActive(true).
			Save(ctx); err != nil {
			return err
		}
		log.Printf("migrate: seeded language %q", l.code)
	}
	return nil
}
