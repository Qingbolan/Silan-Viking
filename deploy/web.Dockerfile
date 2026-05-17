# deploy/web.Dockerfile — the static front-end + crawler artifacts.
#
# Stage 1 builds the Vite bundle. Stage 2 serves it with nginx and also hosts
# the SEO artifacts (sitemap.xml / robots.txt / site-index.jsonld) that
# `silan site build` emits into _site/.
#
# Build context is the repo root:
#   docker build -f deploy/web.Dockerfile -t silan-web .

# ---- build stage ----
FROM node:20-bookworm AS build
WORKDIR /src

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./
# VITE_API_BASE is baked in at build time; the compose proxy routes /api.
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

# ---- runtime stage ----
FROM nginx:1.27-alpine AS runtime
COPY --from=build /src/dist /usr/share/nginx/html
# SEO artifacts produced by `silan site build` (copied in by the deploy
# pipeline before the image is built; an empty dir is fine on first run).
COPY deploy/seo/ /usr/share/nginx/html/
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
