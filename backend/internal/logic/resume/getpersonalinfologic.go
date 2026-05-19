package resume

import (
	"context"

	"silan-backend/internal/ent"
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
	personalInfo, err := l.svcCtx.DB.PersonalInfo.Query().
		WithTranslations().
		First(l.ctx)
	if err != nil {
		return nil, err
	}

	socialLinks, err := l.svcCtx.DB.SocialLink.Query().Where(
		sociallink.HasPersonalInfoWith(),
	).All(l.ctx)
	if err != nil {
		return nil, err
	}

	var socialLinksResp []types.SocialLink
	for _, link := range socialLinks {
		socialLinksResp = append(socialLinksResp, types.SocialLink{
			ID:          link.ID,
			Platform:    link.Platform,
			URL:         link.URL,
			DisplayName: link.DisplayName,
			IsActive:    link.IsActive,
			SortOrder:   link.SortOrder,
		})
	}

	fullName := personalInfo.FullName
	title := personalInfo.Title
	currentStatus := personalInfo.CurrentStatus
	location := personalInfo.Location
	if translation := localizedPersonalInfo(personalInfo.Edges.Translations, req.Language); translation != nil {
		if translation.FullName != "" {
			fullName = translation.FullName
		}
		if translation.Title != "" {
			title = translation.Title
		}
		if translation.CurrentStatus != "" {
			currentStatus = translation.CurrentStatus
		}
		if translation.Location != "" {
			location = translation.Location
		}
	}

	// Single-owner system: no separate user. The avatar is a field of
	// `personal_info` itself; there is no per-item user id.
	var userID string
	avatarURL := personalInfo.AvatarURL

	return &types.PersonalInfo{
		ID:            personalInfo.ID,
		UserID:        userID,
		FullName:      fullName,
		Title:         title,
		CurrentStatus: currentStatus,
		Phone:         personalInfo.Phone,
		Email:         personalInfo.Email,
		Location:      location,
		Website:       personalInfo.Website,
		AvatarURL:     avatarURL,
		IsPrimary:     true,
		SocialLinks:   socialLinksResp,
		CreatedAt:     personalInfo.CreatedAt.Format("2006-01-02 15:04:05"),
		UpdatedAt:     personalInfo.UpdatedAt.Format("2006-01-02 15:04:05"),
	}, nil
}

// localizedPersonalInfo selects the best personal_info translation for a
// language: the requested language, then "en", then the first available.
// The content engine leaves the main personal_info row's full_name/title
// empty, so the detail endpoint resolves them from this translation.
func localizedPersonalInfo(translations []*ent.PersonalInfoTranslation, language string) *ent.PersonalInfoTranslation {
	if language == "" {
		language = "en"
	}
	by := func(code string) *ent.PersonalInfoTranslation {
		for _, translation := range translations {
			if translation.LanguageCode == code {
				return translation
			}
		}
		return nil
	}
	if t := by(language); t != nil {
		return t
	}
	if t := by("en"); t != nil {
		return t
	}
	if len(translations) > 0 {
		return translations[0]
	}
	return nil
}
