#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
case "$mode" in
  prepare|compile|build|publish) ;;
  *)
    echo "usage: server-publish.sh prepare|compile|build|publish" >&2
    exit 64
    ;;
esac

: "${SILAN_FRONTEND_STATE_ROOT:?SILAN_FRONTEND_STATE_ROOT is required}"
: "${SILAN_PUBLIC_ORIGIN:?SILAN_PUBLIC_ORIGIN is required}"

source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="$(readlink -f "${BASH_SOURCE[0]}")"
state_root="$SILAN_FRONTEND_STATE_ROOT"
build_root="$state_root/build"
code_root="$build_root/code"
published_root="$state_root/published"
releases_root="$published_root/releases"
current_link="$published_root/current"
previous_link="$published_root/previous"
puppeteer_cache="$state_root/cache/puppeteer"
dependency_marker="$state_root/dependencies.sha256"
runtime_user="www"
runtime_group="www"
dist="$source_root/dist"

runtime_home() {
  local home
  home="$(getent passwd "$runtime_user" | cut -d: -f6)"
  if [[ -z "$home" || "$home" != /* ]]; then
    echo "[frontend:server] runtime user $runtime_user has no absolute home" >&2
    exit 78
  fi
  printf '%s\n' "$home"
}

dependency_lock_hash() {
  sha256sum "$source_root/package.json" "$source_root/package-lock.json" \
    | sha256sum \
    | awk '{print $1}'
}

dependencies_are_ready() {
  local lock_hash installed_hash
  lock_hash="$(dependency_lock_hash)"
  installed_hash=""
  if [[ -f "$dependency_marker" ]]; then
    installed_hash="$(tr -d '[:space:]' < "$dependency_marker")"
  fi
  [[ "$installed_hash" == "$lock_hash" && -x "$source_root/node_modules/.bin/vite" ]]
}

prepare_dependencies() {
  local lock_hash installed_hash
  lock_hash="$(dependency_lock_hash)"
  installed_hash=""
  if [[ -f "$dependency_marker" ]]; then
    installed_hash="$(tr -d '[:space:]' < "$dependency_marker")"
  fi

  if [[ "$installed_hash" == "$lock_hash" && -x "$source_root/node_modules/.bin/vite" ]]; then
    echo "[frontend:server] dependencies unchanged"
    return
  fi

  echo "[frontend:server] npm ci"
  (
    cd "$source_root"
    PUPPETEER_CACHE_DIR="$puppeteer_cache" npm ci --no-audit --no-fund
    PUPPETEER_CACHE_DIR="$puppeteer_cache" \
      npx --no-install puppeteer browsers install chrome --install-deps
  )
  printf '%s\n' "$lock_hash" > "$dependency_marker.next"
  mv -f "$dependency_marker.next" "$dependency_marker"
}

load_server_environment() {
  if [[ -r /etc/silan-backend/db.env ]]; then
    set -a
    # shellcheck disable=SC1091
    . /etc/silan-backend/db.env
    set +a
  fi
}

prepare_search_engine_submission() {
  if [[ ! -f "$source_root/scripts/submit-search-engines.mjs" ]]; then
    echo "[search-submit] prepare skipped: submit script is not present"
    return
  fi

  (
    cd "$source_root"
    node scripts/submit-search-engines.mjs prepare
  )
}

submit_search_engines() {
  if [[ ! -f "$source_root/scripts/submit-search-engines.mjs" ]]; then
    echo "[search-submit] skipped: submit script is not present"
    return
  fi

  if (
    cd "$source_root"
    node scripts/submit-search-engines.mjs submit
  ); then
    return
  fi

  if [[ "${SEARCH_ENGINE_SUBMIT_STRICT:-false}" == "true" ]]; then
    echo "[search-submit] submission failed in strict mode" >&2
    exit 1
  fi

  echo "[search-submit] warning: submission failed; release remains published" >&2
}

verify_public_static_release() {
  local verify_root cache_key attempt artifact
  verify_root="$(mktemp -d)"
  cache_key="silan-release-check=$release_id"

  for attempt in 1 2 3; do
    rm -f "$verify_root/sitemap.xml" "$verify_root/rss.xml" "$verify_root/release-manifest.json"
    for artifact in sitemap.xml rss.xml release-manifest.json; do
      if ! curl -fsSL --max-time 20 \
        -H 'Cache-Control: no-cache' \
        "${SILAN_PUBLIC_ORIGIN%/}/$artifact?$cache_key" \
        -o "$verify_root/$artifact"; then
        break
      fi
    done
    if [[ -s "$verify_root/sitemap.xml" \
      && -s "$verify_root/rss.xml" \
      && -s "$verify_root/release-manifest.json" ]] \
      && (
        cd "$source_root"
        node scripts/verify-static-release.mjs \
          --root "$verify_root" \
          --public-origin "$SILAN_PUBLIC_ORIGIN" \
          --release-id "$release_id" \
          --content-commit "$SILAN_CONTENT_COMMIT" \
          --content-hash "$SILAN_CONTENT_HASH" \
          --schema-version "$SILAN_SCHEMA_VERSION"
      ); then
      rm -rf "$verify_root"
      echo "[frontend:server] public sitemap, RSS and release provenance verified"
      return 0
    fi
    if [[ "$attempt" -lt 3 ]]; then
      sleep 1
    fi
  done

  rm -rf "$verify_root"
  echo "[frontend:server] public static release verification failed" >&2
  return 1
}

assert_managed_dist() {
  local expected_dist actual_dist
  if [[ ! -d "$build_root/dist" || ! -L "$dist" ]]; then
    echo "[frontend:server] dist must be the managed link $dist -> $build_root/dist" >&2
    echo "[frontend:server] run a frontend deployment to provision the static publisher" >&2
    exit 78
  fi
  expected_dist="$(readlink -f "$build_root/dist")"
  actual_dist="$(readlink -f "$dist")"
  if [[ "$actual_dist" != "$expected_dist" ]]; then
    echo "[frontend:server] dist must be the managed link $dist -> $build_root/dist" >&2
    echo "[frontend:server] run a frontend deployment to provision the static publisher" >&2
    exit 78
  fi
}

handoff_root_publish() {
  local current_uid home runtime_config runtime_cache
  current_uid="$(id -u)"
  if [[ "$mode" == "prepare" || "$current_uid" -ne 0 ]]; then
    return
  fi

  if ! id "$runtime_user" >/dev/null 2>&1; then
    echo "[frontend:server] runtime user $runtime_user does not exist" >&2
    exit 78
  fi

  assert_managed_dist
  home="$(runtime_home)"
  runtime_config="$state_root/runtime/config"
  runtime_cache="$state_root/runtime/cache"
  install -d -o "$runtime_user" -g "$runtime_group" -m 0755 \
    "$build_root" "$build_root/dist" "$code_root" "$published_root" "$releases_root" \
    "$state_root/runtime" "$runtime_config" "$runtime_cache"
  chown -R "$runtime_user:$runtime_group" "$build_root" "$published_root"
  install -d -o "$runtime_user" -g "$runtime_group" -m 0755 \
    "$source_root/node_modules/.vite-temp"

  echo "[frontend:server] hand off $mode to $runtime_user"
  exec runuser -u "$runtime_user" --preserve-environment -- \
    env PATH="$PATH" \
      HOME="$home" \
      XDG_CONFIG_HOME="$runtime_config" \
      XDG_CACHE_HOME="$runtime_cache" \
      SILAN_FRONTEND_STATE_ROOT="$SILAN_FRONTEND_STATE_ROOT" \
      SILAN_PUBLIC_ORIGIN="$SILAN_PUBLIC_ORIGIN" \
      bash "$script_path" "$mode"
}

configure_runtime_environment() {
  local home
  home="$(runtime_home)"
  export HOME="$home"
  export XDG_CONFIG_HOME="$state_root/runtime/config"
  export XDG_CACHE_HOME="$state_root/runtime/cache"
  mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"
}

assert_runtime_publish_identity() {
  local current_uid runtime_uid foreign_path
  current_uid="$(id -u)"
  runtime_uid="$(id -u "$runtime_user")"
  if [[ "$current_uid" -ne "$runtime_uid" ]]; then
    echo "[frontend:server] publish must run as $runtime_user, got uid=$current_uid" >&2
    exit 77
  fi

  assert_managed_dist
  foreign_path="$(
    find "$build_root" "$published_root" -xdev ! -user "$runtime_uid" -print -quit
  )"
  if [[ -n "$foreign_path" ]]; then
    echo "[frontend:server] publish workspace ownership drift: $foreign_path" >&2
    echo "[frontend:server] run a frontend deployment as root to repair ownership" >&2
    exit 77
  fi
  if [[ ! -w "$build_root/dist" || ! -w "$published_root" ]]; then
    echo "[frontend:server] publish workspace is not writable by $runtime_user" >&2
    exit 77
  fi
}

load_server_environment
handoff_root_publish

mkdir -p "$state_root/cache" "$published_root" "$releases_root" "$puppeteer_cache"
exec 9>"$published_root/.publish.lock"
if ! flock -w 240 9; then
  echo "[frontend:server] another static publication is still running" >&2
  exit 75
fi

if [[ "$mode" == "prepare" ]]; then
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "[frontend:server] dependency preparation must run as root" >&2
    exit 77
  fi
  prepare_dependencies
  echo "[frontend:server] build environment ready"
  exit 0
fi

assert_runtime_publish_identity
configure_runtime_environment
if ! dependencies_are_ready; then
  echo "[frontend:server] dependencies are not prepared for the current lockfile" >&2
  echo "[frontend:server] run a frontend deployment as root before publishing content" >&2
  exit 78
fi
echo "[frontend:server] dependencies unchanged"

export PUPPETEER_CACHE_DIR="$puppeteer_cache"
export PRERENDER_START_LOCAL_BACKEND=false
export PRERENDER_CACHE_DIR="$state_root/cache/prerender"
export VITE_API_ORIGIN="$SILAN_PUBLIC_ORIGIN"
export VITE_PUBLIC_ORIGIN="$SILAN_PUBLIC_ORIGIN"
export VITE_GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"

if [[ "$mode" == "compile" || "$mode" == "build" ]]; then
  echo "[frontend:server] compile immutable code baseline"
  (
    cd "$source_root"
    npm run build
  )
  code_next="$build_root/.code.next"
  rm -rf "$code_next"
  mkdir -p "$code_next"
  rsync -a --delete "$dist/" "$code_next/"
  rm -rf "$code_root"
  mv "$code_next" "$code_root"
  if [[ "$mode" == "compile" ]]; then
    echo "[frontend:server] code-baseline=$code_root"
    exit 0
  fi
else
  if [[ ! -s "$code_root/index.html" ]]; then
    echo "[frontend:server] no compiled frontend baseline; run a frontend deployment first" >&2
    exit 78
  fi
  echo "[frontend:server] restore immutable code baseline"
  rsync -a --delete "$code_root/" "$dist/"
fi

echo "[frontend:server] prerender content against $SILAN_PUBLIC_ORIGIN"
(
  cd "$source_root"
  npm run prerender
)

release_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
code_commit="unknown"
if [[ -s "$source_root/.silan-code-commit" ]]; then
  code_commit="$(tr -d '[:space:]' < "$source_root/.silan-code-commit")"
fi
code_digest="$(
  find "$code_root" -type f -print0 \
    | sort -z \
    | xargs -0 sha256sum \
    | sha256sum \
    | awk '{print $1}'
)"
export SILAN_STATIC_RELEASE="$release_id"
export SILAN_CODE_COMMIT="$code_commit"
export SILAN_CODE_DIGEST="$code_digest"
export SILAN_CONTENT_COMMIT="${SILAN_CONTENT_COMMIT:-unknown}"
export SILAN_CONTENT_HASH="${SILAN_CONTENT_HASH:-unknown}"
export SILAN_SCHEMA_VERSION="${SILAN_SCHEMA_VERSION:-1}"
(
  cd "$source_root"
  node --input-type=module -e '
    import { writeFileSync } from "node:fs";
    const value = (name) => process.env[name] || "unknown";
    writeFileSync("dist/release-manifest.json", `${JSON.stringify({
      version: 1,
      release_id: value("SILAN_STATIC_RELEASE"),
      content_commit: value("SILAN_CONTENT_COMMIT"),
      content_hash: value("SILAN_CONTENT_HASH"),
      schema_version: Number(value("SILAN_SCHEMA_VERSION")),
      code_commit: value("SILAN_CODE_COMMIT"),
      frontend_artifact_sha256: value("SILAN_CODE_DIGEST"),
      generated_at: new Date().toISOString(),
    }, null, 2)}\n`);
  '
)

test -s "$dist/index.html"
test -s "$dist/zh/blog/index.html"
(
  cd "$source_root"
  npm run verify:seo
)
grep -q "Silan Hu" "$dist/index.html"
grep -q "GEM-Bench" "$dist/index.html"
grep -q "AI 回答里加了广告" "$dist/zh/blog/index.html"
if grep -q '"blogList"' "$dist/zh/blog/index.html"; then
  echo "[frontend:server] list page contains a serialized runtime snapshot" >&2
  exit 1
fi
prepare_search_engine_submission

# Open tabs may still request lazy chunks from the preceding release.
if [[ -L "$current_link" ]]; then
  node "$source_root/scripts/retain-release-assets.mjs" "$dist" "$(readlink -f "$current_link")"
fi

next_release="$releases_root/.${release_id}.next"
release="$releases_root/$release_id"
next_current="$published_root/.current.next"
next_previous="$published_root/.previous.next"

rm -rf "$next_release"
rm -f "$next_current" "$next_previous"
mkdir -p "$next_release"
rsync -a --delete "$dist/" "$next_release/"
mv "$next_release" "$release"

current_release=""
if [[ -L "$current_link" ]]; then
  current_release="$(readlink -f "$current_link")"
fi

ln -s "$release" "$next_current"
mv -Tf "$next_current" "$current_link"

if ! verify_public_static_release; then
  rm -f "$next_current"
  if [[ -n "$current_release" ]]; then
    ln -s "$current_release" "$next_current"
    mv -Tf "$next_current" "$current_link"
  else
    rm -f "$current_link"
  fi
  rm -rf "$release"
  echo "[frontend:server] restored the previous static release" >&2
  exit 1
fi

if [[ -n "$current_release" ]]; then
  ln -s "$current_release" "$next_previous"
  mv -Tf "$next_previous" "$previous_link"
fi

mapfile -t stale_releases < <(find "$releases_root" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -rn \
  | tail -n +4 \
  | cut -d' ' -f2-)
for stale_release in "${stale_releases[@]}"; do
  [[ "$stale_release" == "$release" ]] || rm -rf "$stale_release"
done

echo "[frontend:server] release=$release"
submit_search_engines
