package resume

import (
	"context"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/ent/partentry"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetResumeDataLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get complete resume data
func NewGetResumeDataLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetResumeDataLogic {
	return &GetResumeDataLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetResumeDataLogic) GetResumeData(req *types.ResumeRequest) (resp *types.ResumeData, err error) {
	personalInfoLogic := NewGetPersonalInfoLogic(l.ctx, l.svcCtx)
	personalInfo, err := personalInfoLogic.GetPersonalInfo(&types.PersonalInfoRequest{Language: req.Language})
	if err != nil {
		return nil, err
	}

	parts, err := l.getResumeParts(req.Language)
	if err != nil {
		return nil, err
	}

	return &types.ResumeData{
		PersonalInfo: *personalInfo,
		Parts:        parts,
	}, nil
}

func (l *GetResumeDataLogic) getResumeParts(language string) ([]types.ResumePart, error) {
	parts, err := l.svcCtx.DB.ItemPart.Query().
		Where(itempart.EntityTypeEQ(itempart.EntityTypeResume)).
		WithTranslations().
		WithEntries(func(q *ent.PartEntryQuery) {
			q.WithTranslations().Order(ent.Asc(partentry.FieldSortOrder))
		}).
		Order(ent.Asc(itempart.FieldSortOrder)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	result := make([]types.ResumePart, 0, len(parts))
	for _, part := range parts {
		body := make(map[string]string, len(part.Edges.Translations))
		for _, translation := range part.Edges.Translations {
			body[translation.LanguageCode] = translation.Body
		}

		entries := make([]types.ResumeEntry, 0, len(part.Edges.Entries))
		for _, entry := range part.Edges.Entries {
			entries = append(entries, types.ResumeEntry{
				ID:               entry.ID.String(),
				EntryID:          entry.EntryID,
				SortOrder:        entry.SortOrder,
				SharedPayload:    entry.SharedPayload,
				LocalizedPayload: localizedPartEntryPayload(entry.Edges.Translations, language, part.CanonicalLang),
			})
		}

		shape := "prose"
		if len(entries) > 0 {
			shape = "entry_list"
		}

		result = append(result, types.ResumePart{
			ID:            part.ID.String(),
			PartID:        part.PartID,
			Role:          part.Role,
			Shape:         shape,
			SortOrder:     part.SortOrder,
			CanonicalLang: part.CanonicalLang,
			Body:          body,
			Entries:       entries,
		})
	}

	return result, nil
}

func localizedPartEntryPayload(translations []*ent.PartEntryTranslation, language string, canonicalLang string) map[string]interface{} {
	if payload := findPartEntryPayload(translations, language); payload != nil {
		return payload
	}
	if payload := findPartEntryPayload(translations, canonicalLang); payload != nil {
		return payload
	}
	if len(translations) > 0 {
		return translations[0].LocalizedPayload
	}
	return map[string]interface{}{}
}

func findPartEntryPayload(translations []*ent.PartEntryTranslation, language string) map[string]interface{} {
	for _, translation := range translations {
		if translation.LanguageCode == language {
			return translation.LocalizedPayload
		}
	}
	return nil
}
