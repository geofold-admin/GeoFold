#!/bin/bash
# GeoFold VPS deploy — pulls the vps/ subtree from GitHub, verifies, then rebuilds.
#
# Safety rules (enforced, not advisory):
#   - NO docker volume operations, NO docker system prune, NO rm -rf anywhere.
#   - DB container is never touched or recreated by this script.
#   - Caddy is never recreated; only config reloads.
#   - Backend is only rebuilt AFTER: syntax check + isolated boot test pass, and
#     production then runs exactly the image that passed the boot test.
#   - Nothing changes unless this server and the Next.js API (Vercel) hold the
#     same GEOFOLD_VPS_SECRET. The backend refuses unsigned storage and payment
#     requests, so a missing or different secret would break photo uploads and
#     payments.
#
# This script is the ONLY command the deploy SSH key is allowed to run (pinned
# in authorized_keys with command="/home/deploy/deploy.sh",restrict). It
# therefore IGNORES SSH_ORIGINAL_COMMAND and all positional args — any SSH
# invocation that sets a different command still lands here and deploys main.
# The commit is taken from the COMMIT_REF env var (default: main), never from
# an untrusted argument.
#
# The copy in the repo (vps/scripts/deploy.sh) is not installed by deploying:
# after changing it, copy it to /home/deploy/deploy.sh as root.
set -euo pipefail

# Ignore any command the SSH client tried to run; we always deploy.
unset SSH_ORIGINAL_COMMAND
COMMIT="${COMMIT_REF:-main}"

REPO="https://github.com/geofold-admin/GeoFold"
API="$REPO"   # raw + api share host
SUBTREE="vps"
APP="/home/deploy/app"
TS="$(date +%Y%m%d_%H%M%S)"
WORK="/tmp/deploy_${TS}"
IMAGE="app-backend:latest"     # the image compose runs for `backend` (project "app")
NODE_IMAGE="node:24-alpine"    # keep in step with vps/backend/Dockerfile
API_HOST="api.geofold.sayba.id"
NEXT_HEALTH="https://geofold.sayba.id/api/health"

log()  { printf '\033[1;32m[deploy]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[deploy FAIL]\033[0m %s\n' "$*"; exit 1; }

cleanup() { rm -rf "$WORK" 2>/dev/null || true; }   # only our own scratch dir
trap cleanup EXIT

# ---- 0. Same GEOFOLD_VPS_SECRET here and on Vercel? -----------------------
# Compared through a short tag derived from the secret (fingerprint() in
# backend/src/security.js, vpsKey on the Next.js /api/health), never the secret
# itself. python reads the value from .env; it is not printed or put on a
# command line.
log "Checking GEOFOLD_VPS_SECRET against the Next.js API ..."
VPS_KEY=$(python3 -c '
import hashlib, hmac, sys
secret = ""
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.strip()
    if line.startswith("export "):
        line = line[7:].lstrip()
    if line.startswith("GEOFOLD_VPS_SECRET="):
        secret = line.split("=", 1)[1].strip()
        if len(secret) >= 2 and secret[0] == secret[-1] and secret[0] in "\"'"'"'":
            secret = secret[1:-1]
if len(secret) < 32:
    sys.exit(1)
print(hmac.new(secret.encode(), b"geofold:fingerprint", hashlib.sha256).hexdigest()[:12])
' "${APP}/backend/.env") || fail "GEOFOLD_VPS_SECRET (32+ characters) is missing from ${APP}/backend/.env"
NEXT_KEY=$(curl -fsS -m 20 "$NEXT_HEALTH" 2>/dev/null \
  | python3 -c 'import json, sys; print(json.load(sys.stdin).get("vpsKey") or "")' 2>/dev/null || true)
[ -n "$NEXT_KEY" ] \
  || fail "the Next.js API does not sign VPS requests yet (no vpsKey at ${NEXT_HEALTH}): set GEOFOLD_VPS_SECRET on Vercel and redeploy it first"
[ "$NEXT_KEY" = "$VPS_KEY" ] \
  || fail "GEOFOLD_VPS_SECRET differs between ${APP}/backend/.env (tag ${VPS_KEY}) and Vercel (tag ${NEXT_KEY})"
log "Secret matches Vercel (tag ${VPS_KEY})"

# ---- 1. Resolve commit + file list from GitHub API -------------------------
log "Resolving ${SUBTREE}/ at ${COMMIT} ..."
TREE=$(curl -fsSL "https://api.github.com/repos/geofold-admin/GeoFold/git/trees/${COMMIT}?recursive=1") \
  || fail "GitHub API unreachable"
FILES=$(echo "$TREE" | python3 -c '
import sys, json
d = json.load(sys.stdin)
if d.get("truncated"):
    sys.exit("tree truncated")
paths = [e["path"] for e in d["tree"]
         if e["path"].startswith("vps/") and e["type"] == "blob"]
if not paths:
    sys.exit("no files under vps/")
print("\n".join(paths))
') || fail "no vps/ files at ${COMMIT}"
COMMIT_SHA=$(echo "$TREE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sha',''))" 2>/dev/null || true)
log "Found $(echo "$FILES" | wc -l) files (tree sha: ${COMMIT_SHA:0:12})"

# ---- 2. Download to scratch -----------------------------------------------
mkdir -p "$WORK"
while read -r f; do
  dest="$WORK/${f#vps/}"
  mkdir -p "$(dirname "$dest")"
  curl -fsSL "https://raw.githubusercontent.com/geofold-admin/GeoFold/${COMMIT}/${f}" -o "$dest" \
    || fail "download failed: $f"
done <<< "$FILES"
log "Downloaded $(find "$WORK" -type f | wc -l) files"

# ---- 3. Syntax check every JS file BEFORE touching prod --------------------
# Node lives in the container, not on the host — run checks via docker run.
log "Syntax check (via throwaway ${NODE_IMAGE} container) ..."
docker run --rm -v "$WORK/backend:/app" -w /app "$NODE_IMAGE" \
  sh -c 'find src -name "*.js" -type f | xargs node --check && echo "syntax OK: all files"' \
  || fail "syntax check failed in one or more JS files"

# ---- 4. Build the image, then boot-test it in isolation --------------------
log "Build + boot test (isolated, no prod ports, no prod volumes) ..."
TEST_IMG="geofold-backend-boottest-${TS}"
# --pull: every deploy also picks up the latest patch release of the base image.
docker build --pull -t "$TEST_IMG" "$WORK/backend" >"$WORK/build.log" 2>&1 \
  || { tail -n 30 "$WORK/build.log"; docker rmi -f "$TEST_IMG" >/dev/null 2>&1; fail "docker build failed in boot test"; }
[ "$(docker image inspect -f '{{.Config.User}}' "$TEST_IMG")" = "node" ] \
  || { docker rmi -f "$TEST_IMG" >/dev/null 2>&1; fail "the backend image must run as the node user, not root"; }

BOOT_OK=0
BOOTED=$(docker run -d --rm --name "boot-test-${TS}" \
  -e DB_USER=x -e DB_PASSWORD=x -e DB_NAME=x -e DB_HOST=127.0.0.1 \
  "$TEST_IMG" 2>/dev/null || true)
if [ -n "$BOOTED" ]; then
  sleep 2
  for i in 1 2 3 4 5 6 7 8; do
    STATE=$(docker inspect -f '{{.State.Status}}' "boot-test-${TS}" 2>/dev/null || echo gone)
    case "$STATE" in
      exited|dead|gone) BOOT_OK=0; break ;;
      running)
        # process is up; app may log DB errors but must not crash-loop
        RESTARTS=$(docker inspect -f '{{.RestartCount}}' "boot-test-${TS}" 2>/dev/null || echo 99)
        if [ "$RESTARTS" -eq 0 ]; then BOOT_OK=1; break; fi ;;
    esac
    sleep 2
  done
fi
docker rm -f "boot-test-${TS}" >/dev/null 2>&1 || true
[ "$BOOT_OK" = "1" ] || { docker rmi -f "$TEST_IMG" >/dev/null 2>&1; fail "boot test: container crashed or restart-looped"; }
log "Boot test passed"
NEW_IMG=$(docker image inspect -f '{{.Id}}' "$TEST_IMG")
PREV_IMG=$(docker image inspect -f '{{.Id}}' "$IMAGE" 2>/dev/null || true)

# ---- 5. Deploy: copy source + config, then recreate backend on the new image --
log "Deploying to ${APP} ..."
# Snapshot what is live now, for a real rollback (kept only for this run)
ROLLBACK="${WORK}/rollback"
mkdir -p "$ROLLBACK/src"
cp -a "${APP}/backend/src/." "$ROLLBACK/src/" 2>/dev/null || true
cp -a "${APP}/Caddyfile" "${APP}/docker-compose.yml" "$ROLLBACK/" 2>/dev/null || true

rollback() {
  printf '\033[1;31m[deploy]\033[0m %s - rolling back ...\n' "$*"
  rsync -a --delete "$ROLLBACK/src/" "${APP}/backend/src/" || true
  cp "$ROLLBACK/docker-compose.yml" "${APP}/docker-compose.yml" 2>/dev/null || true
  if ! cmp -s "$ROLLBACK/Caddyfile" "${APP}/Caddyfile"; then
    cp "$ROLLBACK/Caddyfile" "${APP}/Caddyfile" 2>/dev/null \
      && docker exec app-caddy-1 caddy reload --config /etc/caddy/Caddyfile || true
  fi
  if [ -n "$PREV_IMG" ]; then docker tag "$PREV_IMG" "$IMAGE" || true; fi
  (cd "$APP" && docker compose up -d --force-recreate --no-build backend) || true
  fail "rolled back: $*. Verify: curl -sk https://${API_HOST}/health ; inspect: docker logs app-backend-1"
}

# The image runs as `node` (uid 1000, which is also the deploy user here), but
# files written while the backend ran as root are root-owned. Hand them over;
# only files with the wrong owner are touched.
fix_storage_owner() {
  docker run --rm --user 0:0 --entrypoint /bin/sh -v "${APP}/storage:/storage" "$NEW_IMG" \
    -c 'find /storage \( ! -uid 1000 -o ! -gid 1000 \) -exec chown -h 1000:1000 {} \;'
}

rsync -a --delete "$WORK/backend/src/" "${APP}/backend/src/"
# The build inputs too, so a manual `docker compose build` matches what was tested (.env stays).
for f in Dockerfile .dockerignore package.json package-lock.json; do
  if [ -f "$WORK/backend/$f" ]; then cp "$WORK/backend/$f" "${APP}/backend/$f"; fi
done
if ! diff -q "$WORK/Caddyfile" "${APP}/Caddyfile" >/dev/null 2>&1; then
  cp "$WORK/Caddyfile" "${APP}/Caddyfile"
  log "Caddyfile changed -> will reload Caddy"
  CADDY_CHANGED=1
else
  CADDY_CHANGED=0
fi
if ! diff -q "$WORK/docker-compose.yml" "${APP}/docker-compose.yml" >/dev/null 2>&1; then
  cp "$WORK/docker-compose.yml" "${APP}/docker-compose.yml"
  log "docker-compose.yml changed"
fi
fix_storage_owner || rollback "could not hand storage/ to uid 1000"

# Production gets the very image that passed the boot test.
docker tag "$TEST_IMG" "$IMAGE"
docker rmi "$TEST_IMG" >/dev/null 2>&1 || true   # removes only the extra tag

cd "$APP"
# --force-recreate so bind-mounted source changes actually take effect (plain
# `up -d` no-ops if the container is already running, silently shipping
# nothing); --no-build so compose never swaps in an untested image. db and
# caddy untouched.
docker compose up -d --force-recreate --no-build backend || rollback "docker compose up failed"
if [ "$CADDY_CHANGED" = "1" ]; then
  docker exec app-caddy-1 caddy reload --config /etc/caddy/Caddyfile || rollback "Caddy reload failed"
fi
fix_storage_owner || true   # anything the old container wrote while it was stopping
[ "$(docker inspect -f '{{.Image}}' app-backend-1 2>/dev/null || true)" = "$NEW_IMG" ] \
  || rollback "backend is not running the tested image"

# ---- 6. Post-deploy checks -------------------------------------------------
# Probe the real public endpoint via HTTPS (Caddy 308-redirects plain HTTP).
# --resolve pins the API host to 127.0.0.1 so this works without DNS.
log "Post-deploy health check ..."
probe() {
  curl -sk --resolve "${API_HOST}:443:127.0.0.1" -o /dev/null -w '%{http_code}' \
    "https://${API_HOST}$1" 2>/dev/null || echo 000
}
HEALTHY=0
for i in $(seq 1 15); do
  sleep 2
  if [ "$(probe /health)" = "200" ]; then HEALTHY=1; break; fi
done
[ "$HEALTHY" = "1" ] || rollback "health check failed"
# Signing is enforced: an unsigned storage request gets 401 (503 = secret not loaded).
CODE=$(probe '/api/storage/info?path=deploy-check')
[ "$CODE" = "401" ] || rollback "unsigned storage request answered ${CODE}, expected 401"
RUN_KEY=$(docker exec app-backend-1 node -e \
  "process.stdout.write(require('/app/src/security').fingerprint() || '')" 2>/dev/null || true)
[ "$RUN_KEY" = "$VPS_KEY" ] || rollback "the running backend did not load the GEOFOLD_VPS_SECRET from .env"
log "prod healthy (HTTP 200 via Caddy, unsigned storage requests refused, secret matches Vercel)"

# The previous image is no longer needed (images built before .dockerignore also
# carried a copy of backend/.env).
if [ -n "$PREV_IMG" ] && [ "$PREV_IMG" != "$NEW_IMG" ]; then
  docker rmi "$PREV_IMG" >/dev/null 2>&1 || true
fi
exit 0
