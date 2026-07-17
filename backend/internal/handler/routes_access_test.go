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

	contentStatus := privateContentStatusRoutes(nil)
	if len(contentStatus) != 1 || contentStatus[0].Path != "/content/status" {
		t.Fatalf("private content status routes = %#v", contentStatus)
	}
}
