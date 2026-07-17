package contentdeploy

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const BundleVersion = 1

type State string

const (
	StateReceiving State = "receiving"
	StateValidated State = "validated"
	StatePromoting State = "promoting"
	StateComplete  State = "complete"
	StateFailed    State = "failed"
)

type Manifest struct {
	Version       int          `json:"version"`
	ContentCommit string       `json:"content_commit"`
	ContentHash   string       `json:"content_hash"`
	DatabaseSHA   string       `json:"database_sha256"`
	Media         []MediaAsset `json:"media"`
}

type MediaAsset struct {
	Path string `json:"path"`
	Hash string `json:"hash"`
}

type PlanResult struct {
	UploadPaths []string `json:"upload_paths"`
}

type MediaRequiredError struct {
	UploadPaths []string
}

func (e *MediaRequiredError) Error() string {
	return fmt.Sprintf("deployment needs %d changed media files", len(e.UploadPaths))
}

type Result struct {
	Success       bool   `json:"success"`
	State         State  `json:"state"`
	ContentCommit string `json:"content_commit"`
	ContentHash   string `json:"content_hash"`
	GeneratedAt   string `json:"generated_at"`
	MediaRootOK   bool   `json:"media_root_ok"`
}

type Config struct {
	Driver         string
	ImporterPath   string
	DatabaseEnv    string
	MediaRoot      string
	MaxBundleBytes int64
}

type Service struct {
	config Config
	db     *sql.DB
	mu     sync.Mutex
}

func NewService(config Config, db *sql.DB) *Service {
	return &Service{config: config, db: db}
}

func (s *Service) Deploy(ctx context.Context, body io.Reader) (_ *Result, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.config.Driver != "postgres" && s.config.Driver != "postgresql" {
		return nil, fmt.Errorf("content deployment requires PostgreSQL, configured driver is %q", s.config.Driver)
	}
	work, err := os.MkdirTemp("", "silan-content-deploy-*")
	if err != nil {
		return nil, fmt.Errorf("create deployment workspace: %w", err)
	}
	defer os.RemoveAll(work)

	limited := io.LimitReader(body, s.config.MaxBundleBytes+1)
	if err := extractBundle(limited, work, s.config.MaxBundleBytes); err != nil {
		return nil, err
	}
	manifest, err := readManifest(filepath.Join(work, "manifest.json"))
	if err != nil {
		return nil, err
	}
	databasePath := filepath.Join(work, "portfolio.db")
	if err := validateDatabase(databasePath, manifest); err != nil {
		return nil, err
	}

	stagedMedia, rollbackMedia, commitMedia, finalizeMedia, err := stageMedia(work, s.config.MediaRoot, manifest.Media)
	if err != nil {
		return nil, fmt.Errorf("stage media: %w", err)
	}
	_ = stagedMedia
	mediaPromoted := false
	defer func() {
		if err != nil && mediaPromoted {
			_ = rollbackMedia()
		}
	}()
	if err = commitMedia(); err != nil {
		return nil, fmt.Errorf("promote media: %w", err)
	}
	mediaPromoted = true

	importCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	command := exec.CommandContext(importCtx, s.config.ImporterPath,
		"--sqlite", databasePath,
		"--env-file", s.config.DatabaseEnv,
	)
	output, err := command.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("import content database: %w: %s", err, strings.TrimSpace(string(output)))
	}
	result, err := s.currentResult(ctx)
	if err != nil {
		return nil, err
	}
	if result.ContentCommit != manifest.ContentCommit || result.ContentHash != manifest.ContentHash {
		return nil, fmt.Errorf(
			"post-deploy verification mismatch: expected %s/%s, received %s/%s",
			manifest.ContentCommit, manifest.ContentHash, result.ContentCommit, result.ContentHash,
		)
	}
	mediaPromoted = false
	// The new database and media generation are already live. Cleanup is
	// deliberately best-effort: a historical root-owned backup must not turn
	// a successful atomic promotion into a false deployment failure.
	_ = finalizeMedia()
	return result, nil
}

func (s *Service) currentResult(ctx context.Context) (*Result, error) {
	var result Result
	if err := s.db.QueryRowContext(ctx,
		"SELECT content_hash, content_commit, generated_at FROM sync_meta LIMIT 1",
	).Scan(&result.ContentHash, &result.ContentCommit, &result.GeneratedAt); err != nil {
		return nil, fmt.Errorf("verify deployed provenance: %w", err)
	}
	info, mediaErr := os.Stat(s.config.MediaRoot)
	result.Success = true
	result.State = StateComplete
	result.MediaRootOK = mediaErr == nil && info.IsDir()
	return &result, nil
}

func extractBundle(reader io.Reader, destination string, maxBytes int64) error {
	gz, err := gzip.NewReader(reader)
	if err != nil {
		return fmt.Errorf("open deployment bundle: %w", err)
	}
	defer gz.Close()
	archive := tar.NewReader(gz)
	var extracted int64
	for {
		header, err := archive.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("read deployment bundle: %w", err)
		}
		clean := filepath.Clean(header.Name)
		if filepath.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
			return fmt.Errorf("deployment bundle contains unsafe path %q", header.Name)
		}
		target := filepath.Join(destination, clean)
		if !strings.HasPrefix(target, filepath.Clean(destination)+string(filepath.Separator)) {
			return fmt.Errorf("deployment bundle escapes workspace: %q", header.Name)
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			extracted += header.Size
			if extracted > maxBytes {
				return fmt.Errorf("deployment bundle exceeds %d bytes", maxBytes)
			}
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			file, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
			if err != nil {
				return err
			}
			_, copyErr := io.Copy(file, archive)
			closeErr := file.Close()
			if copyErr != nil {
				return copyErr
			}
			if closeErr != nil {
				return closeErr
			}
		default:
			return fmt.Errorf("deployment bundle contains unsupported entry %q", header.Name)
		}
	}
}

func readManifest(path string) (*Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read deployment manifest: %w", err)
	}
	var manifest Manifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("decode deployment manifest: %w", err)
	}
	if manifest.Version != BundleVersion || manifest.ContentCommit == "" || manifest.ContentHash == "" || manifest.DatabaseSHA == "" || manifest.Media == nil {
		return nil, fmt.Errorf("invalid deployment manifest")
	}
	return &manifest, nil
}

func validateDatabase(path string, manifest *Manifest) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open deployment database: %w", err)
	}
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		file.Close()
		return fmt.Errorf("hash deployment database: %w", err)
	}
	if err := file.Close(); err != nil {
		return err
	}
	if actual := hex.EncodeToString(hash.Sum(nil)); actual != manifest.DatabaseSHA {
		return fmt.Errorf("database checksum mismatch")
	}
	db, err := sql.Open("sqlite3", path+"?mode=ro")
	if err != nil {
		return fmt.Errorf("open deployment provenance: %w", err)
	}
	defer db.Close()
	var contentHash, contentCommit string
	if err := db.QueryRow("SELECT content_hash, content_commit FROM sync_meta LIMIT 1").Scan(&contentHash, &contentCommit); err != nil {
		return fmt.Errorf("read deployment provenance: %w", err)
	}
	if contentHash != manifest.ContentHash || contentCommit != manifest.ContentCommit {
		return fmt.Errorf("manifest does not match database provenance")
	}
	return nil
}

func stageMedia(work, mediaRoot string, assets []MediaAsset) (string, func() error, func() error, func() error, error) {
	source := filepath.Join(work, "media")
	info, err := os.Stat(source)
	if err != nil || !info.IsDir() {
		return "", nil, nil, nil, fmt.Errorf("bundle has no media directory")
	}
	parent := filepath.Dir(mediaRoot)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return "", nil, nil, nil, err
	}
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	next := mediaRoot + ".next." + suffix
	backup := mediaRoot + ".previous." + suffix
	_ = os.RemoveAll(next)
	if info, err := os.Stat(mediaRoot); err == nil && info.IsDir() {
		if err := copyTree(mediaRoot, next); err != nil {
			return "", nil, nil, nil, err
		}
	} else if err := os.MkdirAll(next, 0o755); err != nil {
		return "", nil, nil, nil, err
	}
	if err := copyTree(source, next); err != nil {
		return "", nil, nil, nil, err
	}
	expected, err := mediaMap(assets)
	if err != nil {
		return "", nil, nil, nil, err
	}
	if err := reconcileMedia(next, expected); err != nil {
		return "", nil, nil, nil, err
	}
	rollback := func() error {
		_ = os.RemoveAll(mediaRoot)
		if _, err := os.Stat(backup); err == nil {
			return os.Rename(backup, mediaRoot)
		}
		return nil
	}
	commit := func() error {
		if _, err := os.Stat(mediaRoot); err == nil {
			if err := os.Rename(mediaRoot, backup); err != nil {
				return err
			}
		}
		if err := os.Rename(next, mediaRoot); err != nil {
			_ = rollback()
			return err
		}
		return nil
	}
	finalize := func() error { return os.RemoveAll(backup) }
	return next, rollback, commit, finalize, nil
}

func mediaMap(assets []MediaAsset) (map[string]string, error) {
	expected := make(map[string]string, len(assets))
	for _, asset := range assets {
		clean := filepath.ToSlash(filepath.Clean(asset.Path))
		if clean == "." || filepath.IsAbs(asset.Path) || clean == ".." || strings.HasPrefix(clean, "../") {
			return nil, fmt.Errorf("invalid media path %q", asset.Path)
		}
		if len(asset.Hash) != 16 {
			return nil, fmt.Errorf("invalid media hash for %q", asset.Path)
		}
		if _, exists := expected[clean]; exists {
			return nil, fmt.Errorf("duplicate media path %q", asset.Path)
		}
		expected[clean] = asset.Hash
	}
	return expected, nil
}

func reconcileMedia(root string, expected map[string]string) error {
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		if _, keep := expected[relative]; !keep {
			return os.Remove(path)
		}
		return nil
	})
	if err != nil {
		return err
	}
	required := make([]string, 0)
	for path, expectedHash := range expected {
		actual, err := hashFile(filepath.Join(root, filepath.FromSlash(path)))
		if err != nil || actual != expectedHash {
			required = append(required, path)
		}
	}
	if len(required) > 0 {
		sort.Strings(required)
		return &MediaRequiredError{UploadPaths: required}
	}
	return nil
}

func hashFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	var hash uint64 = 0xcbf29ce484222325
	for _, value := range data {
		hash ^= uint64(value)
		hash *= 0x100000001b3
	}
	return fmt.Sprintf("%016x", hash), nil
}

func copyTree(source, destination string) error {
	return filepath.Walk(source, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("media contains symlink %q", path)
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, relative)
		if info.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("media contains unsupported file %q", path)
		}
		input, err := os.Open(path)
		if err != nil {
			return err
		}
		output, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			input.Close()
			return err
		}
		_, copyErr := io.Copy(output, input)
		inputCloseErr := input.Close()
		closeErr := output.Close()
		if copyErr != nil {
			return copyErr
		}
		if inputCloseErr != nil {
			return inputCloseErr
		}
		return closeErr
	})
}
