package contact

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	_ "github.com/mattn/go-sqlite3"
)

func newTestLogic(t *testing.T) *MessageLogic {
	t.Helper()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)
	return NewMessageLogic(context.Background(), &svc.ServiceContext{DB: client})
}

func TestContactMessagePublicLifecycleDoesNotExposeEmail(t *testing.T) {
	logic := newTestLogic(t)

	created, err := logic.Create(&types.CreateContactMessageRequest{
		MessageType:    "job",
		AuthorName:     "Recruiter",
		AuthorEmail:    "recruiter@example.org",
		Message:        "A concrete role",
		Company:        "Example Lab",
		CompanyEmail:   "recruiter@example.org",
		Position:       "Systems Engineer",
		RecruiterName:  "Recruiter",
		RecruiterTitle: "Talent Partner",
		IsPublic:       true,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	listed, err := logic.ListPublic()
	if err != nil {
		t.Fatalf("ListPublic: %v", err)
	}
	if len(listed.Items) != 1 || listed.Items[0].ID != created.ID {
		t.Fatalf("ListPublic() = %+v, want created public message", listed.Items)
	}

	payload, err := json.Marshal(listed)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	if strings.Contains(string(payload), "recruiter@example.org") ||
		strings.Contains(string(payload), "author_email") ||
		strings.Contains(string(payload), "company_email") {
		t.Fatalf("public response leaked a private email: %s", payload)
	}
}

func TestContactMessagePrivacyAndIdentityValidation(t *testing.T) {
	logic := newTestLogic(t)

	_, err := logic.Create(&types.CreateContactMessageRequest{
		MessageType: "general",
		AuthorName:  "Anonymous",
		AuthorEmail: "anonymous@example.org",
		Message:     "Should not be accepted without verified identity",
	})
	if err == nil {
		t.Fatal("general message without a verified identity was accepted")
	}

	_, err = logic.Create(&types.CreateContactMessageRequest{
		MessageType:  "job",
		AuthorName:   "Recruiter",
		AuthorEmail:  "recruiter@example.org",
		Message:      "Private role",
		Company:      "Example Lab",
		CompanyEmail: "recruiter@example.org",
		Position:     "Systems Engineer",
		IsPublic:     false,
	})
	if err != nil {
		t.Fatalf("Create private job message: %v", err)
	}

	listed, err := logic.ListPublic()
	if err != nil {
		t.Fatalf("ListPublic: %v", err)
	}
	if len(listed.Items) != 0 {
		t.Fatalf("private message appeared publicly: %+v", listed.Items)
	}
}

func TestContactMessageRejectsConsumerEmailAtTheAPI(t *testing.T) {
	logic := newTestLogic(t)
	_, err := logic.Create(&types.CreateContactMessageRequest{
		MessageType:   "job",
		AuthorName:    "Recruiter",
		AuthorEmail:   "person@gmail.com",
		Message:       "A role",
		Company:       "Example Lab",
		CompanyEmail:  "person@gmail.com",
		Position:      "Systems Engineer",
		RecruiterName: "Recruiter",
	})
	if err == nil {
		t.Fatal("consumer email bypassed the company-email API policy")
	}
}
