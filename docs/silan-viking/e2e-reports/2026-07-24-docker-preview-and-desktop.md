# Silan Viking Docker Preview and Desktop E2E Report

Date: 2026-07-24, Asia/Singapore.

Repository under test: `/Users/macbook.silan.tech/Documents/GitHub/Silan-Personal-Website`.

Temporary workspace: `/tmp/silan-docker-e2e.oHJ3Pa/my-research-site`.

## Scope

This run tested whether the published documentation path can be executed from a
fresh Silan Viking workspace and whether the desktop management entry point has
clear operational prerequisites.

The run covered:

- fresh workspace creation with `silan init`;
- article creation with English and Chinese bodies;
- lint, index sync, publish, and show commands;
- Docker preview build and runtime startup;
- HTTP checks for the frontend and blog API;
- browser E2E rendering through Puppeteer;
- desktop launch preflight through `silan desktop`.

It did not cover production SSH deployment, DNS, TLS, signed desktop app
packaging, or a full native Tauri window screenshot.

## Environment

Observed local tools:

```text
Docker version 29.2.0, build 0b9d198
Docker Compose version v5.0.2
```

The first Docker preview attempt showed that the Docker CLI can be present
while the daemon is unavailable. Docker Desktop was opened manually and
`docker info` then succeeded.

## Commands Exercised

Core content path:

```sh
mkdir my-research-site
cd my-research-site
silan init
silan blog new docker-e2e-result
silan blog add-lang docker-e2e-result zh
silan content lint
silan index sync
silan blog show docker-e2e-result
silan blog publish docker-e2e-result
silan content lint
silan index sync
silan blog show docker-e2e-result
```

Docker preview path:

```sh
silan site preview --confirm
docker compose -f _deploy/staging/deploy/docker-compose.yml ps
curl http://localhost:8080/
curl http://localhost:8080/blog/docker-e2e-result/
curl 'http://localhost:8080/api/v1/blog/posts?lang=en'
```

Desktop path:

```sh
cd /Users/macbook.silan.tech/Documents/GitHub/Silan-Personal-Website
silan desktop
lsof -nP -iTCP:5184 -sTCP:LISTEN
```

## Successful Results

Fresh content workspace:

```text
silan content lint
3 issue(s), 0 fatal

silan index sync
synced items=4 rows=25 wrote=true
```

Docker preview with valid runtime token:

```text
[1/6] sync
[2/6] build
[3/6] package
[4/6] ship (local — images already loaded)
[5/6] promote — bring stack up, then replace derived tables
[6/6] up — start backend with the promoted db, refresh proxy
up — open http://localhost:8080
```

Container status:

```text
deploy-backend-1   silan-backend:latest   Up (healthy)
deploy-proxy-1     nginx:1.27-alpine      0.0.0.0:8080->80/tcp
deploy-web-1       silan-web:latest       Up
```

HTTP/API checks:

```text
GET /                                      200
GET /blog/docker-e2e-result/              200
GET /api/v1/blog/posts?lang=en            200
API_COUNT=1
API_HAS_POST=true
API_POST={"slug":"docker-e2e-result","title":"Docker preview E2E result"}
```

Browser E2E result:

```text
title: Docker preview E2E result | Silan Hu
hasTitle: true
textLength: 1023
GET /api/v1/blog/posts/docker-e2e-result?lang=en...      200
POST /api/v1/blog/posts/<id>/views?lang=en                200
GET /api/v1/blog/posts/<id>/comments?lang=en...           200
POST /api/v1/blog/posts/<id>/views                        200
```

Screenshot artifact copied into the series:

```text
content/resources/episode/using-silan-viking/assets/episode-04-docker-preview-result.png
```

## Problems Recorded

1. Missing Docker daemon preflight.

   Failure:

   ```text
   Cannot connect to the Docker daemon at unix:///Users/macbook.silan.tech/.docker/run/docker.sock.
   ```

   Documentation action: Episode 4 now requires `docker info` before preview.

2. Missing `STATS_SYNC_TOKEN` prerequisite.

   Failure:

   ```text
   error while interpolating services.backend.environment.STATS_SYNC_TOKEN:
   required variable STATS_SYNC_TOKEN is missing a value
   ```

   Remediation: `site preview --confirm` now writes a local-only
   `_deploy/staging/deploy/.env` beside the staged compose file when no token
   override is set.

3. Token length was not obvious.

   Failure with a short token:

   ```text
   Configuration error: STATS_SYNC_TOKEN must contain at least 32 bytes
   ```

   Remediation: preview now validates `STATS_SYNC_TOKEN` /
   `SILAN_STATS_SYNC_TOKEN` before Docker Compose starts.

4. Seed workspace lint findings may confuse first-run users.

   Observation:

   ```text
   3 issue(s), 0 fatal
   ```

   Documentation action: Episode 2 and Episode 4 now say to continue only when
   the lint summary reports `0 fatal`.

5. Trailing slash matters for exact article URL checks.

   Observation:

   ```text
   GET /blog/docker-e2e-result      301 Location: http://localhost/blog/docker-e2e-result/
   GET /blog/docker-e2e-result/     200
   ```

   Documentation action: Episode 4 now uses `/blog/docker-e2e-result/` for
   precise HTTP verification.

6. Docker web build used Node 20 while local Puppeteer dependencies request
   Node `>=22.12.0`.

   Observation from the uncached build:

   ```text
   npm warn EBADENGINE Unsupported engine
   package: 'puppeteer@25.0.2'
   required: { node: '>=22.12.0' }
   current: { node: 'v20.20.2' }
   ```

   The Docker build still completed. Remediation: `deploy/web.Dockerfile` now
   uses `node:22-bookworm`.

7. Local preview backend image does not include the GeoIP country database.

   Observation:

   ```text
   warning: country database unavailable: open /var/lib/GeoIP/country.mmdb: no such file or directory
   ```

   The `/api/v1/geo` endpoint still returned successfully during the browser
   run.

8. Desktop dev port can be occupied.

   Failure:

   ```text
   error when starting dev server:
   Error: Port 5184 is already in use
   ```

   The occupying process was the same repository's Vite dev server:

   ```text
   node .../desktop/node_modules/.../vite.js --host 127.0.0.1 --port 5184
   ```

   Remediation: the desktop dev script now reuses an already-running Silan
   Context System Vite server for the same project. A non-matching process on
   the port still needs to be stopped.

9. Desktop Vite URL is not the supported management mode.

   Browser-only render produced visible UI chrome but also:

   ```text
   TypeError: Cannot read properties of undefined (reading 'invoke')
   ```

   Documentation action: Episode 2 now states that `http://127.0.0.1:5184` is
   only a browser smoke test. Supported management requires the Tauri shell
   launched by `silan desktop`.

10. Docker media root used the development YAML path.

   Follow-up browser E2E found the article shell and API working while content
   media returned 404:

   ```text
   GET /api/v1/media?f=blog/make-research-work-findable/assets/cover-en-xhs.png 404
   ```

   The files were present under `/data/media`; the backend was still using the
   development `Media.Root: ../content/resources` from `backend-api.yaml`.
   Remediation: `deploy/docker-compose.yml` now sets `MEDIA_ROOT=/data/media`
   for the backend service.

## Raw Local Artifacts

These files were produced during the run:

```text
/tmp/silan-docker-e2e.oHJ3Pa/e2e.log
/tmp/silan-docker-e2e.oHJ3Pa/e2e-rerun-with-token.log
/tmp/silan-docker-e2e.oHJ3Pa/e2e-rerun-after-docker-ready.log
/tmp/silan-docker-e2e.oHJ3Pa/e2e-rerun-valid-token.log
/tmp/silan-docker-e2e.oHJ3Pa/e2e-valid-compose-tail.log
/tmp/silan-docker-e2e.oHJ3Pa/docker-e2e-result-page.png
/tmp/silan-docker-e2e.oHJ3Pa/desktop-vite-page.png
```

Persistent screenshots copied into content:

```text
content/resources/episode/using-silan-viking/assets/episode-04-docker-preview-result.png
content/resources/episode/using-silan-viking/assets/episode-02-desktop-workbench.png
```
