package traffic

import (
	"testing"
	"time"
)

func TestObservationDeduplicatorUsesRequestIdentity(t *testing.T) {
	deduplicator := NewObservationDeduplicator(time.Minute, 8)

	if !deduplicator.Accept("request-one") {
		t.Fatal("first observation was rejected")
	}
	if deduplicator.Accept("request-one") {
		t.Fatal("internal redirect duplicate was accepted")
	}
	if !deduplicator.Accept("request-two") {
		t.Fatal("independent request was rejected")
	}
}

func TestObservationDeduplicatorExpiresOldIdentity(t *testing.T) {
	deduplicator := NewObservationDeduplicator(time.Nanosecond, 8)

	if !deduplicator.Accept("request-one") {
		t.Fatal("first observation was rejected")
	}
	time.Sleep(time.Millisecond)
	if !deduplicator.Accept("request-one") {
		t.Fatal("expired observation was not accepted")
	}
}
