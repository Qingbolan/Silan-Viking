package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"silan-backend/internal/ent"
)

func TestErrorMapsNotFoundCauses(t *testing.T) {
	tests := []struct {
		name string
		err  error
	}{
		{name: "ent", err: &ent.NotFoundError{}},
		{name: "wrapped ent", err: errors.Join(errors.New("query failed"), &ent.NotFoundError{})},
		{name: "sql", err: sql.ErrNoRows},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			Error(context.Background(), recorder, test.err)

			if recorder.Code != http.StatusNotFound {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotFound)
			}
			if body := recorder.Body.String(); !strings.Contains(body, `"code":"not_found"`) {
				t.Fatalf("body = %q, want stable not_found problem", body)
			}
		})
	}
}

func TestErrorPreservesExistingHandlingForOtherErrors(t *testing.T) {
	recorder := httptest.NewRecorder()
	Error(context.Background(), recorder, errors.New("invalid request"))

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
}
