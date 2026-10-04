package svc

import (
	"context"
	"sync"
	"testing"
	"time"

	"silan-backend/internal/config"
)

func TestDatabasePoolIsSharedBoundedAndClosed(t *testing.T) {
	client, db, err := openDatabase(config.DatabaseConfig{Driver: "sqlite3", Source: "file:" + t.Name() + "?mode=memory&cache=shared&_fk=1", MaxOpenConnections: 2, MaxIdleConnections: 2})
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	if err := client.Schema.Create(context.Background()); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var wg sync.WaitGroup
	errors := make(chan error, 64)
	for i := 0; i < 64; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if i%2 == 0 {
				_, err := client.BlogPost.Query().Count(ctx)
				errors <- err
			} else {
				var n int
				errors <- db.QueryRowContext(ctx, "SELECT COUNT(*) FROM blog_posts").Scan(&n)
			}
		}(i)
	}
	wg.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	stats := db.Stats()
	if stats.MaxOpenConnections != 2 || stats.OpenConnections > 2 || stats.InUse != 0 {
		t.Fatalf("unbounded or leaked pool: %+v", stats)
	}
	if err := client.Close(); err != nil {
		t.Fatal(err)
	}
	if err := db.Ping(); err == nil {
		t.Fatal("Ent closure did not close shared pool")
	}
}
