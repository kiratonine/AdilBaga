package observability

import (
	"io"
	"log/slog"
)

func New(writer io.Writer, level string) *slog.Logger {
	l := slog.LevelInfo
	switch level {
	case "debug":
		l = slog.LevelDebug
	case "warn":
		l = slog.LevelWarn
	case "error":
		l = slog.LevelError
	}
	return slog.New(slog.NewJSONHandler(writer, &slog.HandlerOptions{Level: l, ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
		if len(groups) == 0 && a.Key == slog.TimeKey {
			a.Key = "timestamp"
		}
		return a
	}}))
}
