package auth

import (
	"context"

	"silan-backend/internal/companyemail"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

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
	email, err := companyemail.Validate(req.Email)
	if err != nil {
		return nil, err
	}

	return &types.VerifyEmailResponse{
		Email:  email,
		Valid:  true,
		Reason: "",
	}, nil
}
