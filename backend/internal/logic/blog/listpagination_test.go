package blog

import (
	"silan-backend/internal/types"
	"testing"
)

func TestBlogListPaginationStableAndBounded(t *testing.T) {
	ctx, svc := newBlogEngagementTestContext(t)
	for _, id := range []string{"a", "b", "c"} {
		svc.DB.BlogPost.Create().SetID(id).SetSlug(id).SetVisibility("public").SaveX(ctx)
	}
	svc.DB.BlogPost.Create().SetID("private").SetSlug("private").SaveX(ctx)
	logic := NewGetBlogPostsLogic(ctx, svc)
	for _, tc := range []struct {
		page, size int
		ids        []string
	}{
		{1, 2, []string{"a", "b"}}, {2, 2, []string{"blog-one", "c"}}, {3, 2, nil}, {int(^uint(0) >> 1), 2, nil},
	} {
		got, err := logic.GetBlogPosts(&types.BlogListRequest{Page: tc.page, Size: tc.size})
		if err != nil {
			t.Fatal(err)
		}
		if got.Total != 4 || got.TotalPages != 2 || len(got.Posts) != len(tc.ids) {
			t.Fatalf("page %d: %+v", tc.page, got)
		}
		for i, id := range tc.ids {
			if got.Posts[i].ID != id || got.Posts[i].Tags == nil {
				t.Fatalf("page %d: %+v", tc.page, got.Posts)
			}
		}
	}
}
