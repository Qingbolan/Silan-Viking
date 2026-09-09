package contentdeploy

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExtractBundleRejectsPathTraversal(t *testing.T) {
	var compressed bytes.Buffer
	gz := gzip.NewWriter(&compressed)
	archive := tar.NewWriter(gz)
	data := []byte("unsafe")
	header := &tar.Header{Name: "../outside", Mode: 0o600, Size: int64(len(data))}
	if err := archive.WriteHeader(header); err != nil {
		t.Fatal(err)
	}
	if _, err := archive.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	if err := extractBundle(&compressed, t.TempDir(), 1024); err == nil {
		t.Fatal("expected unsafe archive path to be rejected")
	}
}

func TestReadManifestReportsProtocolMismatch(t *testing.T) {
	for _, tc := range []struct {
		name    string
		version int
		schema  int
		want    string
	}{
		{"current", BundleVersion, ProjectionSchemaVersion, ""},
		{"old schema", BundleVersion, ProjectionSchemaVersion - 1, "deploy matching backend code before content"},
		{"future schema", BundleVersion, ProjectionSchemaVersion + 1, "server supports"},
		{"future bundle", BundleVersion + 1, ProjectionSchemaVersion, "unsupported deployment bundle version"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			manifest := Manifest{
				Version: tc.version, SchemaVersion: tc.schema,
				ContentCommit: strings.Repeat("a", 40), ContentHash: "hash",
				DatabaseSHA: strings.Repeat("b", 64), SourceSHA: strings.Repeat("c", 64),
				Media: []MediaAsset{},
			}
			data, err := json.Marshal(manifest)
			if err != nil {
				t.Fatal(err)
			}
			path := filepath.Join(t.TempDir(), "manifest.json")
			if err := os.WriteFile(path, data, 0600); err != nil {
				t.Fatal(err)
			}
			_, err = readManifest(path)
			if tc.want == "" {
				if err != nil {
					t.Fatal(err)
				}
			} else if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("expected %q, got %v", tc.want, err)
			}
		})
	}
}

func TestValidateDatabaseBindsManifestToProjection(t *testing.T) {
	path := filepath.Join(t.TempDir(), "portfolio.db")
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE sync_meta (
		content_hash TEXT NOT NULL,
		content_commit TEXT NOT NULL
	); INSERT INTO sync_meta VALUES ('hash-1', 'commit-1')`); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(data)
	manifest := &Manifest{
		Version:       BundleVersion,
		SchemaVersion: ProjectionSchemaVersion,
		ContentCommit: "commit-1",
		ContentHash:   "hash-1",
		DatabaseSHA:   hex.EncodeToString(sum[:]),
		Media:         []MediaAsset{},
	}
	if err := validateDatabase(path, manifest); err != nil {
		t.Fatalf("valid projection rejected: %v", err)
	}
	manifest.ContentCommit = "different"
	if err := validateDatabase(path, manifest); err == nil {
		t.Fatal("expected mismatched manifest to be rejected")
	}
}

func TestReconcileMediaDeletesObsoleteFilesAndValidatesGeneration(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "keep.png"), []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "delete.png"), []byte("delete"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := reconcileMedia(root, map[string]string{"keep.png": fnvHash([]byte("keep"))}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "delete.png")); !os.IsNotExist(err) {
		t.Fatalf("obsolete media still exists: %v", err)
	}
}

func TestReconcileMediaRequestsOnlyFilesWhoseHashDoesNotMatch(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "changed.png"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	err := reconcileMedia(root, map[string]string{
		"changed.png": fnvHash([]byte("new")),
		"missing.png": fnvHash([]byte("missing")),
	})
	var required *MediaRequiredError
	if !errors.As(err, &required) {
		t.Fatalf("error = %v, want MediaRequiredError", err)
	}
	if len(required.UploadPaths) != 2 ||
		required.UploadPaths[0] != "changed.png" ||
		required.UploadPaths[1] != "missing.png" {
		t.Fatalf("upload paths = %v", required.UploadPaths)
	}
}

func TestDeploymentLifecycleRejectsSkippedAndTerminalTransitions(t *testing.T) {
	lifecycle := newDeploymentLifecycle()
	if err := lifecycle.transition(StatePromoting); err == nil {
		t.Fatal("expected receiving -> promoting to be rejected")
	}
	for _, state := range []State{
		StateValidated,
		StatePromoting,
		StateVerifying,
		StateRendering,
		StateComplete,
	} {
		if err := lifecycle.transition(state); err != nil {
			t.Fatalf("transition to %s: %v", state, err)
		}
	}
	if err := lifecycle.transition(StateFailed); err == nil {
		t.Fatal("expected terminal complete state to reject failure transition")
	}
}

func TestReleaseArchiveKeepsACompleteRollbackGeneration(t *testing.T) {
	root := t.TempDir()
	database := filepath.Join(root, "projection.db")
	source := filepath.Join(root, "source.tar")
	media := filepath.Join(root, "desired-media")
	if err := os.WriteFile(database, []byte("projection"), 0o600); err != nil {
		t.Fatal(err)
	}
	sourceBytes := []byte("authored source")
	if err := os.WriteFile(source, sourceBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	sourceSum := sha256.Sum256(sourceBytes)
	if err := os.MkdirAll(media, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(media, "figure.png"), []byte("figure"), 0o644); err != nil {
		t.Fatal(err)
	}
	service := &Service{config: Config{StateRoot: filepath.Join(root, "releases")}}
	manifest := &Manifest{
		Version:       BundleVersion,
		SchemaVersion: ProjectionSchemaVersion,
		ContentCommit: "commit-1",
		ContentHash:   "hash-1",
		DatabaseSHA:   "sha-1",
		SourceSHA:     hex.EncodeToString(sourceSum[:]),
		Media:         []MediaAsset{},
	}
	commit, abort, err := service.stageReleaseArchive(database, source, media, manifest)
	if err != nil {
		t.Fatal(err)
	}
	defer abort()
	if err := commit(); err != nil {
		t.Fatal(err)
	}
	archives, err := releaseArchivePaths(service.config.StateRoot)
	if err != nil {
		t.Fatal(err)
	}
	if len(archives) != 1 || filepath.Base(archives[0]) != "commit-1" {
		t.Fatalf("archives = %v", archives)
	}
	for _, relative := range []string{"complete", "manifest.json", "portfolio.db", "source.tar", "media/figure.png"} {
		if _, err := os.Stat(filepath.Join(archives[0], relative)); err != nil {
			t.Fatalf("archive missing %s: %v", relative, err)
		}
	}
}

func TestCurrentSourceReturnsSnapshotBoundToLiveCommit(t *testing.T) {
	root := t.TempDir()
	commit := "0123456789abcdef0123456789abcdef01234567"
	release := filepath.Join(root, commit)
	if err := os.MkdirAll(release, 0o750); err != nil {
		t.Fatal(err)
	}
	source := sourceTar(t, map[string]string{
		"SCHEMA.md":                 "schema\n",
		"resources/blog/post/en.md": "body\n",
	})
	sum := sha256.Sum256(source)
	manifest := &Manifest{
		Version:       BundleVersion,
		SchemaVersion: ProjectionSchemaVersion,
		ContentCommit: commit,
		ContentHash:   "content-hash",
		DatabaseSHA:   strings.Repeat("a", 64),
		SourceSHA:     hex.EncodeToString(sum[:]),
		Media:         []MediaAsset{},
	}
	encoded, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(release, "manifest.json"), encoded, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(release, "source.tar"), source, 0o600); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE sync_meta (content_hash TEXT, content_commit TEXT, generated_at TEXT);
		INSERT INTO sync_meta VALUES ('content-hash', ?, '2026-08-26T00:00:00Z')`, commit); err != nil {
		t.Fatal(err)
	}
	service := NewService(Config{StateRoot: root}, db)
	recovered, err := service.CurrentSource(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if recovered.ContentCommit != commit || recovered.SourceSHA != manifest.SourceSHA || !bytes.Equal(recovered.Bytes, source) {
		t.Fatalf("recovered source = %#v", recovered)
	}
}

func TestValidateSourceSnapshotRejectsPrivateNamespace(t *testing.T) {
	root := t.TempDir()
	source := sourceTar(t, map[string]string{
		"SCHEMA.md":              "schema\n",
		"resources/keep.md":      "public\n",
		"agent/notes/private.md": "secret\n",
	})
	path := filepath.Join(root, "source.tar")
	if err := os.WriteFile(path, source, 0o600); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(source)
	manifest := &Manifest{SourceSHA: hex.EncodeToString(sum[:])}
	if err := validateSourceSnapshot(path, manifest); err == nil || !strings.Contains(err.Error(), "private path") {
		t.Fatalf("error = %v, want private-path rejection", err)
	}
}

func TestValidateSourceSnapshotAcceptsGitArchiveGlobalHeader(t *testing.T) {
	root := t.TempDir()
	var output bytes.Buffer
	archive := tar.NewWriter(&output)
	if err := archive.WriteHeader(&tar.Header{
		Typeflag:   tar.TypeXGlobalHeader,
		Name:       "pax_global_header",
		PAXRecords: map[string]string{"comment": strings.Repeat("0", 40)},
		Format:     tar.FormatPAX,
	}); err != nil {
		t.Fatal(err)
	}
	for name, body := range map[string]string{
		"SCHEMA.md":         "schema\n",
		"resources/keep.md": "public\n",
	} {
		data := []byte(body)
		if err := archive.WriteHeader(&tar.Header{Name: name, Mode: 0o600, Size: int64(len(data))}); err != nil {
			t.Fatal(err)
		}
		if _, err := archive.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	source := output.Bytes()
	path := filepath.Join(root, "source.tar")
	if err := os.WriteFile(path, source, 0o600); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(source)
	manifest := &Manifest{SourceSHA: hex.EncodeToString(sum[:])}
	if err := validateSourceSnapshot(path, manifest); err != nil {
		t.Fatalf("git-archive pax metadata must validate: %v", err)
	}
}

func sourceTar(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var output bytes.Buffer
	archive := tar.NewWriter(&output)
	for name, body := range files {
		data := []byte(body)
		if err := archive.WriteHeader(&tar.Header{Name: name, Mode: 0o600, Size: int64(len(data))}); err != nil {
			t.Fatal(err)
		}
		if _, err := archive.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func fnvHash(data []byte) string {
	var hash uint64 = 0xcbf29ce484222325
	for _, value := range data {
		hash ^= uint64(value)
		hash *= 0x100000001b3
	}
	return fmt.Sprintf("%016x", hash)
}
