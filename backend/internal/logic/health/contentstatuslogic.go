package health

import (
	"context"
	"fmt"
	"os"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// ContentStatus reports the atomic deployment provenance stamped by promote.
func ContentStatus(ctx context.Context, svcCtx *svc.ServiceContext) (*types.ContentStatusResponse, error) {
	var contentHash, contentCommit, generatedAt string
	err := svcCtx.RawDB.QueryRowContext(
		ctx,
		"SELECT content_hash, content_commit, generated_at FROM sync_meta LIMIT 1",
	).Scan(&contentHash, &contentCommit, &generatedAt)
	if err != nil {
		return nil, fmt.Errorf("read deployed content provenance: %w", err)
	}
	info, mediaErr := os.Stat(svcCtx.Config.MediaRoot())
	return &types.ContentStatusResponse{
		Health:        "ok",
		ContentHash:   contentHash,
		ContentCommit: contentCommit,
		GeneratedAt:   generatedAt,
		MediaRootOK:   mediaErr == nil && info.IsDir(),
	}, nil
}
