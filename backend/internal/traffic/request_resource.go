package traffic

import (
	"net/url"
	"path"
	"strings"
)

// RequestResource is what a static-site request fetched. It is the single
// owner of the page / machine-file / asset distinction: crawler ingestion,
// stats projections and every client downstream of them agree because none
// of them re-derive it from URLs.
type RequestResource string

const (
	// RequestResourcePage is a human-readable document (HTML route, PDF, ...).
	RequestResourcePage RequestResource = "page"
	// RequestResourceMachineFile is a file written for crawlers and agents:
	// robots.txt, sitemaps, llms.txt, about.txt, feeds, .well-known entries.
	// Machine files are discovery evidence and stay visible.
	RequestResourceMachineFile RequestResource = "machine_file"
	// RequestResourceAsset is a rendering dependency of a page: scripts,
	// stylesheets, source maps, fonts, images, media and the bundler output
	// under /assets/. Assets are counted, never ranked as pages.
	RequestResourceAsset RequestResource = "asset"
)

var assetDirectories = []string{"/assets/", "/_next/", "/static/", "/fonts/"}

var assetExtensions = map[string]struct{}{
	".js": {}, ".mjs": {}, ".cjs": {}, ".css": {}, ".map": {}, ".wasm": {},
	".woff": {}, ".woff2": {}, ".ttf": {}, ".otf": {}, ".eot": {},
	".png": {}, ".jpg": {}, ".jpeg": {}, ".gif": {}, ".webp": {}, ".avif": {},
	".svg": {}, ".ico": {}, ".bmp": {}, ".tif": {}, ".tiff": {},
	".mp4": {}, ".webm": {}, ".mov": {}, ".mp3": {}, ".wav": {}, ".ogg": {}, ".m4a": {},
	".webmanifest": {},
}

var assetFiles = map[string]struct{}{"manifest.json": {}}

var machineExtensions = map[string]struct{}{
	".txt": {}, ".xml": {}, ".rss": {}, ".atom": {},
}

var machineFiles = map[string]struct{}{"rss": {}, "feed": {}, "atom": {}}

// ClassifyRequestResource classifies a request URI or absolute URL by its
// path. Query strings and fragments never change the class.
func ClassifyRequestResource(requestURI string) RequestResource {
	requestPath := strings.TrimSpace(requestURI)
	if parsed, err := url.Parse(requestPath); err == nil {
		requestPath = parsed.Path
	} else if cut := strings.IndexAny(requestPath, "?#"); cut >= 0 {
		requestPath = requestPath[:cut]
	}
	requestPath = strings.ToLower(requestPath)
	if !strings.HasPrefix(requestPath, "/") {
		requestPath = "/" + requestPath
	}
	if strings.HasPrefix(requestPath, "/.well-known/") {
		return RequestResourceMachineFile
	}
	name := path.Base(requestPath)
	if _, ok := machineFiles[name]; ok {
		return RequestResourceMachineFile
	}
	for _, directory := range assetDirectories {
		if strings.HasPrefix(requestPath, directory) {
			return RequestResourceAsset
		}
	}
	if _, ok := assetFiles[name]; ok {
		return RequestResourceAsset
	}
	extension := path.Ext(name)
	if _, ok := assetExtensions[extension]; ok {
		return RequestResourceAsset
	}
	if _, ok := machineExtensions[extension]; ok {
		return RequestResourceMachineFile
	}
	return RequestResourcePage
}
