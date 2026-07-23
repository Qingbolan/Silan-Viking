package media

import (
	"os"
	"path/filepath"
	"testing"
)

// resolveMediaPath is security-critical: it must never let a request reach a
// file outside the media root. These cases pin both the accept and reject
// behaviour.
func TestResolveMediaPath(t *testing.T) {
	root := "/data/media"

	accepted := []struct {
		in   string
		want string
	}{
		{"blog/my-post/assets/figure.png", "/data/media/blog/my-post/assets/figure.png"},
		{"episode/s/ep/assets/diagrams/flow.svg", "/data/media/episode/s/ep/assets/diagrams/flow.svg"},
		// A harmless `.` is collapsed, not rejected.
		{"blog/./x/assets/a.png", "/data/media/blog/x/assets/a.png"},
	}
	for _, c := range accepted {
		got, ok := resolveMediaPath(root, c.in)
		if !ok {
			t.Errorf("resolveMediaPath(%q) rejected a safe path", c.in)
			continue
		}
		if got != filepath.Clean(c.want) {
			t.Errorf("resolveMediaPath(%q) = %q, want %q", c.in, got, c.want)
		}
	}

	rejected := []string{
		"",                            // empty
		"/etc/passwd",                 // absolute
		"../../../etc/passwd",         // escapes via ..
		"..",                          // the parent itself
		"blog/../../../../etc/passwd", // escapes after a real segment
	}
	for _, in := range rejected {
		if _, ok := resolveMediaPath(root, in); ok {
			t.Errorf("resolveMediaPath(%q) accepted an unsafe path", in)
		}
	}
}

func TestMediaETagUsesStableFileBytes(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "asset.png")
	if err := os.WriteFile(path, []byte("image-bytes"), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	first, err := mediaETag(path)
	if err != nil {
		t.Fatalf("first mediaETag: %v", err)
	}
	second, err := mediaETag(path)
	if err != nil {
		t.Fatalf("second mediaETag: %v", err)
	}

	if first != second {
		t.Fatalf("mediaETag changed for stable bytes: %q != %q", first, second)
	}
	if first == "" || first[0] != '"' || first[len(first)-1] != '"' {
		t.Fatalf("mediaETag = %q, want quoted validator", first)
	}
}

func TestMediaCacheControlOnlyImmutableForMatchingVersion(t *testing.T) {
	etag := `"abc123"`
	if got := mediaCacheControl("abc123", etag); got != "public, max-age=31536000, immutable" {
		t.Fatalf("matching version Cache-Control = %q", got)
	}
	if got := mediaCacheControl("", etag); got != "public, max-age=3600, stale-while-revalidate=86400" {
		t.Fatalf("unversioned Cache-Control = %q", got)
	}
	if got := mediaCacheControl("other", etag); got != "public, max-age=3600, stale-while-revalidate=86400" {
		t.Fatalf("mismatched version Cache-Control = %q", got)
	}
}

func TestMatchesIfNoneMatch(t *testing.T) {
	etag := `"abc123"`
	if !matchesIfNoneMatch(`"other", "abc123"`, etag) {
		t.Fatal("comma-separated If-None-Match did not match")
	}
	if !matchesIfNoneMatch("*", etag) {
		t.Fatal("wildcard If-None-Match did not match")
	}
	if matchesIfNoneMatch(`"other"`, etag) {
		t.Fatal("unrelated If-None-Match matched")
	}
}
