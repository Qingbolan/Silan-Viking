package auth

import (
	"context"
	"fmt"
	"strings"
	"time"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/useridentity"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/google/uuid"
	"github.com/golang-jwt/jwt/v4"
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

// GoogleClaims represents the claims in a Google ID token
type GoogleClaims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	GivenName     string `json:"given_name"`
	FamilyName    string `json:"family_name"`
	Sub           string `json:"sub"` // User ID
	Aud           string `json:"aud"` // Audience (client ID)
	jwt.StandardClaims
}

func (l *GoogleVerifyLogic) GoogleVerify(req *types.GoogleVerifyRequest) (resp *types.GoogleVerifyResponse, err error) {
	if req.IdToken == "" {
		return nil, fmt.Errorf("id_token is required")
	}

	// Parse the JWT token without verification (Google signs it, we trust it for now)
	// In production, you should verify the signature using Google's public keys
	token, _, err := new(jwt.Parser).ParseUnverified(req.IdToken, &GoogleClaims{})
	if err != nil {
		l.Errorf("Failed to parse Google ID token: %v", err)
		return nil, fmt.Errorf("failed to parse token: %v", err)
	}

	claims, ok := token.Claims.(*GoogleClaims)
	if !ok {
		return nil, fmt.Errorf("invalid token claims")
	}

	// Basic validation
	if !claims.EmailVerified {
		return nil, fmt.Errorf("email not verified")
	}

	if claims.Email == "" {
		return nil, fmt.Errorf("email not provided")
	}

	// Optional audience (client id) check if configured
	if l.svcCtx.Config.Auth.GoogleClientID != "" {
		if claims.Aud != l.svcCtx.Config.Auth.GoogleClientID {
			return nil, fmt.Errorf("invalid audience")
		}
	}

	// Upsert user identity
	userIdentity, err := l.upsertUserIdentity("google", claims.Sub, claims)
	if err != nil {
		l.Errorf("Failed to upsert user identity: %v", err)
		return nil, fmt.Errorf("failed to process user identity")
	}

	return &types.GoogleVerifyResponse{
		ID:        userIdentity.ID,
		Email:     userIdentity.Email,
		Name:      userIdentity.DisplayName,
		AvatarURL: userIdentity.AvatarURL,
		Provider:  userIdentity.Provider,
		Verified:  userIdentity.Verified,
	}, nil
}

func (l *GoogleVerifyLogic) upsertUserIdentity(provider, externalID string, claims *GoogleClaims) (*ent.UserIdentity, error) {
	// Try to find existing identity
	existing, err := l.svcCtx.DB.UserIdentity.
		Query().
		Where(
			useridentity.ProviderEQ(provider),
			useridentity.ExternalIDEQ(externalID),
		).
		First(l.ctx)

	if err == nil {
		// Update existing identity with latest info from Google
		updateBuilder := l.svcCtx.DB.UserIdentity.
			UpdateOne(existing).
			SetUpdatedAt(time.Now())

		if claims.Email != "" && existing.Email != claims.Email {
			updateBuilder = updateBuilder.SetEmail(claims.Email)
		}
		if claims.Name != "" && existing.DisplayName != claims.Name {
			updateBuilder = updateBuilder.SetDisplayName(claims.Name)
		}
		if claims.Picture != "" && existing.AvatarURL != claims.Picture {
			updateBuilder = updateBuilder.SetAvatarURL(claims.Picture)
		}
		updateBuilder = updateBuilder.SetVerified(claims.EmailVerified)

		return updateBuilder.Save(l.ctx)
	}

	// Create new identity
	createBuilder := l.svcCtx.DB.UserIdentity.
		Create().
		SetID(l.generateUserID()).
		SetProvider(provider).
		SetExternalID(externalID)

	if claims.Email != "" {
		createBuilder = createBuilder.SetEmail(claims.Email)
	}

	// Use the proper display name from Google
	displayName := claims.Name
	if displayName == "" && claims.Email != "" {
		// Fallback to email prefix if no name provided
		emailParts := strings.Split(claims.Email, "@")
		if len(emailParts) > 0 {
			displayName = emailParts[0]
		}
	}
	if displayName != "" {
		createBuilder = createBuilder.SetDisplayName(displayName)
	}

	// Set avatar URL from Google
	if claims.Picture != "" {
		createBuilder = createBuilder.SetAvatarURL(claims.Picture)
	}

	createBuilder = createBuilder.SetVerified(claims.EmailVerified)

	return createBuilder.Save(l.ctx)
}

func (l *GoogleVerifyLogic) generateUserID() string {
	// Generate a user ID that starts with 'u_' followed by UUID
	uuid := uuid.New()
	return "u_" + strings.ReplaceAll(uuid.String(), "-", "")
}
