package handler

import (
	"slices"
	"testing"
)

func TestStatisticsAccessPolicyRouteSets(t *testing.T) {
	public := publicStatsRoutes(nil)
	if len(public) != 1 || public[0].Path != "/" {
		t.Fatalf("public stats routes = %#v, want only aggregate root", public)
	}

	private := privateStatsRoutes(nil)
	got := make([]string, 0, len(private))
	for _, route := range private {
		got = append(got, route.Path)
	}
	want := []string{"/bots", "/crawlers", "/snapshot", "/sources", "/visitors"}
	slices.Sort(got)
	if !slices.Equal(got, want) {
		t.Fatalf("private stats routes = %v, want %v", got, want)
	}

	contentRoutes := privateContentStatusRoutes(nil)
	got = got[:0]
	for _, route := range contentRoutes {
		got = append(got, route.Method+" "+route.Path)
	}
	want = []string{"GET /content/status", "POST /content/deploy"}
	slices.Sort(got)
	if !slices.Equal(got, want) {
		t.Fatalf("private content routes = %v, want %v", got, want)
	}
}
