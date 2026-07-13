// Package companyemail owns the single policy used by both the email-check
// endpoint and contact-message creation. Keeping the gate server-side means a
// direct API caller cannot bypass the form's company-address requirement.
package companyemail

import (
	"errors"
	"net/mail"
	"strings"
)

var consumerDomains = map[string]struct{}{
	"gmail.com": {}, "googlemail.com": {}, "outlook.com": {}, "hotmail.com": {},
	"live.com": {}, "yahoo.com": {}, "yahoo.co.uk": {}, "icloud.com": {},
	"me.com": {}, "aol.com": {}, "proton.me": {}, "protonmail.com": {},
	"qq.com": {}, "163.com": {}, "126.com": {}, "foxmail.com": {},
	"sina.com": {}, "yandex.com": {}, "mail.com": {}, "gmx.com": {},
}

// Validate returns a normalized company address or a user-safe validation
// error. It is a structural policy, not proof that the mailbox exists.
func Validate(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", errors.New("email is required")
	}
	address, err := mail.ParseAddress(value)
	if err != nil {
		return "", errors.New("email is not a valid address")
	}
	at := strings.LastIndex(address.Address, "@")
	if at < 0 {
		return "", errors.New("email is not a valid address")
	}
	domain := strings.ToLower(address.Address[at+1:])
	if _, consumer := consumerDomains[domain]; consumer {
		return "", errors.New("please use a company email, not a personal one")
	}
	return address.Address, nil
}
