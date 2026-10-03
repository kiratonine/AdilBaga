// Package config validates explicit runtime configuration without disclosing values.
package config

import (
	"errors"
	"math"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Config struct {
	AppEnv         string
	Port           int
	DatabaseURL    string
	CORSOrigins    []string
	TrustedProxies []netip.Prefix
	LogLevel       string
	RateRPS        float64
	RateBurst      int
}

func Load(getenv func(string) string) (Config, error) {
	c := Config{AppEnv: getenv("APP_ENV"), Port: 8080, DatabaseURL: getenv("DATABASE_URL"), LogLevel: getenv("LOG_LEVEL"), RateRPS: 20, RateBurst: 40}
	if c.AppEnv != "development" && c.AppEnv != "test" && c.AppEnv != "production" {
		return Config{}, errors.New("APP_ENV is missing or invalid")
	}
	if value := getenv("PORT"); value != "" {
		port, err := strconv.Atoi(value)
		if err != nil || port < 1 || port > 65535 {
			return Config{}, errors.New("PORT is invalid")
		}
		c.Port = port
	}
	if err := ValidateDatabaseURL(c.DatabaseURL); err != nil {
		return Config{}, err
	}
	origins := getenv("CORS_ALLOWED_ORIGINS")
	if origins == "" {
		return Config{}, errors.New("CORS_ALLOWED_ORIGINS is required")
	}
	for _, value := range strings.Split(origins, ",") {
		value = strings.TrimSpace(value)
		u, err := url.Parse(value)
		if err != nil || u == nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.Hostname() == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.Contains(value, "*") || strings.HasSuffix(value, "#") {
			return Config{}, errors.New("CORS_ALLOWED_ORIGINS is invalid")
		}
		if port := u.Port(); port != "" {
			n, err := strconv.Atoi(port)
			if err != nil || n < 1 || n > 65535 {
				return Config{}, errors.New("CORS_ALLOWED_ORIGINS is invalid")
			}
		}
		host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
		ip, ipErr := netip.ParseAddr(host)
		if c.AppEnv == "production" && (u.Scheme != "https" || host == "localhost" || strings.HasSuffix(host, ".localhost") || (ipErr == nil && (ip.Unmap().IsLoopback() || ip.IsUnspecified()))) {
			return Config{}, errors.New("CORS_ALLOWED_ORIGINS is invalid for production")
		}
		c.CORSOrigins = append(c.CORSOrigins, value)
	}
	if value := getenv("TRUSTED_PROXY_CIDRS"); value != "" {
		for _, item := range strings.Split(value, ",") {
			prefix, err := netip.ParsePrefix(strings.TrimSpace(item))
			if err != nil {
				return Config{}, errors.New("TRUSTED_PROXY_CIDRS is invalid")
			}
			c.TrustedProxies = append(c.TrustedProxies, prefix.Masked())
		}
	}
	if c.LogLevel == "" {
		c.LogLevel = "info"
	}
	switch c.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		return Config{}, errors.New("LOG_LEVEL is invalid")
	}
	if value := getenv("RATE_LIMIT_RPS"); value != "" {
		n, err := strconv.ParseFloat(value, 64)
		if err != nil || n <= 0 || math.IsNaN(n) || math.IsInf(n, 0) {
			return Config{}, errors.New("RATE_LIMIT_RPS is invalid")
		}
		c.RateRPS = n
	}
	if value := getenv("RATE_LIMIT_BURST"); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n <= 0 {
			return Config{}, errors.New("RATE_LIMIT_BURST is invalid")
		}
		c.RateBurst = n
	}
	return c, nil
}

func ValidateDatabaseURL(value string) error {
	u, err := url.Parse(value)
	if err != nil || u == nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || u.Fragment != "" {
		return errors.New("DATABASE_URL is missing or invalid")
	}
	host := u.Hostname()
	if host == "" || !utf8.ValidString(host) {
		return errors.New("DATABASE_URL is missing or invalid")
	}
	// Parse every pgx option at startup, without echoing its error or URL.
	if _, err := pgxpool.ParseConfig(value); err != nil {
		return errors.New("DATABASE_URL is invalid")
	}
	return nil
}
