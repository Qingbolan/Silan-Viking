package resume

import (
	"context"

	"silan-backend/internal/ent/sociallink"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetPersonalInfoLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get personal information
func NewGetPersonalInfoLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetPersonalInfoLogic {
	return &GetPersonalInfoLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetPersonalInfoLogic) GetPersonalInfo(req *types.PersonalInfoRequest) (resp *types.PersonalInfo, err error) {
	personalInfo, err := l.svcCtx.DB.PersonalInfo.Query().WithUser().First(l.ctx)
	if err != nil {
		return nil, err
	}

	user := personalInfo.Edges.User
	socialLinks, err := l.svcCtx.DB.SocialLink.Query().Where(
		sociallink.HasPersonalInfoWith(),
	).All(l.ctx)
	if err != nil {
		return nil, err
	}

	var socialLinksResp []types.SocialLink
	for _, link := range socialLinks {
		socialLinksResp = append(socialLinksResp, types.SocialLink{
			ID:          link.ID.String(),
			Platform:    link.Platform,
			URL:         link.URL,
			DisplayName: link.DisplayName,
			IsActive:    link.IsActive,
			SortOrder:   link.SortOrder,
		})
	}

	return &types.PersonalInfo{
		ID:            personalInfo.ID.String(),
		UserID:        user.ID.String(),
		FullName:      user.FirstName + " " + user.LastName,
		Title:         personalInfo.Title,
		CurrentStatus: personalInfo.CurrentStatus,
		Phone:         personalInfo.Phone,
		Email:         personalInfo.Email,
		Location:      personalInfo.Location,
		Website:       personalInfo.Website,
		AvatarURL:     user.AvatarURL,
		IsPrimary:     true,
		SocialLinks:   socialLinksResp,
		CreatedAt:     personalInfo.CreatedAt.Format("2006-01-02 15:04:05"),
		UpdatedAt:     personalInfo.UpdatedAt.Format("2006-01-02 15:04:05"),
	}, nil
}
