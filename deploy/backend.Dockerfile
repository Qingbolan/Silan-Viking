# deploy/backend.Dockerfile — the Go API service.
#
# The backend uses mattn/go-sqlite3 (CGO), so the build stage needs a C
# toolchain and CGO_ENABLED=1. The runtime stage is a slim Debian image with
# just the static-linked-against-glibc binary and CA certs.
#
# Build context is the repo root:
#   docker build -f deploy/backend.Dockerfile -t silan-backend .

# ---- build stage ----
FROM golang:1.24-bookworm AS build
WORKDIR /src

# gcc + libc headers for the CGO sqlite3 driver.
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# Dependency layer — cached unless go.mod/go.sum change.
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
ENV CGO_ENABLED=1
# Build both the API server and the additive ent-schema migrator.
RUN go build -o /out/silan-backend ./backend.go \
 && go build -o /out/migrate ./cmd/migrate

# ---- runtime stage ----
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=build /out/silan-backend /app/silan-backend
COPY --from=build /out/migrate /app/migrate
COPY backend/etc/ /app/etc/
COPY deploy/backend-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# The derived database lives on a mounted volume (see docker-compose.yml).
# The entrypoint runs the ent migration (creates the full schema) then
# serves; promote replaces derived tables, runtime tables persist.
ENV SILAN_DB_SOURCE="/data/portfolio.db?_fk=1"
EXPOSE 5200

ENTRYPOINT ["/app/entrypoint.sh"]
