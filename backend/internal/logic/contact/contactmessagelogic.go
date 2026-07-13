package contact

import (
	"context"
	"errors"
	"net/mail"
	"strings"

	"silan-backend/internal/companyemail"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/contactmessage"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type MessageLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewMessageLogic(ctx context.Context, svcCtx *svc.ServiceContext) *MessageLogic {
	return &MessageLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func validEmail(value string) bool {
	address, err := mail.ParseAddress(strings.TrimSpace(value))
	return err == nil && address.Address == strings.TrimSpace(value)
}

func toData(message *ent.ContactMessage) types.ContactMessageData {
	return types.ContactMessageData{
		ID:                 message.ID,
		MessageType:        message.MessageType.String(),
		AuthorName:         message.AuthorName,
		AuthorAvatar:       message.AuthorAvatar,
		Subject:            message.Subject,
		Message:            message.Message,
		Company:            message.Company,
		Position:           message.Position,
		RecruiterName:      message.RecruiterName,
		RecruiterTitle:     message.RecruiterTitle,
		IsPublic:           message.IsPublic,
		ConsentCompanyLogo: message.ConsentCompanyLogo,
		Status:             message.Status.String(),
		CreatedAt:          message.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:          message.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
	}
}

func (l *MessageLogic) Create(req *types.CreateContactMessageRequest) (*types.ContactMessageData, error) {
	messageType := strings.ToLower(strings.TrimSpace(req.MessageType))
	if messageType != "general" && messageType != "job" {
		return nil, errors.New("type must be general or job")
	}
	if strings.TrimSpace(req.Message) == "" {
		return nil, errors.New("message is required")
	}

	authorName := strings.TrimSpace(req.AuthorName)
	authorEmail := strings.TrimSpace(req.AuthorEmail)
	authorAvatar := ""
	companyEmail := ""

	if req.AuthenticatedUserID != "" {
		identity, err := l.svcCtx.DB.UserIdentity.Get(l.ctx, req.AuthenticatedUserID)
		if err != nil {
			return nil, errors.New("invalid user identity")
		}
		authorName = identity.DisplayName
		authorEmail = identity.Email
		authorAvatar = identity.AvatarURL
	} else if messageType == "general" {
		return nil, errors.New("general messages require a verified identity")
	}

	if authorName == "" || !validEmail(authorEmail) {
		return nil, errors.New("a valid author name and email are required")
	}
	if messageType == "job" {
		if strings.TrimSpace(req.Company) == "" || strings.TrimSpace(req.Position) == "" {
			return nil, errors.New("company and position are required for job messages")
		}
		normalizedCompanyEmail, companyEmailErr := companyemail.Validate(req.CompanyEmail)
		if companyEmailErr != nil {
			return nil, companyEmailErr
		}
		companyEmail = normalizedCompanyEmail
	}

	created, err := l.svcCtx.DB.ContactMessage.Create().
		SetMessageType(contactmessage.MessageType(messageType)).
		SetAuthorName(authorName).
		SetAuthorEmail(authorEmail).
		SetAuthorAvatar(authorAvatar).
		SetSubject(strings.TrimSpace(req.Subject)).
		SetMessage(strings.TrimSpace(req.Message)).
		SetCompany(strings.TrimSpace(req.Company)).
		SetCompanyEmail(companyEmail).
		SetPosition(strings.TrimSpace(req.Position)).
		SetRecruiterName(strings.TrimSpace(req.RecruiterName)).
		SetRecruiterTitle(strings.TrimSpace(req.RecruiterTitle)).
		SetSendResume(req.SendResume).
		SetIsPublic(req.IsPublic).
		SetConsentCompanyLogo(req.ConsentCompanyLogo).
		SetStatus(contactmessage.StatusPending).
		SetFingerprint(strings.TrimSpace(req.Fingerprint)).
		SetUserIdentityID(strings.TrimSpace(req.AuthenticatedUserID)).
		Save(l.ctx)
	if err != nil {
		return nil, err
	}

	data := toData(created)
	return &data, nil
}

func (l *MessageLogic) ListPublic() (*types.ContactMessageListResponse, error) {
	messages, err := l.svcCtx.DB.ContactMessage.Query().
		Where(contactmessage.IsPublicEQ(true)).
		Order(ent.Desc(contactmessage.FieldCreatedAt)).
		Limit(100).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	items := make([]types.ContactMessageData, 0, len(messages))
	for _, message := range messages {
		items = append(items, toData(message))
	}
	return &types.ContactMessageListResponse{Items: items}, nil
}
