package media

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/zeromicro/go-zero/rest/httpx"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// GetMediaHandler streams a binary resource file (an `assets/` image a
// content `silan://` reference was rewritten to point at) from the media
// volume. The file path arrives as the `f` query parameter — variable-depth,
// so a query parameter rather than a path segment (go-zero's router has no
// catch-all). This handler writes the file body itself instead of a JSON
// envelope; the route still runs through the Analytics middleware, so every
// fetch is recorded in `request_logs`.
func GetMediaHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.MediaRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		// Resolve the request to a real file inside the media root, and
		// prove it stays inside — a `..` segment or an absolute path must
		// not let a request escape the media directory.
		full, ok := resolveMediaPath(svcCtx.Config.MediaRoot(), req.F)
		if !ok {
			http.Error(w, "invalid media path", http.StatusBadRequest)
			return
		}

		info, err := os.Stat(full)
		if err != nil || info.IsDir() {
			http.NotFound(w, r)
			return
		}
		file, err := os.Open(full)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer file.Close()

		// `ServeContent` sets Content-Type from the extension, handles range
		// requests, and emits Last-Modified / conditional-GET headers.
		w.Header().Set("Cache-Control", "public, max-age=3600")
		http.ServeContent(w, r, info.Name(), info.ModTime(), file)
	}
}

// resolveMediaPath joins a request's `f` value onto the media root and
// verifies the result is still within that root. It returns the absolute
// path and true when the path is safe, or false when it is empty, absolute,
// or escapes the root via `..`.
func resolveMediaPath(root, rel string) (string, bool) {
	if rel == "" || strings.HasPrefix(rel, "/") {
		return "", false
	}
	// `Clean` collapses `.` / `..`; an escaping path then no longer has the
	// media root as its prefix, which the containment check below rejects.
	cleaned := filepath.Clean(rel)
	if cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(os.PathSeparator)) {
		return "", false
	}
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return "", false
	}
	full := filepath.Join(rootAbs, cleaned)
	// Final containment proof: the resolved path must sit under the root.
	if full != rootAbs && !strings.HasPrefix(full, rootAbs+string(os.PathSeparator)) {
		return "", false
	}
	return full, true
}
