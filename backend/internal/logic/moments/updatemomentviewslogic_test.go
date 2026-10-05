package moments

import (
	"context"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/ent/moment"
	"silan-backend/internal/logic/stats"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

func TestMomentViewsReachStatsSnapshot(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1")
	defer client.Close()
	service := &svc.ServiceContext{DB: client}
	client.Moment.Create().SetID("moment-video").SetSlug("the-introduction-video-of-easynet-run-grq9vwej").SetVisibility(moment.VisibilityPublic).SaveX(ctx)
	logic := NewUpdateMomentViewsLogic(ctx, service)
	request := types.UpdateBlogViewsRequest{ID: "moment-video", Fingerprint: "reader-one", UserAgentFull: "Mozilla/5.0", Referrer: "https://example.com/", LandingURL: "https://silan.tech/moments/the-introduction-video-of-easynet-run-grq9vwej/"}
	for i := 0; i < 2; i++ {
		if err := logic.UpdateMomentViews(&request); err != nil {
			t.Fatal(err)
		}
	}
	row := client.ContentInteraction.Query().OnlyX(ctx)
	if row.EntityID != request.ID || string(row.EntityType) != "moment" || row.LandingURL == nil || *row.LandingURL != request.LandingURL || row.Referrer == nil || *row.Referrer != request.Referrer {
		t.Fatalf("incorrect observation: %+v", row)
	}
	snapshot, err := stats.NewStatsLogic(ctx, service).Snapshot(&types.StatsSnapshotRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Items) != 1 || snapshot.Items[0].Stats.Views != 1 || snapshot.Items[0].Stats.EntityType != "moment" {
		t.Fatalf("incorrect desktop snapshot: %+v", snapshot)
	}
	request.Fingerprint = "reader-two"
	if err := logic.UpdateMomentViews(&request); err != nil {
		t.Fatal(err)
	}
	if count := client.ContentInteraction.Query().CountX(ctx); count != 2 {
		t.Fatalf("got %d views", count)
	}
	client.Moment.UpdateOneID(request.ID).SetVisibility(moment.VisibilityPrivate).SaveX(ctx)
	if err := logic.UpdateMomentViews(&request); err == nil {
		t.Fatal("private moment must not record a view")
	}
	request.ID = "missing"
	if err := logic.UpdateMomentViews(&request); err == nil {
		t.Fatal("missing moment must not record a view")
	}
	if count := client.ContentInteraction.Query().CountX(ctx); count != 2 {
		t.Fatalf("invalid requests created views: %d", count)
	}
}
