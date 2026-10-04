package config

import (
	"strings"
	"testing"
)

func TestVoiceConfig(t *testing.T) {
	for _, tt := range []struct {
		name, key, value string
		valid            bool
	}{
		{"missing key", "GEMINI_API_KEY", "", false}, {"missing token", "UPSTASH_REDIS_REST_TOKEN", "", false}, {"http", "UPSTASH_REDIS_REST_URL", "http://unit.invalid", false}, {"credentials", "UPSTASH_REDIS_REST_URL", "https://user:private-password@unit.invalid", false}, {"query", "UPSTASH_REDIS_REST_URL", "https://unit.invalid?token=x", false}, {"fragment", "UPSTASH_REDIS_REST_URL", "https://unit.invalid#x", false},
		{"rps zero", "VOICE_RATE_LIMIT_RPS", "0", false}, {"rps nan", "VOICE_RATE_LIMIT_RPS", "NaN", false}, {"rps inf", "VOICE_RATE_LIMIT_RPS", "Inf", false}, {"burst", "VOICE_RATE_LIMIT_BURST", "0", false}, {"concurrency", "VOICE_MAX_CONCURRENCY", "-1", false}, {"valid", "VOICE_MAX_CONCURRENCY", "2", true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			env := environment()
			env["APP_ENV"] = "production"
			env["CORS_ALLOWED_ORIGINS"] = "https://aktau.market"
			env["GEMINI_API_KEY"] = "unit-key"
			env["UPSTASH_REDIS_REST_URL"] = "https://unit.invalid"
			env["UPSTASH_REDIS_REST_TOKEN"] = "unit-token"
			env[tt.key] = tt.value
			c, err := Load(func(k string) string { return env[k] })
			if (err == nil) != tt.valid {
				t.Fatal("config mismatch")
			}
			if err != nil && strings.Contains(err.Error(), "private-password") {
				t.Fatal("config leak")
			}
			if err == nil && (c.VoiceRateRPS != 2 || c.VoiceRateBurst != 4) {
				t.Fatal("defaults")
			}
		})
	}
	env := environment()
	env["GEMINI_API_KEY"] = " one "
	env["GEMINI_API_KEY2"] = "one"
	env["GEMINI_API_KEY3"] = "two"
	c, err := Load(func(k string) string { return env[k] })
	if err != nil || len(c.GeminiKeys) != 2 || c.GeminiKeys[0] != "one" || c.GeminiKeys[1] != "two" {
		t.Fatal("key order")
	}
}
