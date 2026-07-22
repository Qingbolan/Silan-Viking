// Command sqlite2pg ports a silan-viking content SQLite database into a
// PostgreSQL database serving as the runtime backend.
//
// The strategy is:
//  1. Open the target PG with the ent client and run `Schema.Create` — this
//     produces the exact set of tables the backend expects, in PG flavour.
//  2. Open the source SQLite read-only.
//  3. For every table that exists in *both* databases, truncate the PG side
//     and copy every row across, with `session_replication_role=replica` set
//     so FK ordering does not matter.
//
// The tool is idempotent: running it twice is equivalent to running it once.
// It does not migrate runtime-only PG tables (comments, likes, visitor stats)
// — those are owned by PG and never written to SQLite.
//
// Usage:
//
//	sqlite2pg --sqlite /path/to/portfolio.db --pg "postgres://user:pw@host:port/db?sslmode=disable"
package main

import (
	"bufio"
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"net/url"
	"os"
	"sort"
	"strings"

	"silan-backend/internal/ent"

	_ "github.com/lib/pq"
	_ "github.com/mattn/go-sqlite3"
)

func main() {
	sqlitePath := flag.String("sqlite", "", "path to source SQLite database")
	pgDSN := flag.String("pg", "", "postgres connection string (overrides --env-file)")
	envFile := flag.String("env-file", "", "read DB_SOURCE / DB_ADMIN_SOURCE from this systemd-style env file when --pg is not set")
	dryRun := flag.Bool("dry-run", false, "list tables and row counts; do not write")
	flag.Parse()

	if *sqlitePath == "" {
		log.Fatal("sqlite2pg: --sqlite is required")
	}
	// Prefer an admin/superuser DSN for the import so we can DISABLE TRIGGER
	// ALL around the bulk insert. Some legacy SQLite rows reference FK
	// targets that are not present (e.g. blog_posts.category_id holds a
	// label string, not a real blog_categories.id) — the SQLite side never
	// enforced these, so PG rejects the row on insert. The admin DSN is read
	// from the same systemd env file as the backend's runtime DSN; it never
	// leaves the server.
	adminDSN := ""
	if *pgDSN == "" && *envFile != "" {
		runtime, admin, err := readDSNsFromEnvFile(*envFile)
		if err != nil {
			log.Fatalf("sqlite2pg: --env-file: %v", err)
		}
		*pgDSN = runtime
		adminDSN = admin
	}
	if *pgDSN == "" {
		log.Fatal("sqlite2pg: either --pg or --env-file (with DB_SOURCE=...) is required")
	}
	// If the admin DSN is set, use it for the write path so the importer can
	// disable triggers across the bulk copy. Otherwise fall back to the
	// runtime DSN and rely on FK-topological insert ordering (which still
	// fails when source data violates a FK).
	writeDSN := *pgDSN
	if adminDSN != "" {
		writeDSN = adminDSN
	}

	// 1. Bring the PG schema up to date via ent. Use the admin DSN if
	// available so the role doing the schema change owns the resulting
	// tables (the runtime role gets ownership reassigned after; the
	// installer also does this on first cutover).
	schemaDSN := writeDSN
	if err := repairLanguageDictionary(context.Background(), schemaDSN); err != nil {
		log.Fatalf("sqlite2pg: repair language dictionary: %v", err)
	}
	entClient, err := ent.Open("postgres", schemaDSN)
	if err != nil {
		log.Fatalf("sqlite2pg: open pg via ent: %v", err)
	}
	if err := entClient.Schema.Create(context.Background()); err != nil {
		log.Fatalf("sqlite2pg: ent Schema.Create: %v", err)
	}
	if err := entClient.Close(); err != nil {
		log.Fatalf("sqlite2pg: close ent client: %v", err)
	}
	if err := ensureProjectionMetadataSchema(context.Background(), writeDSN); err != nil {
		log.Fatalf("sqlite2pg: projection metadata schema: %v", err)
	}
	// Schema.Create runs through the admin DSN so it can add tables safely,
	// but those new objects must be handed back to the runtime role. Without
	// this transfer PostgreSQL hides the admin-owned table from ent's
	// information_schema inspection and the API enters a create/already-exists
	// restart loop on its next boot.
	if adminDSN != "" {
		runtimeRole, err := postgresRoleFromDSN(*pgDSN)
		if err != nil {
			log.Fatalf("sqlite2pg: runtime role: %v", err)
		}
		if err := transferPublicSchemaOwnership(context.Background(), writeDSN, runtimeRole); err != nil {
			log.Fatalf("sqlite2pg: transfer schema ownership to %s: %v", runtimeRole, err)
		}
	}

	// 2. Open both as raw sql.DB for the bulk copy. The write side uses the
	// admin DSN so we can DISABLE TRIGGER ALL around the import; reads
	// against `dst` for sequence resets / table discovery use the same
	// connection — its higher privilege is harmless.
	src, err := sql.Open("sqlite3", *sqlitePath+"?mode=ro")
	if err != nil {
		log.Fatalf("sqlite2pg: open sqlite: %v", err)
	}
	defer src.Close()

	dst, err := sql.Open("postgres", writeDSN)
	if err != nil {
		log.Fatalf("sqlite2pg: open pg: %v", err)
	}
	defer dst.Close()

	srcTables, err := listSQLiteTables(src)
	if err != nil {
		log.Fatalf("sqlite2pg: list sqlite tables: %v", err)
	}
	dstTables, err := listPGTables(dst)
	if err != nil {
		log.Fatalf("sqlite2pg: list pg tables: %v", err)
	}
	dstSet := make(map[string]struct{}, len(dstTables))
	for _, t := range dstTables {
		dstSet[t] = struct{}{}
	}

	var copied, skipped, preservedRuntime []string
	for _, t := range srcTables {
		if _, ok := dstSet[t]; !ok {
			skipped = append(skipped, t)
			continue
		}
		if isRuntimeOwnedTable(t) {
			preservedRuntime = append(preservedRuntime, t)
			continue
		}
		copied = append(copied, t)
	}
	sort.Strings(copied)
	sort.Strings(preservedRuntime)

	if *dryRun {
		fmt.Println("would copy:")
		for _, t := range copied {
			n, _ := scalarInt(src, fmt.Sprintf("SELECT count(*) FROM %q", t))
			fmt.Printf("  %s  (%d rows)\n", t, n)
		}
		fmt.Println("skipped (no matching PG table):")
		for _, t := range skipped {
			fmt.Printf("  %s\n", t)
		}
		fmt.Println("preserved (runtime-owned PG table):")
		for _, t := range preservedRuntime {
			fmt.Printf("  %s\n", t)
		}
		return
	}

	// 3. Copy. One transaction.
	//
	// Some legacy SQLite rows reference FK targets that do not exist in the
	// derived dataset (e.g. blog_posts.category_id holds a label string, not
	// a blog_categories.id). SQLite never enforced these so the data is on
	// disk regardless; PG would reject the row. To keep import lossless, we
	// flip `session_replication_role = replica` for the duration of the
	// copy, which silences FK and user triggers. This requires SUPERUSER —
	// hence the DB_ADMIN_SOURCE escape hatch above. Without admin privs we
	// fall back to FK-topological INSERT order, which works only when the
	// source data already satisfies every FK.
	ctx := context.Background()
	useReplicationRole := adminDSN != ""

	var insertOrder []string
	if useReplicationRole {
		insertOrder = append([]string(nil), copied...)
		sort.Strings(insertOrder)
	} else {
		insertOrder, err = topoOrderTables(ctx, dst, copied)
		if err != nil {
			log.Fatalf("sqlite2pg: topo order: %v", err)
		}
	}

	tx, err := dst.BeginTx(ctx, nil)
	if err != nil {
		log.Fatalf("sqlite2pg: begin pg tx: %v", err)
	}

	if useReplicationRole {
		if _, err := tx.ExecContext(ctx, "SET LOCAL session_replication_role = replica"); err != nil {
			_ = tx.Rollback()
			log.Fatalf("sqlite2pg: disable FK triggers: %v", err)
		}
	}

	// Truncate every target table BEFORE inserting into any of them. Per-table
	// `TRUNCATE ... CASCADE` inside the copy loop silently destroys data:
	// because the loop iterates alphabetically, copying `episode_translations`
	// (4 rows) happens *before* truncating `episodes`, and `TRUNCATE episodes
	// CASCADE` then wipes the just-inserted episode_translations through the
	// FK. The fix is to truncate first (one statement, CASCADE allowed because
	// nothing is inserted yet), then copy with plain INSERT.
	truncTables := make([]string, 0, len(copied))
	for _, t := range copied {
		truncTables = append(truncTables, fmt.Sprintf("%q", t))
	}
	if _, err := tx.ExecContext(ctx,
		fmt.Sprintf(`TRUNCATE TABLE %s RESTART IDENTITY CASCADE`,
			strings.Join(truncTables, ","))); err != nil {
		_ = tx.Rollback()
		log.Fatalf("sqlite2pg: truncate all: %v", err)
	}

	for _, t := range insertOrder {
		n, err := copyTableNoTruncate(ctx, src, tx, t)
		if err != nil {
			_ = tx.Rollback()
			log.Fatalf("sqlite2pg: copy %s: %v", t, err)
		}
		log.Printf("copied %s: %d rows", t, n)
	}

	// Old projection snapshots may contain translation rows but an empty
	// languages table. TRUNCATE + copy would otherwise erase the pre-schema
	// repair above and recreate the same orphaned graph while FK triggers are
	// disabled. Reconcile shared dictionary parents inside the import
	// transaction so the committed projection is referentially complete.
	if err := reconcileLanguageDictionary(ctx, tx); err != nil {
		_ = tx.Rollback()
		log.Fatalf("sqlite2pg: reconcile language dictionary: %v", err)
	}

	if err := tx.Commit(); err != nil {
		log.Fatalf("sqlite2pg: commit pg tx: %v", err)
	}

	// Reset PG sequences for tables that use integer auto-increment columns.
	// We sync via ent; ent uses uuids in our schema, but a few runtime tables
	// (request_logs, project_views, stats_*) do use serial PKs. After a bulk
	// COPY the underlying sequence is not advanced, so the next INSERT from
	// the running backend would collide. Re-set every owned sequence to the
	// current max(id)+1 of its table.
	if err := resetSequences(ctx, dst); err != nil {
		log.Fatalf("sqlite2pg: reset sequences: %v", err)
	}

	log.Printf(
		"done: copied %d tables, preserved %d runtime tables, skipped %d",
		len(copied),
		len(preservedRuntime),
		len(skipped),
	)
	for _, t := range preservedRuntime {
		log.Printf("  preserved (runtime-owned): %s", t)
	}
	for _, t := range skipped {
		log.Printf("  skipped (no PG counterpart): %s", t)
	}
}

// repairLanguageDictionary is a pre-schema migration for databases imported
// by older sqlite2pg releases. Those releases disabled FK triggers during
// copy and could therefore persist translation language_code values without
// their languages parent. Ent validates existing rows when it adds the new
// FK, so the repair must run before Schema.Create.
func repairLanguageDictionary(ctx context.Context, dsn string) error {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return err
	}
	defer db.Close()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	rollback := func(cause error) error {
		_ = tx.Rollback()
		return cause
	}

	// Establish the parent boundary first even on a partially migrated
	// database. Ent will reconcile indexes and constraints afterwards.
	if _, err := tx.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS languages (
			code VARCHAR(5) PRIMARY KEY,
			name VARCHAR(50) NOT NULL,
			native_name VARCHAR(50) NOT NULL,
			is_active BOOLEAN NOT NULL DEFAULT TRUE,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`); err != nil {
		return rollback(err)
	}

	if err := reconcileLanguageDictionary(ctx, tx); err != nil {
		return rollback(err)
	}
	return tx.Commit()
}

type languageDictionaryTx interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func reconcileLanguageDictionary(ctx context.Context, tx languageDictionaryTx) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT DISTINCT table_name
		FROM information_schema.columns
		WHERE table_schema = 'public' AND column_name = 'language_code'
		ORDER BY table_name`)
	if err != nil {
		return err
	}
	var tables []string
	for rows.Next() {
		var table string
		if err := rows.Scan(&table); err != nil {
			_ = rows.Close()
			return err
		}
		tables = append(tables, table)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	_ = rows.Close()

	for _, table := range tables {
		statement := fmt.Sprintf(`
			INSERT INTO languages (code, name, native_name)
			SELECT DISTINCT language_code,
				CASE language_code WHEN 'en' THEN 'English' WHEN 'zh' THEN 'Chinese' ELSE language_code END,
				CASE language_code WHEN 'en' THEN 'English' WHEN 'zh' THEN '中文' ELSE language_code END
			FROM %s
			WHERE language_code IS NOT NULL AND btrim(language_code) <> ''
			ON CONFLICT (code) DO NOTHING`, quotePGIdentifier(table))
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("seed from %s: %w", table, err)
		}
	}
	return nil
}

// sync_meta belongs to the content projection rather than the runtime domain,
// so it is intentionally outside ent's serving-model schema. The importer owns
// this explicit boundary table and migrates it before table discovery, making
// deployed-content provenance available on every supported database.
func ensureProjectionMetadataSchema(ctx context.Context, dsn string) error {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return err
	}
	defer db.Close()

	if _, err = db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS sync_meta (
			content_commit TEXT,
			content_hash TEXT,
			items_total BIGINT,
			generated_at TEXT
		)`); err != nil {
		return err
	}
	if _, err = db.ExecContext(ctx, `ALTER TABLE projects ADD COLUMN IF NOT EXISTS cover_source_type TEXT`); err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, `ALTER TABLE projects ADD COLUMN IF NOT EXISTS cover_website_url TEXT`)
	return err
}

// Runtime-owned tables are written by visitors or the serving backend. A
// content deploy must never truncate them using the author's local SQLite
// snapshot. Everything not listed here is projection-owned and may be
// replaced from the content tree.
var runtimeOwnedTables = map[string]struct{}{
	"annotations":         {},
	"comment_likes":       {},
	"comments":            {},
	"contact_messages":    {},
	"content_interaction": {},
	"project_likes":       {},
	"project_views":       {},
	"request_logs":        {},
	"stats_cache_crawler": {},
	"stats_cache_item":    {},
	"stats_cache_source":  {},
	"stats_cache_visitor": {},
	"user_identities":     {},
	"users":               {},
}

func isRuntimeOwnedTable(table string) bool {
	_, ok := runtimeOwnedTables[table]
	return ok
}

func postgresRoleFromDSN(dsn string) (string, error) {
	u, err := url.Parse(dsn)
	if err != nil {
		return "", fmt.Errorf("parse PostgreSQL DSN: %w", err)
	}
	if u.User == nil || u.User.Username() == "" {
		return "", fmt.Errorf("PostgreSQL DSN has no runtime user")
	}
	return u.User.Username(), nil
}

// transferPublicSchemaOwnership gives every public table and sequence to the
// role used by the serving API. Object names come from PostgreSQL catalogues;
// quotePGIdentifier still quotes each component defensively before execution.
func transferPublicSchemaOwnership(ctx context.Context, adminDSN, runtimeRole string) error {
	db, err := sql.Open("postgres", adminDSN)
	if err != nil {
		return err
	}
	defer db.Close()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	rollback := func(cause error) error {
		_ = tx.Rollback()
		return cause
	}

	type object struct{ schema, name, kind string }
	var objects []object
	for _, catalogue := range []struct {
		query string
		kind  string
	}{
		{`SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public'`, "TABLE"},
		{`SELECT sequence_schema, sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'`, "SEQUENCE"},
	} {
		rows, err := tx.QueryContext(ctx, catalogue.query)
		if err != nil {
			return rollback(err)
		}
		for rows.Next() {
			var schema, name string
			if err := rows.Scan(&schema, &name); err != nil {
				_ = rows.Close()
				return rollback(err)
			}
			objects = append(objects, object{schema: schema, name: name, kind: catalogue.kind})
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return rollback(err)
		}
		_ = rows.Close()
	}

	role := quotePGIdentifier(runtimeRole)
	for _, obj := range objects {
		statement := fmt.Sprintf(
			"ALTER %s %s.%s OWNER TO %s",
			obj.kind,
			quotePGIdentifier(obj.schema),
			quotePGIdentifier(obj.name),
			role,
		)
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return rollback(fmt.Errorf("%s %s.%s: %w", obj.kind, obj.schema, obj.name, err))
		}
	}
	return tx.Commit()
}

func quotePGIdentifier(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

func listSQLiteTables(db *sql.DB) ([]string, error) {
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func listPGTables(db *sql.DB) ([]string, error) {
	rows, err := db.Query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func copyTableNoTruncate(ctx context.Context, src *sql.DB, dst *sql.Tx, table string) (int, error) {
	// Use SQLite column order as authoritative — ent creates the same columns
	// on the PG side. If a column drift sneaks in, the resulting INSERT will
	// fail loudly here. The caller has already truncated all target tables in
	// one statement so per-table truncation is not needed here.
	srcCols, err := sqliteColumns(src, table)
	if err != nil {
		return 0, fmt.Errorf("inspect source columns: %w", err)
	}
	if len(srcCols) == 0 {
		return 0, nil
	}

	selectSQL := fmt.Sprintf(`SELECT %s FROM %q`, quoteJoin(srcCols, `"`), table)
	rows, err := src.QueryContext(ctx, selectSQL)
	if err != nil {
		return 0, fmt.Errorf("select: %w", err)
	}
	defer rows.Close()

	// Per-row dynamic INSERT (silan, 2026-05-22): the previous fixed
	// `INSERT INTO t (all_cols) VALUES (...)` shipped every NULL straight
	// through, so PG columns declared NOT NULL with a DEFAULT (e.g.
	// `blog_posts.is_featured` default false, `view_count` default 0) would
	// reject the row even though the schema *had* a usable default. Skip
	// NULL source values from the column list so PG's column DEFAULT can
	// take over. The cost — re-preparing per row — is negligible against a
	// 250 KB content DB; correctness over reuse.
	count := 0
	for rows.Next() {
		vals := make([]any, len(srcCols))
		ptrs := make([]any, len(srcCols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return count, fmt.Errorf("scan: %w", err)
		}
		// Build the column list and arg vector for just the non-NULL
		// values in this row. PG will fill omitted columns from DEFAULT.
		nonNullCols := make([]string, 0, len(srcCols))
		nonNullVals := make([]any, 0, len(srcCols))
		for i, v := range vals {
			if v == nil {
				continue
			}
			nonNullCols = append(nonNullCols, srcCols[i])
			nonNullVals = append(nonNullVals, v)
		}
		if len(nonNullCols) == 0 {
			// A row with literally no non-NULL columns is meaningless to
			// copy — skip rather than emit `INSERT INTO t () VALUES ()`.
			continue
		}
		placeholders := make([]string, len(nonNullCols))
		for i := range nonNullCols {
			placeholders[i] = fmt.Sprintf("$%d", i+1)
		}
		insertSQL := fmt.Sprintf(`INSERT INTO %q (%s) VALUES (%s)`,
			table,
			quoteJoin(nonNullCols, `"`),
			strings.Join(placeholders, ","),
		)
		if _, err := dst.ExecContext(ctx, insertSQL, nonNullVals...); err != nil {
			return count, fmt.Errorf("insert row %d: %w (cols=%v values=%v)",
				count+1, err, nonNullCols, nonNullVals)
		}
		count++
	}
	return count, rows.Err()
}

func sqliteColumns(db *sql.DB, table string) ([]string, error) {
	rows, err := db.Query(fmt.Sprintf(`PRAGMA table_info(%q)`, table))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var cols []string
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return nil, err
		}
		cols = append(cols, name)
	}
	return cols, rows.Err()
}

func quoteJoin(parts []string, q string) string {
	out := make([]string, len(parts))
	for i, p := range parts {
		out[i] = q + p + q
	}
	return strings.Join(out, ",")
}

func scalarInt(db *sql.DB, q string) (int, error) {
	var n int
	err := db.QueryRow(q).Scan(&n)
	return n, err
}

// topoOrderTables returns the given tables in an FK-friendly insert order
// (parents before children). The graph is read from pg_constraint, restricted
// to the input set so unknown tables don't block progress. Self-references
// are ignored (they only matter at row level, not table level), and any
// remaining cycle is broken arbitrarily — printed as a warning so a future
// schema change with a true cycle is visible. Tables that don't participate
// in any FK come back in alphabetical order, keeping logs stable.
func topoOrderTables(ctx context.Context, db *sql.DB, tables []string) ([]string, error) {
	set := make(map[string]struct{}, len(tables))
	for _, t := range tables {
		set[t] = struct{}{}
	}
	rows, err := db.QueryContext(ctx, `
		SELECT child.relname AS child_table, parent.relname AS parent_table
		FROM pg_constraint c
		JOIN pg_class child  ON child.oid  = c.conrelid
		JOIN pg_class parent ON parent.oid = c.confrelid
		JOIN pg_namespace n  ON n.oid      = child.relnamespace
		WHERE c.contype = 'f' AND n.nspname = 'public'
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	// deps[child] = set of parents the child depends on.
	deps := make(map[string]map[string]struct{}, len(tables))
	for _, t := range tables {
		deps[t] = make(map[string]struct{})
	}
	for rows.Next() {
		var child, parent string
		if err := rows.Scan(&child, &parent); err != nil {
			return nil, err
		}
		if _, ok := set[child]; !ok {
			continue
		}
		if _, ok := set[parent]; !ok {
			continue
		}
		if child == parent {
			continue
		}
		deps[child][parent] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Kahn's algorithm with deterministic tie-breaking (alphabetical).
	remaining := make(map[string]struct{}, len(tables))
	for _, t := range tables {
		remaining[t] = struct{}{}
	}
	var out []string
	for len(remaining) > 0 {
		var ready []string
		for t := range remaining {
			ok := true
			for p := range deps[t] {
				if _, still := remaining[p]; still {
					ok = false
					break
				}
			}
			if ok {
				ready = append(ready, t)
			}
		}
		if len(ready) == 0 {
			// Cycle (or self-reference we did not skip). Break it: take
			// every still-remaining table in alphabetical order; the FK
			// checks will fail at INSERT, surfacing the problem instead of
			// silently looping.
			for t := range remaining {
				ready = append(ready, t)
			}
			sort.Strings(ready)
			log.Printf("warning: FK cycle in remaining tables: %v", ready)
			out = append(out, ready...)
			break
		}
		sort.Strings(ready)
		for _, t := range ready {
			out = append(out, t)
			delete(remaining, t)
		}
	}
	return out, nil
}

// resetSequences walks every PG-owned sequence and pushes it past the current
// max value of the column it backs. Without this, the next INSERT issued by
// the live backend can collide with an id that was bulk-copied from SQLite.
func resetSequences(ctx context.Context, db *sql.DB) error {
	rows, err := db.QueryContext(ctx, `
		SELECT
			s.relname AS seq_name,
			t.relname AS table_name,
			a.attname AS column_name
		FROM pg_class s
		JOIN pg_depend d   ON d.objid = s.oid
		JOIN pg_class t    ON d.refobjid = t.oid
		JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
		WHERE s.relkind = 'S'
	`)
	if err != nil {
		return err
	}
	defer rows.Close()
	type seq struct{ name, table, col string }
	var seqs []seq
	for rows.Next() {
		var s seq
		if err := rows.Scan(&s.name, &s.table, &s.col); err != nil {
			return err
		}
		seqs = append(seqs, s)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, s := range seqs {
		stmt := fmt.Sprintf(
			`SELECT setval(%s, COALESCE((SELECT MAX(%q) FROM %q), 0) + 1, false)`,
			pqLit(s.name), s.col, s.table,
		)
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("setval %s: %w", s.name, err)
		}
	}
	return nil
}

func pqLit(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

// readDSNsFromEnvFile parses a systemd-style KEY=VALUE file and returns the
// runtime (DB_SOURCE) and optional admin (DB_ADMIN_SOURCE) DSNs. This lets
// the importer reuse the same secrets the running backend reads from, so
// production PG passwords never have to be passed on the command line or
// persisted into the deploy tool's config.
func readDSNsFromEnvFile(path string) (runtime, admin string, err error) {
	f, err := os.Open(path)
	if err != nil {
		return "", "", err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		val := strings.Trim(strings.TrimSpace(v), `"'`)
		switch strings.TrimSpace(k) {
		case "DB_SOURCE":
			runtime = val
		case "DB_ADMIN_SOURCE":
			admin = val
		}
	}
	if err := sc.Err(); err != nil {
		return "", "", err
	}
	if runtime == "" {
		return "", "", fmt.Errorf("DB_SOURCE not found in %s", path)
	}
	return runtime, admin, nil
}
