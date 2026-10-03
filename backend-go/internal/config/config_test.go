package config

import (
	"strings"
	"testing"
)

func environment() map[string]string {
	return map[string]string{"APP_ENV": "development", "DATABASE_URL": "postgres://test:test@127.0.0.1:5432/test?sslmode=disable", "CORS_ALLOWED_ORIGINS": "http://localhost:3100"}
}

func TestConfig(t *testing.T) {
	tests := []struct {
		name, key, value string
		valid            bool
	}{
		{"development defaults", "", "", true},
		{"test environment", "APP_ENV", "test", true},
		{"missing env", "APP_ENV", "", false}, {"unknown env", "APP_ENV", "preview", false},
		{"missing db", "DATABASE_URL", "", false}, {"bad db", "DATABASE_URL", "postgres://private-password@%bad", false},
		{"invalid db escape", "DATABASE_URL", "postgres://user:private-password@%zz/db", false},
		{"wrong scheme", "DATABASE_URL", "https://private-password@example.com", false},
		{"missing db host", "DATABASE_URL", "postgres:///test", false},
		{"bad db options", "DATABASE_URL", "postgres://test:private-password@localhost/test?sslmode=invalid", false},
		{"postgresql scheme", "DATABASE_URL", "postgresql://test:test@localhost/test", true},
		{"missing origins", "CORS_ALLOWED_ORIGINS", "", false}, {"wildcard", "CORS_ALLOWED_ORIGINS", "*", false},
		{"origin credentials", "CORS_ALLOWED_ORIGINS", "https://user:private-password@example.com", false},
		{"origin path", "CORS_ALLOWED_ORIGINS", "https://example.com/", false},
		{"origin query", "CORS_ALLOWED_ORIGINS", "https://example.com?secret=x", false},
		{"origin fragment", "CORS_ALLOWED_ORIGINS", "https://example.com#x", false},
		{"origin invalid port", "CORS_ALLOWED_ORIGINS", "https://example.com:70000", false},
		{"origins comma", "CORS_ALLOWED_ORIGINS", "https://example.com,http://127.0.0.1:3100", true},
		{"origin empty entry", "CORS_ALLOWED_ORIGINS", "https://example.com,", false},
		{"bad proxy", "TRUSTED_PROXY_CIDRS", "not-a-cidr", false},
		{"valid proxy", "TRUSTED_PROXY_CIDRS", "10.0.0.0/8,::1/128", true},
		{"port zero", "PORT", "0", false}, {"port high", "PORT", "65536", false}, {"port text", "PORT", "bad", false}, {"port valid", "PORT", "18080", true},
		{"rps zero", "RATE_LIMIT_RPS", "0", false}, {"rps negative", "RATE_LIMIT_RPS", "-1", false}, {"rps nan", "RATE_LIMIT_RPS", "NaN", false}, {"rps infinite", "RATE_LIMIT_RPS", "+Inf", false},
		{"burst zero", "RATE_LIMIT_BURST", "0", false}, {"burst negative", "RATE_LIMIT_BURST", "-1", false}, {"burst text", "RATE_LIMIT_BURST", "bad", false},
		{"log valid", "LOG_LEVEL", "debug", true}, {"log bad", "LOG_LEVEL", "trace", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			env := environment()
			if tt.key != "" {
				env[tt.key] = tt.value
			}
			c, err := Load(func(k string) string { return env[k] })
			if (err == nil) != tt.valid {
				t.Fatalf("valid=%v error=%v", tt.valid, err)
			}
			if err != nil && strings.Contains(err.Error(), "private-password") {
				t.Fatal("config leaked value")
			}
			if tt.name == "development defaults" && (c.Port != 8080 || c.RateRPS != 20 || c.RateBurst != 40 || c.LogLevel != "info" || len(c.TrustedProxies) != 0) {
				t.Fatal("unexpected defaults")
			}
		})
	}
}

func TestDatabaseURLValidation(t *testing.T) {
	for _, tt := range []struct {
		name, value string
		valid       bool
	}{
		{"decoded invalid UTF-8", "postgres://private-password@%bad", false},
		{"malformed escape", "postgres://user:private-password@%zz/db", false},
		{"overlong UTF-8", "postgres://user:private-password@%C0%AF/db", false},
		{"valid postgres", "postgres://user:private-password@127.0.0.1:5432/db?sslmode=disable", true},
		{"valid postgresql", "postgresql://user:private-password@localhost/db", true},
		{"invalid sslmode", "postgres://user:private-password@localhost/db?sslmode=invalid", false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			// Parsing only: no pool creation or network call.
			err := ValidateDatabaseURL(tt.value)
			if (err == nil) != tt.valid {
				t.Fatalf("valid=%v error=%v", tt.valid, err)
			}
			if err != nil && (strings.Contains(err.Error(), "private-password") || strings.Contains(err.Error(), tt.value)) {
				t.Fatal("DATABASE_URL leaked")
			}
		})
	}
}

func TestProductionOrigins(t *testing.T) {
	for _, value := range []string{"https://aktau.market", "http://localhost:3100", "https://localhost", "https://test.localhost", "https://127.0.0.1", "https://[::1]", "https://[::ffff:127.0.0.1]", "https://0.0.0.0"} {
		t.Run(value, func(t *testing.T) {
			env := environment()
			env["APP_ENV"] = "production"
			env["CORS_ALLOWED_ORIGINS"] = value
			_, err := Load(func(k string) string { return env[k] })
			if (err == nil) != (value == "https://aktau.market") {
				t.Fatalf("unexpected validation: %v", err)
			}
		})
	}
}
