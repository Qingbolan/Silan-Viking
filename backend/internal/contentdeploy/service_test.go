package contentdeploy

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
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

func fnvHash(data []byte) string {
	var hash uint64 = 0xcbf29ce484222325
	for _, value := range data {
		hash ^= uint64(value)
		hash *= 0x100000001b3
	}
	return fmt.Sprintf("%016x", hash)
}
