// Package httpapi owns the HTTP representation of application errors.
// Logic packages return domain/storage errors; handlers translate them here
// so resource semantics stay consistent across every public detail route.
package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"net/http"

	"silan-backend/internal/ent"

	"github.com/zeromicro/go-zero/rest/httpx"
)

type problem struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Error writes a stable public error response. Unknown errors continue
// through go-zero's existing handler until the remaining business errors are
// migrated to explicit domain errors; the not-found contract is complete now.
func Error(ctx context.Context, w http.ResponseWriter, err error) {
	if ent.IsNotFound(err) || errors.Is(err, sql.ErrNoRows) {
		httpx.WriteJsonCtx(ctx, w, http.StatusNotFound, problem{
			Code:    "not_found",
			Message: "Resource not found",
		})
		return
	}

	httpx.ErrorCtx(ctx, w, err)
}
