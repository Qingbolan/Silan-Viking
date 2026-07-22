package projects

import (
	"context"
	"database/sql"
	"strings"

	"silan-backend/internal/svc"
)

const defaultProjectCoverSourceType = "image"

func projectCoverSourceType(ctx context.Context, svcCtx *svc.ServiceContext, projectID string) string {
	if svcCtx == nil || svcCtx.RawDB == nil || projectID == "" {
		return defaultProjectCoverSourceType
	}
	placeholder := "?"
	if svcCtx.Config.Database.Driver == "postgres" || svcCtx.Config.Database.Driver == "postgresql" {
		placeholder = "$1"
	}

	var value sql.NullString
	err := svcCtx.RawDB.QueryRowContext(
		ctx,
		"SELECT cover_source_type FROM projects WHERE id = "+placeholder,
		projectID,
	).Scan(&value)
	if err != nil || !value.Valid {
		return defaultProjectCoverSourceType
	}
	switch strings.TrimSpace(value.String) {
	case "website":
		return "website"
	default:
		return defaultProjectCoverSourceType
	}
}

func projectCoverWebsiteURL(ctx context.Context, svcCtx *svc.ServiceContext, projectID string) string {
	if svcCtx == nil || svcCtx.RawDB == nil || projectID == "" {
		return ""
	}
	placeholder := "?"
	if svcCtx.Config.Database.Driver == "postgres" || svcCtx.Config.Database.Driver == "postgresql" {
		placeholder = "$1"
	}

	var value sql.NullString
	err := svcCtx.RawDB.QueryRowContext(
		ctx,
		"SELECT cover_website_url FROM projects WHERE id = "+placeholder,
		projectID,
	).Scan(&value)
	if err != nil || !value.Valid {
		return ""
	}
	return strings.TrimSpace(value.String)
}
