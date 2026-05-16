package auth

import (
	"context"

	"silan-backend/internal/auth"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GoogleVerifyLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Verify Google ID token and upsert identity
func NewGoogleVerifyLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GoogleVerifyLogic {
	return &GoogleVerifyLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GoogleVerifyLogic) GoogleVerify(req *types.GoogleVerifyRequest) (resp *types.GoogleVerifyResponse, err error) {
	// Verify the token against Google's public keys — never trust it unverified.
	claims, err := auth.VerifyGoogleIDToken(l.ctx, req.IdToken, l.svcCtx.Config.Auth.GoogleClientID)
	if err != nil {
		l.Errorf("Google token verification failed: %v", err)
		return nil, err
	}

	identity, err := auth.UpsertGoogleIdentity(l.ctx, l.svcCtx.DB, claims)
	if err != nil {
		l.Errorf("Failed to upsert user identity: %v", err)
		return nil, err
	}

	return &types.GoogleVerifyResponse{
		ID:        identity.ID,
		Email:     identity.Email,
		Name:      identity.DisplayName,
		AvatarURL: identity.AvatarURL,
		Provider:  identity.Provider,
		Verified:  identity.Verified,
	}, nil
}
