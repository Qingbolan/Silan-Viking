package svc

import (
	"database/sql"
	"log"

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

	// request_logs — a runtime access-log table written by the analytics
	// middleware via the ent client. The table itself mirrors the ent
	// RequestLog schema; it is created here (a small bootstrap DDL, like
	// the other runtime tables) rather than via ent migrate, since a full
	// ent migrate would also touch the engine-owned content tables.
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
			is_bot BOOLEAN DEFAULT 0,
			bot_name TEXT,
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
			is_bot TINYINT(1) DEFAULT 0,
			bot_name VARCHAR(64),
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
			is_bot BOOLEAN DEFAULT FALSE,
			bot_name TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`
	default:
		ddl = ""
	}
	if ddl != "" {
		if _, err := rawDB.Exec(ddl); err != nil {
			log.Printf("warning: failed creating request_logs table: %v", err)
		}
		// Idempotently add the bot columns to a pre-existing table — a
		// failed ALTER (column already present) is expected and ignored.
		boolType := "BOOLEAN DEFAULT 0"
		if c.Database.Driver == "postgres" || c.Database.Driver == "postgresql" {
			boolType = "BOOLEAN DEFAULT FALSE"
		} else if c.Database.Driver == "mysql" {
			boolType = "TINYINT(1) DEFAULT 0"
		}
		nameType := "TEXT"
		if c.Database.Driver == "mysql" {
			nameType = "VARCHAR(64)"
		}
		_, _ = rawDB.Exec("ALTER TABLE request_logs ADD COLUMN is_bot " + boolType)
		_, _ = rawDB.Exec("ALTER TABLE request_logs ADD COLUMN bot_name " + nameType)
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

	createAnalyticsTables(rawDB, c.Database.Driver)
	createContentRelationTable(rawDB, c.Database.Driver)
	migrateLegacyBlogSeries(rawDB, c.Database.Driver)

	return &ServiceContext{
		Config:    c,
		Cors:      middleware.NewCorsMiddleware().Handle,
		Analytics: middleware.NewAnalyticsMiddleware(client).Handle,
		DB:        client,
		RawDB:     rawDB,
	}
}

func migrateLegacyBlogSeries(db *sql.DB, driver string) {
	if driver != "sqlite3" {
		return
	}

	uuidExpr := `lower(
		hex(randomblob(4)) || '-' ||
		hex(randomblob(2)) || '-' ||
		'4' || substr(hex(randomblob(2)), 2) || '-' ||
		substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' ||
		hex(randomblob(6))
	)`

	statements := []string{
		`INSERT OR IGNORE INTO episode_series (id, slug, title, description, status, created_at, updated_at)
		 SELECT
		 	id,
		 	slug,
		 	title,
		 	description,
		 	CASE WHEN status IN ('active', 'ongoing') THEN 'ongoing' ELSE status END,
		 	COALESCE(created_at, datetime('now')),
		 	COALESCE(updated_at, datetime('now'))
		 FROM blog_series`,
		`INSERT OR IGNORE INTO episodes (id, slug, title, episode_number, status, visibility, published_at, duration_minutes, created_at, updated_at, series_id)
		 SELECT
		 	id,
		 	slug,
		 	title,
		 	COALESCE(series_order, 1),
		 	CASE WHEN status = 'published' THEN 'published' ELSE 'draft' END,
		 	visibility,
		 	published_at,
		 	reading_time_minutes,
		 	COALESCE(created_at, datetime('now')),
		 	COALESCE(updated_at, datetime('now')),
		 	series_id
		 FROM blog_posts
		 WHERE series_id IS NOT NULL`,
		`INSERT OR IGNORE INTO episode_series_translations (id, language_code, title, description, created_at, episode_series_id)
		 SELECT
		 	` + uuidExpr + `,
		 	language_code,
		 	title,
		 	description,
		 	COALESCE(created_at, datetime('now')),
		 	blog_series_id
		 FROM blog_series_translations`,
		`INSERT OR IGNORE INTO episode_translations (id, language_code, title, description, created_at, episode_id)
		 SELECT
		 	` + uuidExpr + `,
		 	language_code,
		 	title,
		 	excerpt,
		 	COALESCE(created_at, datetime('now')),
		 	blog_post_id
		 FROM blog_post_translations
		 WHERE blog_post_id IN (SELECT id FROM blog_posts WHERE series_id IS NOT NULL)`,
	}

	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			log.Printf("warning: failed migrating legacy blog series: %v", err)
		}
	}
}

func createContentRelationTable(db *sql.DB, driver string) {
	var ddls []string

	switch driver {
	case "sqlite3":
		ddls = []string{
			`CREATE TABLE IF NOT EXISTS content_relation (
				id TEXT PRIMARY KEY,
				from_type TEXT NOT NULL,
				from_id TEXT NOT NULL,
				to_type TEXT NOT NULL,
				to_id TEXT NOT NULL,
				relation_type TEXT NOT NULL,
				sort_order INTEGER NOT NULL DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(from_type, from_id, to_type, to_id, relation_type)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_content_relation_from ON content_relation(from_type, from_id)`,
			`CREATE INDEX IF NOT EXISTS idx_content_relation_to ON content_relation(to_type, to_id)`,
		}
	case "mysql":
		ddls = []string{
			`CREATE TABLE IF NOT EXISTS content_relation (
				id CHAR(36) NOT NULL PRIMARY KEY,
				from_type VARCHAR(32) NOT NULL,
				from_id CHAR(36) NOT NULL,
				to_type VARCHAR(32) NOT NULL,
				to_id CHAR(36) NOT NULL,
				relation_type VARCHAR(32) NOT NULL,
				sort_order INT NOT NULL DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				UNIQUE KEY uniq_content_relation (from_type, from_id, to_type, to_id, relation_type),
				INDEX idx_content_relation_from (from_type, from_id),
				INDEX idx_content_relation_to (to_type, to_id)
			) ENGINE=InnoDB`,
		}
	case "postgres", "postgresql":
		ddls = []string{
			`CREATE TABLE IF NOT EXISTS content_relation (
				id UUID PRIMARY KEY,
				from_type TEXT NOT NULL,
				from_id UUID NOT NULL,
				to_type TEXT NOT NULL,
				to_id UUID NOT NULL,
				relation_type TEXT NOT NULL,
				sort_order INT NOT NULL DEFAULT 0,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(from_type, from_id, to_type, to_id, relation_type)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_content_relation_from ON content_relation(from_type, from_id)`,
			`CREATE INDEX IF NOT EXISTS idx_content_relation_to ON content_relation(to_type, to_id)`,
		}
	}

	for _, ddl := range ddls {
		if _, err := db.Exec(ddl); err != nil {
			log.Printf("warning: failed creating content_relation table/index: %v", err)
		}
	}
}

func createAnalyticsTables(db *sql.DB, driver string) {
	var ddls []string

	switch driver {
	case "sqlite3":
		ddls = []string{
			`CREATE TABLE IF NOT EXISTS project_views (
				id TEXT PRIMARY KEY,
				project_id TEXT NOT NULL,
				user_identity_id TEXT,
				fingerprint TEXT,
				ip_address TEXT,
				user_agent TEXT,
				referrer TEXT,
				session_duration INTEGER DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE INDEX IF NOT EXISTS idx_project_views_project_id ON project_views(project_id)`,
			`CREATE INDEX IF NOT EXISTS idx_project_views_fingerprint ON project_views(fingerprint)`,
			`CREATE INDEX IF NOT EXISTS idx_project_views_created_at ON project_views(created_at)`,
			`CREATE TABLE IF NOT EXISTS project_likes (
				id TEXT PRIMARY KEY,
				project_id TEXT NOT NULL,
				user_identity_id TEXT,
				fingerprint TEXT,
				ip_address TEXT,
				user_agent TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_project_likes_project_user ON project_likes(project_id, user_identity_id)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_project_likes_project_fingerprint ON project_likes(project_id, fingerprint)`,
			`CREATE INDEX IF NOT EXISTS idx_project_likes_project_id ON project_likes(project_id)`,
			`CREATE TABLE IF NOT EXISTS content_interaction (
				id TEXT PRIMARY KEY,
				entity_type TEXT NOT NULL,
				entity_id TEXT NOT NULL,
				section_anchor TEXT,
				kind TEXT NOT NULL,
				user_identity_id TEXT,
				fingerprint TEXT,
				ip_address TEXT,
				user_agent TEXT,
				visitor_kind TEXT NOT NULL DEFAULT 'human',
				referrer_kind TEXT NOT NULL DEFAULT 'direct',
				crawler_name TEXT,
				session_duration INTEGER NOT NULL DEFAULT 0,
				scroll_progress REAL NOT NULL DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE INDEX IF NOT EXISTS idx_content_interaction_entity ON content_interaction(entity_type, entity_id)`,
			`CREATE INDEX IF NOT EXISTS idx_content_interaction_entity_kind ON content_interaction(entity_type, entity_id, kind)`,
			`CREATE INDEX IF NOT EXISTS idx_content_interaction_fingerprint ON content_interaction(fingerprint)`,
			`CREATE INDEX IF NOT EXISTS idx_content_interaction_created_at ON content_interaction(created_at)`,
		}
	case "mysql":
		ddls = []string{
			`CREATE TABLE IF NOT EXISTS project_views (
				id CHAR(36) NOT NULL PRIMARY KEY,
				project_id CHAR(36) NOT NULL,
				user_identity_id VARCHAR(255),
				fingerprint VARCHAR(255),
				ip_address VARCHAR(45),
				user_agent TEXT,
				referrer TEXT,
				session_duration INT DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				INDEX idx_project_views_project_id (project_id),
				INDEX idx_project_views_fingerprint (fingerprint),
				INDEX idx_project_views_created_at (created_at)
			) ENGINE=InnoDB`,
			`CREATE TABLE IF NOT EXISTS project_likes (
				id CHAR(36) NOT NULL PRIMARY KEY,
				project_id CHAR(36) NOT NULL,
				user_identity_id VARCHAR(255),
				fingerprint VARCHAR(255),
				ip_address VARCHAR(45),
				user_agent TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				UNIQUE KEY idx_project_likes_project_user (project_id, user_identity_id),
				UNIQUE KEY idx_project_likes_project_fingerprint (project_id, fingerprint),
				INDEX idx_project_likes_project_id (project_id)
			) ENGINE=InnoDB`,
			`CREATE TABLE IF NOT EXISTS content_interaction (
				id CHAR(36) NOT NULL PRIMARY KEY,
				entity_type VARCHAR(32) NOT NULL,
				entity_id CHAR(36) NOT NULL,
				section_anchor VARCHAR(255),
				kind VARCHAR(32) NOT NULL,
				user_identity_id VARCHAR(255),
				fingerprint VARCHAR(255),
				ip_address VARCHAR(45),
				user_agent TEXT,
				visitor_kind VARCHAR(32) NOT NULL DEFAULT 'human',
				referrer_kind VARCHAR(32) NOT NULL DEFAULT 'direct',
				crawler_name VARCHAR(255),
				session_duration INT NOT NULL DEFAULT 0,
				scroll_progress DOUBLE NOT NULL DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				INDEX idx_content_interaction_entity (entity_type, entity_id),
				INDEX idx_content_interaction_entity_kind (entity_type, entity_id, kind),
				INDEX idx_content_interaction_fingerprint (fingerprint),
				INDEX idx_content_interaction_created_at (created_at)
			) ENGINE=InnoDB`,
		}
	case "postgres", "postgresql":
		ddls = []string{
			`CREATE TABLE IF NOT EXISTS project_views (
				id UUID PRIMARY KEY,
				project_id UUID NOT NULL,
				user_identity_id TEXT,
				fingerprint TEXT,
				ip_address TEXT,
				user_agent TEXT,
				referrer TEXT,
				session_duration INT DEFAULT 0,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE INDEX IF NOT EXISTS idx_project_views_project_id ON project_views(project_id)`,
			`CREATE INDEX IF NOT EXISTS idx_project_views_fingerprint ON project_views(fingerprint)`,
			`CREATE INDEX IF NOT EXISTS idx_project_views_created_at ON project_views(created_at)`,
			`CREATE TABLE IF NOT EXISTS project_likes (
				id UUID PRIMARY KEY,
				project_id UUID NOT NULL,
				user_identity_id TEXT,
				fingerprint TEXT,
				ip_address TEXT,
				user_agent TEXT,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_project_likes_project_user ON project_likes(project_id, user_identity_id)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_project_likes_project_fingerprint ON project_likes(project_id, fingerprint)`,
			`CREATE INDEX IF NOT EXISTS idx_project_likes_project_id ON project_likes(project_id)`,
			`CREATE TABLE IF NOT EXISTS content_interaction (
				id UUID PRIMARY KEY,
				entity_type TEXT NOT NULL,
				entity_id UUID NOT NULL,
				section_anchor TEXT,
				kind TEXT NOT NULL,
				user_identity_id TEXT,
				fingerprint TEXT,
				ip_address TEXT,
				user_agent TEXT,
				visitor_kind TEXT NOT NULL DEFAULT 'human',
				referrer_kind TEXT NOT NULL DEFAULT 'direct',
				crawler_name TEXT,
				session_duration INT NOT NULL DEFAULT 0,
				scroll_progress DOUBLE PRECISION NOT NULL DEFAULT 0,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			)`,
			`ALTER TABLE content_interaction ADD COLUMN IF NOT EXISTS scroll_progress DOUBLE PRECISION NOT NULL DEFAULT 0`,
			`CREATE INDEX IF NOT EXISTS idx_content_interaction_entity ON content_interaction(entity_type, entity_id)`,
			`CREATE INDEX IF NOT EXISTS idx_content_interaction_entity_kind ON content_interaction(entity_type, entity_id, kind)`,
			`CREATE INDEX IF NOT EXISTS idx_content_interaction_fingerprint ON content_interaction(fingerprint)`,
			`CREATE INDEX IF NOT EXISTS idx_content_interaction_created_at ON content_interaction(created_at)`,
		}
	}

	for _, ddl := range ddls {
		if _, err := db.Exec(ddl); err != nil {
			log.Printf("warning: failed creating analytics table/index: %v", err)
		}
	}
}
