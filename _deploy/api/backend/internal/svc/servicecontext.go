package svc

import (
	"database/sql"
	"log"
	"net/http"

	"silan-backend/internal/config"
	"silan-backend/internal/ent"
	"silan-backend/internal/middleware"

	"github.com/zeromicro/go-zero/rest"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
	_ "github.com/mattn/go-sqlite3"
)

type ServiceContext struct {
	Config    config.Config
	Cors      rest.Middleware
	Analytics rest.Middleware
	DB        *ent.Client
	RawDB     *sql.DB
}

func NewServiceContext(c config.Config) *ServiceContext {
	client, err := ent.Open(c.Database.Driver, c.Database.Source)
	if err != nil {
		log.Fatalf("failed opening connection to database: %v", err)
	}

	// Open a standard database/sql connection for lightweight analytics inserts
	rawDB, err := sql.Open(c.Database.Driver, c.Database.Source)
	if err != nil {
		log.Fatalf("failed opening raw DB connection: %v", err)
	}

	// Create request_logs table if not exists (per driver)
	var ddl string
	switch c.Database.Driver {
	case "sqlite3":
		ddl = `CREATE TABLE IF NOT EXISTS request_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			method TEXT,
			path TEXT,
			status INTEGER,
			duration_ms INTEGER,
			referrer TEXT,
			user_agent TEXT,
			ip TEXT,
			lang TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`
	case "mysql":
		ddl = `CREATE TABLE IF NOT EXISTS request_logs (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
			method VARCHAR(16),
			path VARCHAR(1024),
			status INT,
			duration_ms INT,
			referrer VARCHAR(1024),
			user_agent VARCHAR(1024),
			ip VARCHAR(64),
			lang VARCHAR(8),
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		) ENGINE=InnoDB`
	case "postgres", "postgresql":
		ddl = `CREATE TABLE IF NOT EXISTS request_logs (
			id SERIAL PRIMARY KEY,
			method TEXT,
			path TEXT,
			status INT,
			duration_ms INT,
			referrer TEXT,
			user_agent TEXT,
			ip TEXT,
			lang TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`
	default:
		ddl = ""
	}
	if ddl != "" {
		if _, err := rawDB.Exec(ddl); err != nil {
			log.Printf("warning: failed creating request_logs table: %v", err)
		}
	}

	// Create user_identities table for OAuth identities (to store avatar, etc.)
	var idDDL string
	switch c.Database.Driver {
	case "sqlite3":
		idDDL = `CREATE TABLE IF NOT EXISTS user_identities (
			id TEXT PRIMARY KEY,
			provider TEXT NOT NULL,
			external_id TEXT NOT NULL,
			email TEXT,
			display_name TEXT,
			avatar_url TEXT,
			verified INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(provider, external_id)
		)`
	case "mysql":
		idDDL = `CREATE TABLE IF NOT EXISTS user_identities (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			provider VARCHAR(32) NOT NULL,
			external_id VARCHAR(255) NOT NULL,
			email VARCHAR(255),
			display_name VARCHAR(255),
			avatar_url VARCHAR(512),
			verified TINYINT(1) DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			UNIQUE KEY uniq_provider_external (provider, external_id)
		) ENGINE=InnoDB`
	case "postgres", "postgresql":
		idDDL = `CREATE TABLE IF NOT EXISTS user_identities (
			id TEXT PRIMARY KEY,
			provider TEXT NOT NULL,
			external_id TEXT NOT NULL,
			email TEXT,
			display_name TEXT,
			avatar_url TEXT,
			verified BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(provider, external_id)
		)`
	default:
		idDDL = ""
	}
	if idDDL != "" {
		if _, err := rawDB.Exec(idDDL); err != nil {
			log.Printf("warning: failed creating user_identities table: %v", err)
		}
	}

	// Ensure blog_comments has user_identity_id column to match current Ent schema
	switch c.Database.Driver {
	case "sqlite3":
		// Check column existence via PRAGMA and add if missing
		rows, err := rawDB.Query("PRAGMA table_info(blog_comments)")
		if err == nil {
			defer rows.Close()
			found := false
			for rows.Next() {
				var cid int
				var name, ctype string
				var notnull, pk int
				var dflt sql.NullString
				_ = rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk)
				if name == "user_identity_id" {
					found = true
					break
				}
			}
			if !found {
				if _, err := rawDB.Exec("ALTER TABLE blog_comments ADD COLUMN user_identity_id TEXT"); err != nil {
					log.Printf("warning: failed adding user_identity_id to blog_comments: %v", err)
				}
			}
		} else {
			log.Printf("warning: failed to inspect blog_comments schema: %v", err)
		}
	case "mysql":
		if _, err := rawDB.Exec("ALTER TABLE blog_comments ADD COLUMN IF NOT EXISTS user_identity_id VARCHAR(36) NULL"); err != nil {
			log.Printf("warning: failed ensuring user_identity_id column (mysql): %v", err)
		}
	case "postgres", "postgresql":
		if _, err := rawDB.Exec("ALTER TABLE blog_comments ADD COLUMN IF NOT EXISTS user_identity_id TEXT NULL"); err != nil {
			log.Printf("warning: failed ensuring user_identity_id column (postgres): %v", err)
		}
	}

	noop := func(next http.HandlerFunc) http.HandlerFunc { return next }

	return &ServiceContext{
		Config:    c,
		Cors:      middleware.NewCorsMiddleware().Handle,
		Analytics: noop,
		DB:        client,
		RawDB:     rawDB,
	}
}
