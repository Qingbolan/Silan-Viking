package svc

import (
	"context"
	"database/sql"
	"log"
	"strings"

	"silan-backend/internal/config"
	"silan-backend/internal/contentdeploy"
	"silan-backend/internal/contenttag"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/migrate"
	"silan-backend/internal/middleware"
	"silan-backend/internal/traffic"

	"github.com/zeromicro/go-zero/rest"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
	_ "github.com/mattn/go-sqlite3"
)

type ServiceContext struct {
	Config          config.Config
	Cors            rest.Middleware
	Analytics       rest.Middleware
	PrivateAPI      rest.Middleware
	DB              *ent.Client
	RawDB           *sql.DB
	ContentTags     *contenttag.Repository
	Traffic         *traffic.Classifier
	CountryResolver *traffic.CountryResolver
	ContentDeploy   *contentdeploy.Service
}

func NewServiceContext(c config.Config) *ServiceContext {
	client, err := ent.Open(c.Database.Driver, c.Database.Source)
	if err != nil {
		log.Fatalf("failed opening connection to database: %v", err)
	}

	// Guard against a stale-schema database. `Schema.Create` is append-only:
	// it adds missing tables/columns but never ALTERs an existing column's
	// type or nullability. A database left over from the legacy Python CLI
	// has `ideas.user_id` as `NOT NULL` — the engine's `index sync` does not
	// write `user_id`, so every sync into such a database fails silently and
	// the served data goes stale without warning. Detect that here and fail
	// loudly with a fix, rather than running on a database the engine can no
	// longer write to. (We do not auto-drop: runtime tables — comments,
	// likes, visitor analytics — hold data the content tree cannot regenerate.)
	if c.Database.Driver == "sqlite3" {
		assertSchemaIsCurrent(rawSchemaPeek(c.Database.Driver, c.Database.Source))
	}

	// Bring the schema up to date. `Schema.Create` is append-only by default
	// — it creates the tables/columns the ent schema declares but the db is
	// missing, and never drops or rewrites what is already there. The
	// silan-viking engine syncs the content tables (blog_posts, ideas, …);
	// this fills in the side / runtime tables ent also needs (idea_details,
	// blog_categories, project_technologies, users, comments, …) as empty
	// tables, so a `WithXxx` join finds an empty table instead of crashing.
	// Foreign keys are disabled: the engine's content tables are not created
	// by ent and a cross-table FK from a freshly migrated side table could
	// reference them inconsistently.
	if err := client.Schema.Create(
		context.Background(),
		migrate.WithForeignKeys(false),
	); err != nil {
		log.Fatalf("failed creating schema resources: %v", err)
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
			country_code TEXT,
			city TEXT,
			latitude REAL,
			longitude REAL,
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
			country_code VARCHAR(2),
			city VARCHAR(128),
			latitude DOUBLE,
			longitude DOUBLE,
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
			country_code TEXT,
			city TEXT,
			latitude DOUBLE PRECISION,
			longitude DOUBLE PRECISION,
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
		countryType := "TEXT"
		if c.Database.Driver == "mysql" {
			countryType = "VARCHAR(2)"
		}
		_, _ = rawDB.Exec("ALTER TABLE request_logs ADD COLUMN country_code " + countryType)
		cityType, coordinateType := "TEXT", "REAL"
		if c.Database.Driver == "mysql" {
			cityType, coordinateType = "VARCHAR(128)", "DOUBLE"
		} else if c.Database.Driver == "postgres" || c.Database.Driver == "postgresql" {
			coordinateType = "DOUBLE PRECISION"
		}
		_, _ = rawDB.Exec("ALTER TABLE request_logs ADD COLUMN city " + cityType)
		_, _ = rawDB.Exec("ALTER TABLE request_logs ADD COLUMN latitude " + coordinateType)
		_, _ = rawDB.Exec("ALTER TABLE request_logs ADD COLUMN longitude " + coordinateType)
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
	dropContentForeignKeys(rawDB, c.Database.Driver)
	trafficClassifier := traffic.NewClassifier(c.Traffic)
	countryResolver, countryErr := traffic.OpenCountryResolver("/var/lib/GeoIP/country.mmdb")
	if countryErr != nil {
		log.Printf("warning: country database unavailable: %v", countryErr)
	}

	return &ServiceContext{
		Config:          c,
		Cors:            middleware.NewCorsMiddleware().Handle,
		Analytics:       middleware.NewAnalyticsMiddleware(client, trafficClassifier, countryResolver).Handle,
		PrivateAPI:      middleware.NewMachineTokenMiddleware(c.Security.StatsSyncToken).Handle,
		DB:              client,
		RawDB:           rawDB,
		ContentTags:     contenttag.NewRepository(rawDB, c.Database.Driver),
		Traffic:         trafficClassifier,
		CountryResolver: countryResolver,
		ContentDeploy: contentdeploy.NewService(contentdeploy.Config{
			Driver:         c.Database.Driver,
			ImporterPath:   c.ContentDeployImporterPath(),
			DatabaseEnv:    c.ContentDeployDatabaseEnv(),
			MediaRoot:      c.MediaRoot(),
			MaxBundleBytes: c.ContentDeployMaxBundleBytes(),
		}, rawDB),
	}
}

// dropContentForeignKeys rebuilds the runtime analytics tables that an older
// ent schema gave a database-level foreign key onto an engine-derived content
// table (`project_views`/`project_likes` → `projects`).
//
// Such a FK is a modelling error: `deploy`'s promote replaces the derived
// `projects` table wholesale — with fresh ids — on every content sync, so any
// FK from a *runtime* table into it dangles at the next promote and aborts the
// promote transaction. The current ent schema no longer declares these edges;
// this migration brings an already-migrated database in line by recreating
// the tables without the `projects` FK. SQLite cannot `DROP CONSTRAINT`, so a
// table that still has it is rebuilt: rename, recreate FK-free, copy, drop.
//
// Only SQLite is handled — it is the deploy driver, and the rebuild idiom is
// SQLite-specific. The migration is idempotent: a table already FK-free (the
// `sqlite_master` SQL no longer mentions `REFERENCES \`projects\“) is skipped.
// contentFKRebuild describes how to rebuild one runtime table free of its
// content foreign key.
type contentFKRebuild struct {
	// createSQL is the FK-free CREATE TABLE, matching the current ent schema.
	createSQL string
	// columns is the explicit shared column list copied from the old table.
	// It must list only columns the *new* table has — so a dropped
	// edge-backed FK column (e.g. `blog_post_comments`) is left behind.
	columns string
}

func dropContentForeignKeys(db *sql.DB, driver string) {
	if driver != "sqlite3" {
		return
	}

	rebuilds := map[string]contentFKRebuild{
		"project_views": {
			createSQL: `CREATE TABLE project_views (
				id text NOT NULL PRIMARY KEY,
				project_id text NOT NULL,
				user_identity_id text NULL,
				fingerprint text NULL,
				ip_address text NULL,
				user_agent text NULL,
				referrer text NULL,
				session_duration integer NULL DEFAULT (0),
				created_at datetime NOT NULL,
				updated_at datetime NOT NULL,
				CONSTRAINT project_views_user_identities_user_identity
					FOREIGN KEY (user_identity_id) REFERENCES user_identities (id) ON DELETE SET NULL
			)`,
			columns: "id, project_id, user_identity_id, fingerprint, ip_address, " +
				"user_agent, referrer, session_duration, created_at, updated_at",
		},
		"project_likes": {
			createSQL: `CREATE TABLE project_likes (
				id text NOT NULL PRIMARY KEY,
				project_id text NOT NULL,
				user_identity_id text NULL,
				fingerprint text NULL,
				ip_address text NULL,
				user_agent text NULL,
				created_at datetime NOT NULL,
				updated_at datetime NOT NULL,
				CONSTRAINT project_likes_user_identities_user_identity
					FOREIGN KEY (user_identity_id) REFERENCES user_identities (id) ON DELETE SET NULL
			)`,
			columns: "id, project_id, user_identity_id, fingerprint, ip_address, " +
				"user_agent, created_at, updated_at",
		},
		// `comments` carried ent-edge FK columns `blog_post_comments` /
		// `idea_comments` -> `blog_posts` / `ideas`. The edges are gone; the
		// rebuilt table drops both columns and both FKs. The `parent` and
		// `user_identity` FKs stay — both targets are runtime tables.
		"comments": {
			createSQL: `CREATE TABLE comments (
				id text NOT NULL PRIMARY KEY,
				entity_type text NOT NULL,
				entity_id text NOT NULL,
				author_name text NOT NULL,
				author_email text NOT NULL,
				author_website text NULL,
				content text NOT NULL,
				type text NOT NULL DEFAULT ('general'),
				reference_id text NULL,
				attachment_id text NULL,
				is_approved bool NOT NULL DEFAULT (false),
				ip_address text NULL,
				user_agent text NULL,
				likes_count integer NOT NULL DEFAULT (0),
				created_at datetime NOT NULL,
				updated_at datetime NOT NULL,
				parent_id text NULL,
				user_identity_id text NULL,
				CONSTRAINT comments_comments_parent
					FOREIGN KEY (parent_id) REFERENCES comments (id) ON DELETE SET NULL,
				CONSTRAINT comments_user_identities_user_identity
					FOREIGN KEY (user_identity_id) REFERENCES user_identities (id) ON DELETE SET NULL
			)`,
			columns: "id, entity_type, entity_id, author_name, author_email, " +
				"author_website, content, type, reference_id, attachment_id, " +
				"is_approved, ip_address, user_agent, likes_count, created_at, " +
				"updated_at, parent_id, user_identity_id",
		},
	}

	for table, r := range rebuilds {
		var existing string
		err := db.QueryRow(
			"SELECT sql FROM sqlite_master WHERE type='table' AND name=?", table,
		).Scan(&existing)
		if err != nil {
			continue // table absent — createAnalyticsTables makes it FK-free
		}
		// A content FK is one referencing an engine-derived content table.
		hasContentFK := false
		for _, ref := range []string{"projects", "blog_posts", "ideas"} {
			if strings.Contains(existing, "REFERENCES `"+ref+"`") ||
				strings.Contains(existing, "REFERENCES "+ref+" ") {
				hasContentFK = true
				break
			}
		}
		if !hasContentFK {
			continue // already FK-free — nothing to do
		}
		// Rebuild without the content FK. `foreign_keys` is OFF for the swap
		// so the rename does not trip other tables' checks; the copy uses an
		// explicit column list so a dropped FK column is simply not carried.
		stmts := []string{
			"PRAGMA foreign_keys=OFF",
			"ALTER TABLE " + table + " RENAME TO " + table + "_old_fk",
			r.createSQL,
			"INSERT INTO " + table + " (" + r.columns + ") SELECT " + r.columns +
				" FROM " + table + "_old_fk",
			"DROP TABLE " + table + "_old_fk",
			"PRAGMA foreign_keys=ON",
		}
		failed := false
		for _, s := range stmts {
			if _, err := db.Exec(s); err != nil {
				log.Printf("warning: dropping content FK from %s failed at %q: %v", table, s, err)
				failed = true
				break
			}
		}
		if !failed {
			log.Printf("migrated %s: dropped its content foreign key", table)
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
				referrer TEXT,
				landing_url TEXT,
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
				referrer TEXT,
				landing_url TEXT,
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
				referrer TEXT,
				landing_url TEXT,
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

// schemaPeek is the minimal probe of a database's content-table schema —
// enough to tell a current ent schema from a legacy Python-CLI one.
type schemaPeek struct {
	// hasIdeasTable is false for a brand-new (empty) database — nothing to
	// guard, Schema.Create will build it fresh.
	hasIdeasTable bool
	// ideasUserIDNotNull is true when `ideas.user_id` is `NOT NULL`, the
	// tell-tale of a legacy schema the engine's `index sync` cannot write.
	ideasUserIDNotNull bool
}

// rawSchemaPeek inspects the `ideas` table definition without going through
// ent, so it can run before Schema.Create. A database the probe cannot open
// or read is treated as empty (hasIdeasTable=false) — Schema.Create handles
// the fresh-database case.
func rawSchemaPeek(driver, source string) schemaPeek {
	db, err := sql.Open(driver, source)
	if err != nil {
		return schemaPeek{}
	}
	defer db.Close()

	rows, err := db.Query(`PRAGMA table_info(ideas)`)
	if err != nil {
		return schemaPeek{}
	}
	defer rows.Close()

	peek := schemaPeek{}
	for rows.Next() {
		var (
			cid        int
			name, ctyp string
			notNull    int
			dfltValue  sql.NullString
			pk         int
		)
		if err := rows.Scan(&cid, &name, &ctyp, &notNull, &dfltValue, &pk); err != nil {
			continue
		}
		peek.hasIdeasTable = true
		if name == "user_id" && notNull == 1 {
			peek.ideasUserIDNotNull = true
		}
	}
	return peek
}

// assertSchemaIsCurrent fails loudly when the database carries a legacy
// schema the silan-viking engine can no longer sync into. The database is a
// derived projection of the content tree, so the fix is to rebuild it — but
// runtime tables (comments, likes, analytics) hold data the content tree
// cannot regenerate, so this never auto-drops; it tells the operator.
func assertSchemaIsCurrent(peek schemaPeek) {
	if peek.hasIdeasTable && peek.ideasUserIDNotNull {
		log.Fatalf("stale database schema: `ideas.user_id` is NOT NULL — this " +
			"database predates the current ent schema and the engine's " +
			"`index sync` cannot write to it. Remove the database file and " +
			"restart so the current schema is built, then re-run `index sync`. " +
			"Note: runtime tables (comments, likes, analytics) are lost on " +
			"rebuild — back them up first if they hold data you need.")
	}
}
