package svc

import (
	"database/sql"
	"fmt"

	entsql "entgo.io/ent/dialect/sql"
	"silan-backend/internal/config"
	"silan-backend/internal/ent"
)

// openDatabase gives Ent and raw repositories one bounded connection pool.
// The Ent client owns closure; closing it also closes RawDB.
func openDatabase(c config.DatabaseConfig) (*ent.Client, *sql.DB, error) {
	maxOpen, maxIdle := c.MaxOpenConnections, c.MaxIdleConnections
	if maxOpen == 0 {
		maxOpen = 32
	}
	if maxIdle == 0 {
		maxIdle = 8
	}
	if maxOpen < 1 || maxIdle < 0 {
		return nil, nil, fmt.Errorf("database connection limits must be non-negative and max-open positive")
	}
	if maxIdle > maxOpen {
		maxIdle = maxOpen
	}
	db, err := sql.Open(c.Driver, c.Source)
	if err != nil {
		return nil, nil, err
	}
	db.SetMaxOpenConns(maxOpen)
	db.SetMaxIdleConns(maxIdle)
	client := ent.NewClient(ent.Driver(entsql.OpenDB(c.Driver, db)))
	return client, db, nil
}
