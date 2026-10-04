package blog

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"sync"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"silan-backend/internal/contenttag"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// Explicit load gate keeps routine unit-test runs quick. Uses only an isolated
// local database and loopback HTTP server, never configured deployment targets.
func TestConcurrentPublicBlogHTTP(t *testing.T) {
	if os.Getenv("SILAN_TEST_HTTP_LOAD") != "1" {
		t.Skip("set SILAN_TEST_HTTP_LOAD=1 for local HTTP load verification")
	}
	db, err := sql.Open("sqlite3", "file:"+t.Name()+"?mode=memory&cache=shared&_fk=1")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(4)
	client := enttest.NewClient(t, enttest.WithOptions(ent.Driver(entsql.OpenDB(dialect.SQLite, db))))
	defer client.Close()
	ctx := context.Background()
	tx, err := client.Tx(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 1000; i++ {
		id := fmt.Sprintf("post-%04d", i)
		tx.BlogPost.Create().SetID(id).SetSlug(id).SetTitle(id).SetVisibility("public").SetPublishedAt("2026-10-04").SaveX(ctx)
	}
	tx.BlogPost.Create().SetID("private").SetSlug("private").SaveX(ctx)
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(GetBlogPostsHandler(&svc.ServiceContext{DB: client, RawDB: db, ContentTags: contenttag.NewRepository(db, "sqlite3")}))
	defer server.Close()
	transport := &http.Transport{MaxConnsPerHost: 64, MaxIdleConnsPerHost: 64}
	defer transport.CloseIdleConnections()
	httpClient := &http.Client{Transport: transport, Timeout: 10 * time.Second}
	const workers, perWorker = 64, 20
	samples := make(chan time.Duration, workers*perWorker)
	failures := make(chan error, workers)
	var wg sync.WaitGroup
	start := time.Now()
	for worker := 0; worker < workers; worker++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			for i := 0; i < perWorker; i++ {
				page := 1 + (worker+i)%10
				began := time.Now()
				response, err := httpClient.Get(fmt.Sprintf("%s?page=%d&size=10&lang=en", server.URL, page))
				if err != nil {
					failures <- err
					return
				}
				var data types.BlogListResponse
				err = json.NewDecoder(response.Body).Decode(&data)
				response.Body.Close()
				if err != nil {
					failures <- err
					return
				}
				if response.StatusCode != 200 || data.Total != 1000 || len(data.Posts) != 10 || data.Posts[0].ID != fmt.Sprintf("post-%04d", (page-1)*10) {
					failures <- fmt.Errorf("incorrect response: status=%d page=%d total=%d", response.StatusCode, page, data.Total)
					return
				}
				samples <- time.Since(began)
			}
		}(worker)
	}
	wg.Wait()
	close(failures)
	close(samples)
	for err := range failures {
		t.Error(err)
	}
	durations := make([]time.Duration, 0, workers*perWorker)
	for sample := range samples {
		durations = append(durations, sample)
	}
	if len(durations) != workers*perWorker {
		t.Fatalf("completed %d requests", len(durations))
	}
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
	stats := db.Stats()
	if stats.OpenConnections > 4 || stats.InUse != 0 {
		t.Fatalf("pool invariant: %+v", stats)
	}
	t.Logf("requests=%d concurrency=%d elapsed=%s p50=%s p95=%s p99=%s db_wait_count=%d db_wait_duration=%s", len(durations), workers, time.Since(start), durations[len(durations)/2], durations[len(durations)*95/100], durations[len(durations)*99/100], stats.WaitCount, stats.WaitDuration)
}
