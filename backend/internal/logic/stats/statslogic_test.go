package stats

import (
	"context"
	"fmt"
	"reflect"
	"silan-backend/internal/ent"
	"strings"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/comment"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	_ "github.com/mattn/go-sqlite3"
)

func newStatsTestContext(t *testing.T) (context.Context, *svc.ServiceContext) {
	t.Helper()
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)
	t.Cleanup(func() { _ = client.Close() })
	return ctx, &svc.ServiceContext{DB: client}
}

func TestSnapshotCarriesCompleteLikerAndModerationDetails(t *testing.T) {
	ctx, svcCtx := newStatsTestContext(t)
	const entityID = "moment-one"

	svcCtx.DB.ContentInteraction.Create().
		SetID("like-one").
		SetEntityType(contentinteraction.EntityTypeMoment).
		SetEntityID(entityID).
		SetKind(contentinteraction.KindLike).
		SetFingerprint("reader-one").
		SetCountryCode("SG").
		SaveX(ctx)
	svcCtx.DB.ContentInteraction.Create().
		SetID("view-without-discussion").
		SetEntityType(contentinteraction.EntityTypeMoment).
		SetEntityID("moment-without-discussion").
		SetKind(contentinteraction.KindView).
		SaveX(ctx)

	svcCtx.DB.Comment.Create().
		SetID("comment-public").
		SetEntityType(comment.EntityTypeMoment).
		SetEntityID(entityID).
		SetAuthorName("Ari").
		SetContent("Public root").
		SetIsApproved(true).
		SaveX(ctx)
	svcCtx.DB.Comment.Create().
		SetID("comment-hidden").
		SetEntityType(comment.EntityTypeMoment).
		SetEntityID(entityID).
		SetParentID("comment-public").
		SetAuthorName("Mei").
		SetContent("Hidden reply").
		SetIsApproved(false).
		SaveX(ctx)

	snapshot, err := NewStatsLogic(ctx, svcCtx).Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if !snapshot.InteractionDetailsComplete {
		t.Fatal("snapshot must explicitly declare complete interaction details")
	}
	if len(snapshot.Items) != 2 {
		t.Fatalf("items = %d, want 2", len(snapshot.Items))
	}
	items := make(map[string]types.StatsSnapshotItem, len(snapshot.Items))
	for _, item := range snapshot.Items {
		items[item.Stats.EntityID] = item
	}
	item := items[entityID]
	if item.Stats.Likes != 1 || item.Stats.Comments != 1 {
		t.Fatalf("public stats = %+v, want one like and one public comment", item.Stats)
	}
	if len(item.Likers) != 1 || item.Likers[0].CountryCode != "SG" {
		t.Fatalf("likers = %+v, want the reader identity projection", item.Likers)
	}
	if len(item.Comments) != 1 || len(item.Comments[0].Replies) != 1 {
		t.Fatalf("comments = %+v, want the complete moderation tree", item.Comments)
	}
	if item.Comments[0].Replies[0].IsPublic {
		t.Fatal("hidden reply must retain its moderation state in the private snapshot")
	}
	if items["moment-without-discussion"].Comments == nil {
		t.Fatal("empty comment collections must encode as [] rather than null")
	}
}

// Modern interaction rows already own their geography. A refresh must not
// read historical request logs once per content item to rediscover it.
func TestVisitorLocationsSkipCompleteRowsAndDeduplicateMissingIPs(t *testing.T) {
	ctx, svcCtx := newStatsTestContext(t)
	now := time.Now().UTC()
	ip := "203.0.113.1"
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	logic := NewStatsLogic(cancelled, svcCtx)
	locations, err := logic.legacyVisitorLocations([]*ent.ContentInteraction{
		{IPAddress: &ip, CountryCode: "SG", CreatedAt: now},
	})
	if err != nil || len(locations) != 0 {
		t.Fatalf("complete geography queried the database: %v, %v", locations, err)
	}

	svcCtx.DB.RequestLog.Create().SetIP(ip).SetCountryCode("SG").SetCity("Singapore").SetCreatedAt(now).SaveX(ctx)
	rows := make([]*ent.ContentInteraction, 2000)
	for i := range rows {
		rows[i] = &ent.ContentInteraction{IPAddress: &ip, CreatedAt: now}
	}
	locations, err = NewStatsLogic(ctx, svcCtx).legacyVisitorLocations(rows)
	if err != nil || locations[ip].City != "Singapore" {
		t.Fatalf("repeated missing IP lookup: %v, %v", locations, err)
	}
}

func TestSnapshotCountriesUseLatestEligibleVisitPerIP(t *testing.T) {
	ctx, svcCtx := newStatsTestContext(t)
	now := time.Now().UTC()
	add := func(ip, country, city, path string, bot bool, stamp time.Time) {
		svcCtx.DB.RequestLog.Create().SetIP(ip).SetCountryCode(country).
			SetCity(city).SetPath(path).SetIsBot(bot).SetCreatedAt(stamp).SaveX(ctx)
	}
	add("a", "US", "Old", "/article", false, now.Add(-time.Hour))
	add("a", "SG", "Singapore", "/article", false, now)
	add("a", "FR", "Stats", "/api/v1/stats/snapshot", false, now.Add(time.Hour))
	add("a", "DE", "Bot", "/article", true, now.Add(time.Hour))
	add("a", "", "Unknown", "/article", false, now.Add(time.Hour))
	add("b", "SG", "Tie loser", "/article", false, now)
	add("b", "SG", "Singapore", "/article", false, now)
	add("c", "US", "Stats only", "/api/v1/stats", false, now)

	logic := NewStatsLogic(ctx, svcCtx)
	logs, err := logic.latestCountryLogs()
	if err != nil || len(logs) != 2 {
		t.Fatalf("latest rows = %v, error = %v", logs, err)
	}
	snapshot, err := logic.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Countries) != 1 || snapshot.Countries[0].City != "Singapore" ||
		snapshot.Countries[0].Count != 2 || strings.Join(snapshot.Countries[0].IPAddresses, ",") != "a,b" {
		t.Fatalf("countries = %+v", snapshot.Countries)
	}
}

func TestSnapshotAggregatesMatchIndividualEndpoints(t *testing.T) {
	ctx, svcCtx := newStatsTestContext(t)
	for i, kind := range []contentinteraction.Kind{contentinteraction.KindView, contentinteraction.KindLike, contentinteraction.KindView} {
		svcCtx.DB.ContentInteraction.Create().SetID(fmt.Sprintf("interaction-%d", i)).
			SetEntityType(contentinteraction.EntityTypeBlog).SetEntityID("blog-one").
			SetKind(kind).SetCountryCode("SG").SaveX(ctx)
	}
	svcCtx.DB.Comment.Create().SetID("only-comment").SetEntityType(comment.EntityTypeMoment).
		SetEntityID("comment-only").SetAuthorName("Reader").SetContent("Hello").SetIsApproved(false).SaveX(ctx)
	svcCtx.DB.Project.Create().SetID("project-one").SetSlug("project-one").SaveX(ctx)
	svcCtx.DB.ProjectLike.Create().SetProjectID("project-one").SetFingerprint("reader").SaveX(ctx)
	svcCtx.DB.ProjectView.Create().SetProjectID("project-one").SetFingerprint("reader").SaveX(ctx)
	// Mirrored content interactions must not replace project runtime counts.
	svcCtx.DB.ContentInteraction.Create().SetID("project-observation").
		SetEntityType(contentinteraction.EntityTypeProject).SetEntityID("project-one").
		SetKind(contentinteraction.KindView).SetCountryCode("SG").SaveX(ctx)
	logic := NewStatsLogic(ctx, svcCtx)
	snapshot, err := logic.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range snapshot.Items {
		req := &types.StatsRequest{EntityType: item.Stats.EntityType, EntityID: item.Stats.EntityID}
		stats, err := logic.Stats(req)
		if err != nil {
			t.Fatal(err)
		}
		visitors, err := logic.Visitors(req)
		if err != nil {
			t.Fatal(err)
		}
		crawlers, err := logic.CrawlerBreakdown(req)
		if err != nil {
			t.Fatal(err)
		}
		sources, err := logic.SourceBreakdown(req)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(item.Stats, *stats) || !reflect.DeepEqual(item.Visitors, visitors.Visitors) ||
			!reflect.DeepEqual(item.Crawlers, crawlers.Items) || !reflect.DeepEqual(item.Sources, sources.Items) {
			t.Fatalf("snapshot differs from individual endpoints for %s", req.EntityID)
		}
	}
}

func TestSnapshotQueryBudgetDoesNotGrowWithAnonymousContent(t *testing.T) {
	for _, count := range []int{1, 100} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			ctx := context.Background()
			selects := 0
			client := enttest.Open(t, dialect.SQLite,
				"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
				enttest.WithOptions(ent.Debug(), ent.Log(func(args ...any) {
					if strings.Contains(fmt.Sprint(args...), "query=SELECT") {
						selects++
					}
				})))
			t.Cleanup(func() { _ = client.Close() })
			for i := 0; i < count; i++ {
				client.ContentInteraction.Create().SetID(fmt.Sprintf("like-%d", i)).
					SetEntityType(contentinteraction.EntityTypeMoment).SetEntityID(fmt.Sprintf("moment-%d", i)).
					SetKind(contentinteraction.KindLike).SetFingerprint("visitor").
					SetIPAddress("203.0.113.1").SetCountryCode("SG").SaveX(ctx)
			}
			selects = 0
			snapshot, err := NewStatsLogic(ctx, &svc.ServiceContext{DB: client}).Snapshot()
			if err != nil {
				t.Fatal(err)
			}
			if len(snapshot.Items) != count {
				t.Fatalf("items = %d, want %d", len(snapshot.Items), count)
			}
			if selects != 3 {
				t.Fatalf("snapshot issued %d SELECTs for %d items; want 3", selects, count)
			}
		})
	}
}
