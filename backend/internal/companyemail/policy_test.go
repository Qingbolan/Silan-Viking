package companyemail

import "testing"

func TestValidateCompanyEmail(t *testing.T) {
	if got, err := Validate("recruiter@example.org"); err != nil || got != "recruiter@example.org" {
		t.Fatalf("company address = %q, %v", got, err)
	}
	if got, err := Validate("Name <recruiter@example.org>"); err != nil || got != "recruiter@example.org" {
		t.Fatalf("named company address = %q, %v", got, err)
	}
	for _, address := range []string{"person@gmail.com", "not-an-email"} {
		if _, err := Validate(address); err == nil {
			t.Fatalf("Validate(%q) accepted an invalid company address", address)
		}
	}
}
