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

	// Additive-only migration: create missing tables/columns, drop nothing.
	// WithDropColumn / WithDropIndex are left at their default (false), so
	// the existing data and legacy columns are kept intact.
	if err := client.Schema.Create(context.Background()); err != nil {
		log.Fatalf("migrate: schema create failed: %v", err)
	}

	log.Println("migrate: schema is up to date")
}
