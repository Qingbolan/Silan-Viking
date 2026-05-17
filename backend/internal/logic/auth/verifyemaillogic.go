package auth

import (
	"context"
	"errors"
	"net/mail"
	"strings"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

// freeMailDomains are consumer email providers a "company email" should not
// use. The Job Opportunity form asks for a work address; this list is the
// rejection set. It is intentionally small — the common providers — rather
// than exhaustive: the goal is a light sanity gate, not airtight proof.
var freeMailDomains = map[string]struct{}{
	"gmail.com": {}, "googlemail.com": {}, "outlook.com": {}, "hotmail.com": {},
	"live.com": {}, "yahoo.com": {}, "yahoo.co.uk": {}, "icloud.com": {},
	"me.com": {}, "aol.com": {}, "proton.me": {}, "protonmail.com": {},
	"qq.com": {}, "163.com": {}, "126.com": {}, "foxmail.com": {},
	"sina.com": {}, "yandex.com": {}, "mail.com": {}, "gmx.com": {},
}

type VerifyEmailLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Validate a company email — well-formed and not a free-mail provider
func NewVerifyEmailLogic(ctx context.Context, svcCtx *svc.ServiceContext) *VerifyEmailLogic {
	return &VerifyEmailLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

// VerifyEmail checks that the address is a plausible company email: a
// well-formed address whose domain is not a known free-mail provider.
//
// It cannot prove the mailbox exists — there is no mail-sending
// infrastructure here — so "verified" means "passes a structural sanity
// check", which is what the Job Opportunity form needs before accepting a
// submission. A failing address is returned as an error so the existing
// front-end (which only inspects `response.ok`) shows its failure message.
func (l *VerifyEmailLogic) VerifyEmail(req *types.VerifyEmailRequest) (resp *types.VerifyEmailResponse, err error) {
	email := strings.TrimSpace(req.Email)
	if email == "" {
		return nil, errors.New("email is required")
	}

	addr, parseErr := mail.ParseAddress(email)
	if parseErr != nil {
		return nil, errors.New("email is not a valid address")
	}
	// `mail.ParseAddress` accepts `Name <addr>` forms — use the bare address.
	at := strings.LastIndex(addr.Address, "@")
	if at < 0 {
		return nil, errors.New("email is not a valid address")
	}
	domain := strings.ToLower(addr.Address[at+1:])
	if _, isFree := freeMailDomains[domain]; isFree {
		return nil, errors.New("please use a company email, not a personal one")
	}

	return &types.VerifyEmailResponse{
		Email:  addr.Address,
		Valid:  true,
		Reason: "",
	}, nil
}
