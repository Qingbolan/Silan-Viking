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
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const (
	BundleVersion           = 3
	LegacyBundleVersion     = 2
	ProjectionSchemaVersion = 2
)

type State string

const (
	StateReceiving State = "receiving"
	StateValidated State = "validated"
	StatePromoting State = "promoting"
	StateRendering State = "rendering"
	StateVerifying State = "verifying"
	StateComplete  State = "complete"
	StateFailed    State = "failed"
)

type deploymentLifecycle struct {
	state State
}

func newDeploymentLifecycle() *deploymentLifecycle {
	return &deploymentLifecycle{state: StateReceiving}
}

func (lifecycle *deploymentLifecycle) transition(next State) error {
	allowed := map[State]State{
		StateReceiving: StateValidated,
		StateValidated: StatePromoting,
		StatePromoting: StateVerifying,
		StateVerifying: StateRendering,
		StateRendering: StateComplete,
	}
	if next == StateFailed {
		if lifecycle.state == StateComplete || lifecycle.state == StateFailed {
			return fmt.Errorf("cannot fail terminal deployment state %q", lifecycle.state)
		}
		lifecycle.state = next
		return nil
	}
	if expected, ok := allowed[lifecycle.state]; !ok || expected != next {
		return fmt.Errorf("invalid deployment transition %q -> %q", lifecycle.state, next)
	}
	lifecycle.state = next
	return nil
}

type Manifest struct {
	Version       int          `json:"version"`
	SchemaVersion int          `json:"schema_version"`
	ContentCommit string       `json:"content_commit"`
	ContentHash   string       `json:"content_hash"`
	DatabaseSHA   string       `json:"database_sha256"`
	SourceSHA     string       `json:"source_sha256,omitempty"`
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
	Success         bool   `json:"success"`
	State           State  `json:"state"`
	ContentCommit   string `json:"content_commit"`
	ContentHash     string `json:"content_hash"`
	GeneratedAt     string `json:"generated_at"`
	MediaRootOK     bool   `json:"media_root_ok"`
	StaticPublished bool   `json:"static_published,omitempty"`
	StaticRelease   string `json:"static_release,omitempty"`
}

// SourceSnapshot is the authenticated recovery payload for the currently
// deployed authored revision. It contains only SCHEMA.md, .gitignore and
// resources/; the private agent/ namespace never crosses the production
// boundary.
type SourceSnapshot struct {
	ContentCommit string
	SourceSHA     string
	Bytes         []byte
}

type Config struct {
	Driver          string
	ImporterPath    string
	DatabaseEnv     string
	MediaRoot       string
	StateRoot       string
	MaxBundleBytes  int64
	StaticPublisher StaticPublisher
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
	lifecycle := newDeploymentLifecycle()
	defer func() {
		if err != nil {
			_ = lifecycle.transition(StateFailed)
		}
	}()

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
	if err := validateSourceSnapshot(filepath.Join(work, "source.tar"), manifest); err != nil {
		return nil, err
	}
	if err := lifecycle.transition(StateValidated); err != nil {
		return nil, err
	}

	return s.promotePrepared(ctx, work, manifest, lifecycle)
}

// CurrentSource returns the source archive bound to the currently deployed
// content commit. Legacy v2 releases remain valid rollback generations but
// report an explicit absence instead of pretending the projection is source.
func (s *Service) CurrentSource(ctx context.Context) (*SourceSnapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current, err := s.currentResult(ctx)
	if err != nil {
		return nil, err
	}
	release := filepath.Join(s.config.StateRoot, current.ContentCommit)
	manifest, err := readManifest(filepath.Join(release, "manifest.json"))
	if err != nil {
		return nil, fmt.Errorf("read current release archive: %w", err)
	}
	if manifest.SourceSHA == "" {
		return nil, fmt.Errorf("deployed release %s predates authored-source snapshots", current.ContentCommit)
	}
	path := filepath.Join(release, "source.tar")
	if err := validateSourceSnapshot(path, manifest); err != nil {
		return nil, fmt.Errorf("validate current source snapshot: %w", err)
	}
	bytes, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read current source snapshot: %w", err)
	}
	return &SourceSnapshot{
		ContentCommit: manifest.ContentCommit,
		SourceSHA:     manifest.SourceSHA,
		Bytes:         bytes,
	}, nil
}

// Rollback promotes the newest complete archived generation that differs from
// the current database provenance. It reuses the same validation, media,
// importer, rendering and verification state machine as a forward release.
func (s *Service) Rollback(ctx context.Context) (_ *Result, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	lifecycle := newDeploymentLifecycle()
	defer func() {
		if err != nil {
			_ = lifecycle.transition(StateFailed)
		}
	}()
	if s.config.Driver != "postgres" && s.config.Driver != "postgresql" {
		return nil, fmt.Errorf("content rollback requires PostgreSQL, configured driver is %q", s.config.Driver)
	}
	current, err := s.currentResult(ctx)
	if err != nil {
		return nil, err
	}
	archives, err := releaseArchivePaths(s.config.StateRoot)
	if err != nil {
		return nil, fmt.Errorf("list release archives: %w", err)
	}
	for _, archive := range archives {
		manifest, readErr := readManifest(filepath.Join(archive, "manifest.json"))
		if readErr != nil {
			continue
		}
		if manifest.ContentCommit == current.ContentCommit {
			continue
		}
		if validateErr := validateDatabase(filepath.Join(archive, "portfolio.db"), manifest); validateErr != nil {
			return nil, fmt.Errorf("validate rollback archive %q: %w", manifest.ContentCommit, validateErr)
		}
		if validateErr := validateSourceSnapshot(filepath.Join(archive, "source.tar"), manifest); validateErr != nil {
			return nil, fmt.Errorf("validate rollback source %q: %w", manifest.ContentCommit, validateErr)
		}
		if err := lifecycle.transition(StateValidated); err != nil {
			return nil, err
		}
		return s.promotePrepared(ctx, archive, manifest, lifecycle)
	}
	return nil, fmt.Errorf("no previous complete content release is available")
}

func (s *Service) promotePrepared(
	ctx context.Context,
	work string,
	manifest *Manifest,
	lifecycle *deploymentLifecycle,
) (_ *Result, err error) {
	databasePath := filepath.Join(work, "portfolio.db")
	sourcePath := filepath.Join(work, "source.tar")
	stagedMedia, rollbackMedia, commitMedia, finalizeMedia, err := stageMedia(work, s.config.MediaRoot, manifest.Media)
	if err != nil {
		return nil, fmt.Errorf("stage media: %w", err)
	}
	commitArchive, abortArchive, err := s.stageReleaseArchive(databasePath, sourcePath, stagedMedia, manifest)
	if err != nil {
		return nil, fmt.Errorf("stage release archive: %w", err)
	}
	defer func() {
		if err != nil {
			abortArchive()
		}
	}()
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
	if err := lifecycle.transition(StatePromoting); err != nil {
		return nil, err
	}

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
	if err := lifecycle.transition(StateVerifying); err != nil {
		return nil, err
	}
	mediaPromoted = false
	// The new database and media generation are already live. Cleanup is
	// deliberately best-effort: a historical root-owned backup must not turn
	// a successful atomic promotion into a false deployment failure.
	_ = finalizeMedia()
	if s.config.StaticPublisher != nil {
		if err := lifecycle.transition(StateRendering); err != nil {
			return nil, err
		}
		release, publishErr := s.config.StaticPublisher.Publish(ctx, ReleaseContext{
			ContentCommit: manifest.ContentCommit,
			ContentHash:   manifest.ContentHash,
			SchemaVersion: manifest.SchemaVersion,
		})
		if publishErr != nil {
			return nil, fmt.Errorf("publish static release: %w", publishErr)
		}
		result.StaticPublished = true
		result.StaticRelease = release
	} else if err := lifecycle.transition(StateRendering); err != nil {
		return nil, err
	}
	if err := commitArchive(); err != nil {
		return nil, fmt.Errorf("commit release archive: %w", err)
	}
	if err := lifecycle.transition(StateComplete); err != nil {
		return nil, err
	}
	result.State = lifecycle.state
	return result, nil
}

func (s *Service) stageReleaseArchive(
	databasePath string,
	sourcePath string,
	mediaPath string,
	manifest *Manifest,
) (func() error, func(), error) {
	if strings.TrimSpace(s.config.StateRoot) == "" {
		return nil, nil, fmt.Errorf("content release state root is required")
	}
	if err := os.MkdirAll(s.config.StateRoot, 0o750); err != nil {
		return nil, nil, err
	}
	name := manifest.ContentCommit
	next := filepath.Join(s.config.StateRoot, "."+name+".next")
	target := filepath.Join(s.config.StateRoot, name)
	_ = os.RemoveAll(next)
	if err := os.MkdirAll(next, 0o750); err != nil {
		return nil, nil, err
	}
	abort := func() { _ = os.RemoveAll(next) }
	if err := copyFile(databasePath, filepath.Join(next, "portfolio.db"), 0o600); err != nil {
		abort()
		return nil, nil, err
	}
	if manifest.SourceSHA != "" {
		if err := copyFile(sourcePath, filepath.Join(next, "source.tar"), 0o600); err != nil {
			abort()
			return nil, nil, err
		}
	}
	if err := copyTree(mediaPath, filepath.Join(next, "media")); err != nil {
		abort()
		return nil, nil, err
	}
	encoded, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		abort()
		return nil, nil, err
	}
	if err := os.WriteFile(filepath.Join(next, "manifest.json"), append(encoded, '\n'), 0o600); err != nil {
		abort()
		return nil, nil, err
	}
	commit := func() error {
		if err := os.WriteFile(filepath.Join(next, "complete"), []byte("complete\n"), 0o600); err != nil {
			return err
		}
		_ = os.RemoveAll(target)
		if err := os.Rename(next, target); err != nil {
			return err
		}
		return pruneReleaseArchives(s.config.StateRoot, 3)
	}
	return commit, abort, nil
}

func copyFile(source, destination string, mode os.FileMode) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	if err := os.MkdirAll(filepath.Dir(destination), 0o750); err != nil {
		return err
	}
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, input)
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func pruneReleaseArchives(root string, retain int) error {
	releases, err := releaseArchivePaths(root)
	if err != nil {
		return err
	}
	if len(releases) <= retain {
		return nil
	}
	for _, release := range releases[retain:] {
		if err := os.RemoveAll(release); err != nil {
			return err
		}
	}
	return nil
}

func releaseArchivePaths(root string) ([]string, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}
	type releaseEntry struct {
		path    string
		modTime time.Time
	}
	releases := make([]releaseEntry, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		path := filepath.Join(root, entry.Name())
		if _, err := os.Stat(filepath.Join(path, "complete")); err != nil {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}
		releases = append(releases, releaseEntry{path: path, modTime: info.ModTime()})
	}
	sort.Slice(releases, func(i, j int) bool {
		return releases[i].modTime.After(releases[j].modTime)
	})
	paths := make([]string, 0, len(releases))
	for _, release := range releases {
		paths = append(paths, release.path)
	}
	return paths, nil
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
	if manifest.Version != BundleVersion && manifest.Version != LegacyBundleVersion {
		return nil, fmt.Errorf("unsupported deployment bundle version %d: server supports %d and %d", manifest.Version, LegacyBundleVersion, BundleVersion)
	}
	if manifest.SchemaVersion != ProjectionSchemaVersion {
		return nil, fmt.Errorf("unsupported deployment schema version %d: server supports %d; deploy matching backend code before content", manifest.SchemaVersion, ProjectionSchemaVersion)
	}
	if !isHexDigest(manifest.ContentCommit, 40) ||
		manifest.ContentHash == "" ||
		!isHexDigest(manifest.DatabaseSHA, 64) ||
		manifest.Media == nil {
		return nil, fmt.Errorf("invalid deployment manifest")
	}
	if manifest.Version == BundleVersion && !isHexDigest(manifest.SourceSHA, 64) {
		return nil, fmt.Errorf("invalid deployment source manifest")
	}
	if manifest.Version == LegacyBundleVersion && manifest.SourceSHA != "" {
		return nil, fmt.Errorf("legacy deployment manifest cannot declare a source snapshot")
	}
	return &manifest, nil
}

func isHexDigest(value string, size int) bool {
	if len(value) != size {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
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

func validateSourceSnapshot(snapshotPath string, manifest *Manifest) error {
	if manifest.SourceSHA == "" {
		return nil
	}
	file, err := os.Open(snapshotPath)
	if err != nil {
		return fmt.Errorf("open authored-source snapshot: %w", err)
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return fmt.Errorf("hash authored-source snapshot: %w", err)
	}
	if actual := hex.EncodeToString(hash.Sum(nil)); actual != manifest.SourceSHA {
		return fmt.Errorf("authored-source snapshot checksum mismatch")
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("rewind authored-source snapshot: %w", err)
	}
	archive := tar.NewReader(file)
	hasSchema := false
	hasResources := false
	for {
		header, err := archive.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fmt.Errorf("read authored-source snapshot: %w", err)
		}
		if header.Typeflag == tar.TypeXGlobalHeader {
			// `git archive <commit>` stamps the commit id in a pax global
			// header, which Go's tar reader surfaces as a synthetic entry
			// named "pax_global_header". That is archive metadata, not an
			// authored path — the Rust packager tolerates it the same way
			// (content_recovery.rs `is_archive_metadata`).
			continue
		}
		name := path.Clean(header.Name)
		if name == "." || path.IsAbs(name) || name == ".." || strings.HasPrefix(name, "../") {
			return fmt.Errorf("authored-source snapshot contains unsafe path %q", header.Name)
		}
		allowed := name == ".gitignore" || name == "SCHEMA.md" || name == "resources" || strings.HasPrefix(name, "resources/")
		if !allowed {
			return fmt.Errorf("authored-source snapshot contains private path %q", header.Name)
		}
		switch header.Typeflag {
		case tar.TypeReg, tar.TypeRegA, tar.TypeDir:
		default:
			return fmt.Errorf("authored-source snapshot contains unsupported entry %q", header.Name)
		}
		hasSchema = hasSchema || name == "SCHEMA.md"
		hasResources = hasResources || name == "resources" || strings.HasPrefix(name, "resources/")
	}
	if !hasSchema || !hasResources {
		return fmt.Errorf("authored-source snapshot must contain SCHEMA.md and resources/")
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
