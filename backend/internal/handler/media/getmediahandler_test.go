package media

import (
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
