package traffic

import "testing"

func TestClassifyRequestResource(t *testing.T) {
	cases := map[string]RequestResource{
		// Real Bytespider requests from 2026-10-04 that rolled up to homepage.
		"/assets/Avatar-FOGU6MOF.js":       RequestResourceAsset,
		"/assets/Badge-DAYLI8NX.js":        RequestResourceAsset,
		"/assets/BrandLoading-BQLBCP2Q.js": RequestResourceAsset,
		"/assets/Calendar-C2HKDK7Y.js":     RequestResourceAsset,
		"/Avatar-FOGU6MOF.js?v=1":          RequestResourceAsset,
		"/assets/index-D1x2Y3z4.css":       RequestResourceAsset,
		"/assets/index-D1x2Y3z4.js.map":    RequestResourceAsset,
		"/assets/fonts/inter.woff2":        RequestResourceAsset,
		"/fonts/inter.woff2":               RequestResourceAsset,
		"/avatar-icon-192.png":             RequestResourceAsset,
		"/favicon.ico":                     RequestResourceAsset,
		"/manifest.json":                   RequestResourceAsset,
		"https://silan.tech/logo.png#top":  RequestResourceAsset,

		"/robots.txt":                RequestResourceMachineFile,
		"/sitemap.xml":               RequestResourceMachineFile,
		"/llms.txt":                  RequestResourceMachineFile,
		"/about.txt":                 RequestResourceMachineFile,
		"/rss.xml":                   RequestResourceMachineFile,
		"/rss":                       RequestResourceMachineFile,
		"/.well-known/security.txt":  RequestResourceMachineFile,
		"/sitemap.xml?utm_source=ai": RequestResourceMachineFile,

		"/":                         RequestResourcePage,
		"":                          RequestResourcePage,
		"/index.html":               RequestResourcePage,
		"/blog/agent-memory":        RequestResourcePage,
		"/moments?id=memory-update": RequestResourcePage,
		"/?prompt=runtime+memory":   RequestResourcePage,
		"/projects/silan-viking/":   RequestResourcePage,
	}
	for requestURI, want := range cases {
		if got := ClassifyRequestResource(requestURI); got != want {
			t.Errorf("ClassifyRequestResource(%q) = %q, want %q", requestURI, got, want)
		}
	}
}
