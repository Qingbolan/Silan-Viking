-- Schema migration for _deploy/api/portfolio.db
--
-- This DB was created with an older schema. The current backend (Ent ORM)
-- expects columns and tables that the old DB does not have. The statements
-- below bring the DB up to the backend's expected schema.
--
-- All statements are non-destructive and idempotent:
--   * RENAME COLUMN keeps existing data (star_count -> like_count)
--   * ADD COLUMN adds empty columns; no existing data is touched
--   * CREATE TABLE IF NOT EXISTS only creates tables that are missing
--
-- Run with:
--   sqlite3 _deploy/api/portfolio.db < _deploy/api/migrate-schema.sql

-- ── projects ────────────────────────────────────────────────────────
-- Backend expects `like_count`; old DB has `star_count`.
ALTER TABLE projects RENAME COLUMN star_count TO like_count;

-- ── ideas ───────────────────────────────────────────────────────────
-- Backend expects `description` and `category`; old DB has neither.
ALTER TABLE ideas ADD COLUMN description TEXT;
ALTER TABLE ideas ADD COLUMN category VARCHAR(100);

-- ── idea_details ────────────────────────────────────────────────────
-- One-to-one detail row per idea. Missing entirely from the old DB.
CREATE TABLE IF NOT EXISTS idea_details (
	id CHAR(36) NOT NULL,
	progress TEXT,
	results TEXT,
	"references" TEXT,
	estimated_duration_months INTEGER,
	required_resources TEXT,
	collaboration_needed BOOLEAN NOT NULL DEFAULT 0,
	funding_required BOOLEAN NOT NULL DEFAULT 0,
	estimated_budget REAL,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	idea_id CHAR(36) NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (idea_id),
	FOREIGN KEY (idea_id) REFERENCES ideas (id)
);

-- ── idea_detail_translations ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idea_detail_translations (
	id CHAR(36) NOT NULL,
	progress TEXT,
	results TEXT,
	"references" TEXT,
	required_resources TEXT,
	created_at DATETIME NOT NULL,
	idea_detail_id CHAR(36) NOT NULL,
	language_code VARCHAR(5) NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY (idea_detail_id) REFERENCES idea_details (id),
	FOREIGN KEY (language_code) REFERENCES languages (id)
);

-- ── idea_tags ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idea_tags (
	id CHAR(36) NOT NULL,
	name VARCHAR(100) NOT NULL,
	slug VARCHAR(200) NOT NULL,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (slug)
);

-- ── idea_tags_join ──────────────────────────────────────────────────
-- Many-to-many join between ideas and idea_tags.
CREATE TABLE IF NOT EXISTS idea_tags_join (
	idea_id CHAR(36) NOT NULL,
	idea_tag_id CHAR(36) NOT NULL,
	PRIMARY KEY (idea_id, idea_tag_id),
	FOREIGN KEY (idea_id) REFERENCES ideas (id) ON DELETE CASCADE,
	FOREIGN KEY (idea_tag_id) REFERENCES idea_tags (id) ON DELETE CASCADE
);
