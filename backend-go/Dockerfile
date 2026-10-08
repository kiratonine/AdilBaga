FROM golang:1.27.1-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOTOOLCHAIN=local go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM alpine:3.24
RUN apk add --no-cache ca-certificates && addgroup -g 10001 api && adduser -D -H -u 10001 -G api api
COPY --from=build /out/api /usr/local/bin/api
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/health/live || exit 1
ENTRYPOINT ["/usr/local/bin/api"]
