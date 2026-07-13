package types

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestCommentResponsesExposeCapabilityWithoutIdentity(t *testing.T) {
	responses := []any{
		BlogCommentData{ID: "blog-comment", CanDelete: true},
		IdeaCommentData{ID: "idea-comment", CanDelete: true},
		ProjectCommentData{ID: "project-comment", CanDelete: true},
	}
	for _, response := range responses {
		payload, err := json.Marshal(response)
		if err != nil {
			t.Fatalf("marshal %T: %v", response, err)
		}
		encoded := string(payload)
		if strings.Contains(encoded, "user_identity_id") {
			t.Fatalf("%T leaked identity: %s", response, encoded)
		}
		if !strings.Contains(encoded, `"can_delete":true`) {
			t.Fatalf("%T omitted delete capability: %s", response, encoded)
		}
	}
}

func TestPublicRequestCannotDeclareAuthenticatedIdentity(t *testing.T) {
	var request CreateProjectCommentRequest
	if err := json.Unmarshal([]byte(`{"content":"hello","user_identity_id":"forged"}`), &request); err != nil {
		t.Fatal(err)
	}
	if request.AuthenticatedUserID != "" {
		t.Fatalf("untrusted identity was accepted: %q", request.AuthenticatedUserID)
	}
}
