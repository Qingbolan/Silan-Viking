package commentruntime

import (
	"testing"

	"silan-backend/internal/ent"
)

func TestActorCanDeleteByVerifiedIdentity(t *testing.T) {
	actor := NewActor("identity-one", "different-browser")
	comment := &ent.Comment{UserIdentityID: "identity-one", UserAgent: "fp:original-browser | Safari"}
	if !actor.CanDelete(comment) {
		t.Fatal("verified owner was not authorized")
	}
}

func TestActorCanDeleteByExactAnonymousFingerprint(t *testing.T) {
	comment := &ent.Comment{UserAgent: "fp:browser-10 | Safari"}
	if !NewActor("", "browser-10").CanDelete(comment) {
		t.Fatal("exact anonymous owner was not authorized")
	}
	if NewActor("", "browser-1").CanDelete(comment) {
		t.Fatal("fingerprint prefix was incorrectly authorized")
	}
}

func TestActorWithoutIdentityCannotDelete(t *testing.T) {
	if NewActor("", "").CanDelete(&ent.Comment{UserIdentityID: "identity-one"}) {
		t.Fatal("anonymous actor without a fingerprint was authorized")
	}
}
