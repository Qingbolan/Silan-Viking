package blog

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// Run with: go test ./internal/logic/blog -run '^$' -bench BenchmarkBlogListPage -benchmem
// Measures the complete list handler against SQLite, excluding fixture setup.
// It is a local scale comparison, not a production network throughput claim.
func BenchmarkBlogListPage(b *testing.B) {
	for _, count := range []int{100, 10000} {
		b.Run(fmt.Sprintf("items-%d", count), func(b *testing.B) {
			ctx := context.Background()
			client := enttest.Open(b, dialect.SQLite, "file:"+strings.ReplaceAll(b.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1")
			defer client.Close()
			tx, err := client.Tx(ctx)
			if err != nil {
				b.Fatal(err)
			}
			for i := 0; i < count; i++ {
				id := fmt.Sprintf("post-%06d", i)
				tx.BlogPost.Create().SetID(id).SetSlug(id).SetTitle(id).SetContent(strings.Repeat("body ", 200)).SetVisibility("public").SetPublishedAt("2026-10-04").SaveX(ctx)
			}
			if err := tx.Commit(); err != nil {
				b.Fatal(err)
			}
			logic := NewGetBlogPostsLogic(ctx, &svc.ServiceContext{DB: client})
			request := &types.BlogListRequest{Page: 1, Size: 10, Language: "en"}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				response, err := logic.GetBlogPosts(request)
				if err != nil {
					b.Fatal(err)
				}
				if len(response.Posts) != 10 || response.Total != int64(count) {
					b.Fatalf("incorrect page: %+v", response)
				}
			}
		})
	}
}
