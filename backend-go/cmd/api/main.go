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
	"adilbaga/backend-go/internal/httpapi"
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/postgres"
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
	pool, err := postgres.Open(ctx, c.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	server := httpapi.Server(c, httpapi.Router(c, logger, pool), logger)
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
