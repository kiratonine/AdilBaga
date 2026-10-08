package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"adilbaga/backend-go/internal/config"
	"adilbaga/backend-go/internal/gemini"
	"adilbaga/backend-go/internal/httpapi"
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/postgres"
	"adilbaga/backend-go/internal/redis"
	"adilbaga/backend-go/internal/voice"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	logger := observability.New(os.Stdout, "info")
	if err := run(ctx, os.Getenv); err != nil {
		logger.Error("startup_or_shutdown_failed", "error", err.Error())
		os.Exit(1)
	}
}

func run(ctx context.Context, getenv func(string) string) error {
	c, err := config.Load(getenv)
	if err != nil {
		return err
	}
	logger := observability.New(os.Stdout, c.LogLevel)
	openPool := postgres.OpenReadOnly
	if c.AppEnv == "production" {
		openPool = postgres.OpenProductionReadOnly
	}
	pool, err := openPool(ctx, c.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	repo := postgres.NewRepository(pool)
	nlp := voice.NLP{}
	if len(c.GeminiKeys) > 0 {
		nlp.Provider = gemini.New(c.GeminiKeys, c.GeminiModel, logger)
	}
	sessions := redis.New(c.UpstashURL, c.UpstashToken, logger)
	service := &voice.Service{Parser: nlp, Sessions: sessions, Categories: repo, Products: repo, Locations: repo}
	server := httpapi.Server(c, httpapi.Router(c, logger, httpapi.Dependencies{DB: pool, Categories: repo, Products: repo, Dashboard: repo, Voice: service}), logger)
	logger.Info("starting", "port", c.Port, "app_env", c.AppEnv)
	return serve(ctx, server, logger)
}

func serve(ctx context.Context, server *http.Server, logger *slog.Logger) error {
	errorsCh := make(chan error, 1)
	go func() { errorsCh <- server.ListenAndServe() }()
	select {
	case err := <-errorsCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return errors.New("HTTP server failed")
		}
		return nil
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), httpapi.ShutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			_ = server.Close()
			return errors.New("HTTP shutdown failed")
		}
		if err := <-errorsCh; err != nil && !errors.Is(err, http.ErrServerClosed) {
			return errors.New("HTTP server failed")
		}
		logger.Info("shutdown_complete")
		return nil
	}
}
