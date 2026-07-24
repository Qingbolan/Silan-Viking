package commentruntime

import (
	"context"
	"testing"

	"silan-backend/internal/ent/comment"
	"silan-backend/internal/ent/enttest"

	_ "github.com/mattn/go-sqlite3"
)

func TestDefaultGuestNameUsesStableCoarseLocation(t *testing.T) {
	first := DefaultGuestName("sg", "01", "browser-123")
	second := DefaultGuestName("SG", "01", "browser-123")
	if first != second {
		t.Fatalf("guest name is not stable: %q != %q", first, second)
	}
	if first != "guest-id<SG/01/0M6YU3M>" {
		t.Fatalf("DefaultGuestName() = %q", first)
	}
}

func TestResolveAuthorDoesNotRequireGuestEmail(t *testing.T) {
	client := enttest.Open(t, "sqlite3", "file:comment-author?mode=memory&cache=shared&_fk=1")
	defer client.Close()

	author, err := ResolveAuthor(
		context.Background(),
		client,
		"",
		"",
		"browser-123",
		"SG",
		"01",
	)
	if err != nil {
		t.Fatal(err)
	}
	if author.Email != "" {
		t.Fatalf("guest email = %q, want empty", author.Email)
	}
	if author.Name != "guest-id<SG/01/0M6YU3M>" {
		t.Fatalf("guest name = %q", author.Name)
	}
	if _, err := client.Comment.Create().
		SetEntityType(comment.EntityTypeBlog).
		SetEntityID("post-1").
		SetAuthorName(author.Name).
		SetContent("hello").
		Save(context.Background()); err != nil {
		t.Fatalf("persist guest without email: %v", err)
	}
}

func TestResolveAuthorPreservesEditableGuestName(t *testing.T) {
	client := enttest.Open(t, "sqlite3", "file:comment-author-custom?mode=memory&cache=shared&_fk=1")
	defer client.Close()

	author, err := ResolveAuthor(
		context.Background(),
		client,
		"",
		"  Atlas  ",
		"browser-123",
		"SG",
		"01",
	)
	if err != nil {
		t.Fatal(err)
	}
	if author.Name != "Atlas" {
		t.Fatalf("guest name = %q, want Atlas", author.Name)
	}
}

func TestResolveAuthorEnrichesClientFallbackGuestName(t *testing.T) {
	client := enttest.Open(t, "sqlite3", "file:comment-author-fallback?mode=memory&cache=shared&_fk=1")
	defer client.Close()

	author, err := ResolveAuthor(
		context.Background(),
		client,
		"",
		"guest-id<XX/NA/0M6YU3M>",
		"browser-123",
		"CN",
		"BJ",
	)
	if err != nil {
		t.Fatal(err)
	}
	if author.Name != "guest-id<CN/BJ/0M6YU3M>" {
		t.Fatalf("guest name = %q", author.Name)
	}
}
