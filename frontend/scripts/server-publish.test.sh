#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
publisher="$script_dir/server-publish.sh"
test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT

fail() {
  echo "server-publish test failed: $*" >&2
  exit 1
}

make_source_fixture() {
  local source_root="$1"
  mkdir -p "$source_root/scripts" "$source_root/node_modules/.bin"
  cp "$publisher" "$source_root/scripts/server-publish.sh"
  chmod 0755 "$source_root/scripts/server-publish.sh"
  printf '{"name":"fixture"}\n' > "$source_root/package.json"
  printf '{"lockfileVersion":3}\n' > "$source_root/package-lock.json"
  printf '#!/bin/sh\nexit 0\n' > "$source_root/node_modules/.bin/vite"
  chmod 0755 "$source_root/node_modules/.bin/vite"
}

test_root_publish_hands_off_before_locking() {
  local case_root="$test_root/root-handoff"
  local source_root="$case_root/source"
  local state_root="$case_root/state"
  local fake_bin="$case_root/bin"
  local command_log="$case_root/commands.log"
  local real_uid
  real_uid="$(id -u)"

  make_source_fixture "$source_root"
  mkdir -p "$state_root/build/dist" "$state_root/published/releases" "$fake_bin"
  ln -s "$state_root/build/dist" "$source_root/dist"

  cat > "$fake_bin/id" <<EOF
#!/usr/bin/env bash
if [[ "\${1:-}" == "-u" && "\${2:-}" == "www" ]]; then
  echo "$real_uid"
elif [[ "\${1:-}" == "-u" ]]; then
  echo 0
else
  exit 0
fi
EOF
  cat > "$fake_bin/install" <<EOF
#!/usr/bin/env bash
printf 'install %s\n' "\$*" >> "$command_log"
exit 0
EOF
  cat > "$fake_bin/chown" <<EOF
#!/usr/bin/env bash
printf 'chown %s\n' "\$*" >> "$command_log"
exit 0
EOF
  cat > "$fake_bin/runuser" <<EOF
#!/usr/bin/env bash
printf 'runuser %s\n' "\$*" >> "$command_log"
exit 0
EOF
  cat > "$fake_bin/getent" <<EOF
#!/usr/bin/env bash
echo 'www:x:$real_uid:$real_uid::${case_root}/home:/sbin/nologin'
EOF
  chmod 0755 "$fake_bin/id" "$fake_bin/install" "$fake_bin/chown" \
    "$fake_bin/runuser" "$fake_bin/getent"

  PATH="$fake_bin:$PATH" \
    SILAN_FRONTEND_STATE_ROOT="$state_root" \
    SILAN_PUBLIC_ORIGIN="https://example.test" \
    bash "$source_root/scripts/server-publish.sh" compile

  grep -q "chown -R www:www $state_root/build $state_root/published" "$command_log" \
    || fail "root publish did not repair managed ownership"
  grep -q 'runuser -u www --preserve-environment' "$command_log" \
    || fail "root publish did not hand off to www"
  grep -Eq 'bash .*/server-publish\.sh compile$' "$command_log" \
    || fail "root handoff did not preserve the requested compile stage"
  grep -q "HOME=$case_root/home" "$command_log" \
    || fail "root publish leaked the root HOME into the runtime process"
  [[ ! -e "$state_root/published/.publish.lock" ]] \
    || fail "root process acquired the publish lock before handoff"
}

test_publish_rejects_unprepared_dependencies() {
  local case_root="$test_root/unprepared"
  local source_root="$case_root/source"
  local state_root="$case_root/state"
  local fake_bin="$case_root/bin"
  local real_uid
  real_uid="$(id -u)"

  make_source_fixture "$source_root"
  mkdir -p "$state_root/build/dist" "$state_root/published/releases" "$fake_bin"
  ln -s "$state_root/build/dist" "$source_root/dist"
  cat > "$fake_bin/id" <<EOF
#!/usr/bin/env bash
if [[ "\${1:-}" == "-u" && "\${2:-}" == "www" ]]; then
  echo "$real_uid"
elif [[ "\${1:-}" == "-u" ]]; then
  echo "$real_uid"
else
  exit 0
fi
EOF
  cat > "$fake_bin/flock" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  cat > "$fake_bin/getent" <<EOF
#!/usr/bin/env bash
echo 'www:x:$real_uid:$real_uid::${case_root}/home:/sbin/nologin'
EOF
  chmod 0755 "$fake_bin/id" "$fake_bin/flock" "$fake_bin/getent"

  if PATH="$fake_bin:$PATH" \
    SILAN_FRONTEND_STATE_ROOT="$state_root" \
    SILAN_PUBLIC_ORIGIN="https://example.test" \
    bash "$source_root/scripts/server-publish.sh" publish \
    > "$case_root/output.log" 2>&1; then
    fail "publish accepted an unprepared lockfile"
  fi
  grep -q 'dependencies are not prepared for the current lockfile' "$case_root/output.log" \
    || {
      sed -n '1,120p' "$case_root/output.log" >&2
      fail "publish did not report the dependency preparation boundary"
    }
}

test_root_publish_hands_off_before_locking
test_publish_rejects_unprepared_dependencies
grep -q 'npm run prerender' "$publisher" \
  || fail "content publication does not invoke the prerender-only command"
grep -q 'npm run verify:seo' "$publisher" \
  || fail "static publication does not validate generated SEO artifacts"
grep -q 'verify_public_static_release' "$publisher" \
  || fail "static publication does not verify the promoted public release"
if grep -q 'npm run build:seo' "$publisher"; then
  fail "content publication still performs the legacy full SEO build"
fi
echo "server-publish tests passed"
