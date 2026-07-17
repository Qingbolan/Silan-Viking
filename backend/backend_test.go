package main

import (
	"testing"

	"silan-backend/internal/config"
)

func validTestConfig() config.Config {
	return config.Config{
		Database: config.DatabaseConfig{
			Driver: "sqlite3",
			Source: ":memory:",
		},
	}
}

func TestValidateConfigRejectsWeakStatsSyncToken(t *testing.T) {
	cfg := validTestConfig()
	cfg.Security.StatsSyncToken = "too-short"
	if err := validateConfig(&cfg); err == nil {
		t.Fatal("validateConfig accepted a weak STATS_SYNC_TOKEN")
	}
}

func TestValidateConfigAllowsMissingOrStrongStatsSyncToken(t *testing.T) {
	cfg := validTestConfig()
	if err := validateConfig(&cfg); err != nil {
		t.Fatalf("missing token should leave private routes fail-closed: %v", err)
	}
	cfg.Security.StatsSyncToken = "0123456789abcdef0123456789abcdef"
	if err := validateConfig(&cfg); err != nil {
		t.Fatalf("strong token was rejected: %v", err)
	}
}
