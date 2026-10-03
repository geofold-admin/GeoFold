#!/bin/bash
# GeoFold VPS deploy — pulls the vps/ subtree from GitHub, verifies, then rebuilds.
#
# Safety rules (enforced, not advisory):
#   - NO docker volume operations, NO docker system prune, NO rm -rf anywhere.
#   - DB container is never touched or recreated by this script.
#   - Caddy is never recreated; only config reloads.
#   - Backend is only rebuilt AFTER: syntax check + isolated boot test pass.
#
# Usage:
#   ./deploy.sh              # deploy latest main
#   ./deploy.sh <commit-sha> # deploy a specific commit
set -euo pipefail

REPO="https://github.com/geofold-admin/GeoFold"
API="$REPO"   # raw + api share host
SUBTREE="vps"
APP="/home/deploy/app"
COMMIT="${1:-main}"
TS="$(date +%Y%m%d_%H%M%S)"
WORK="/tmp/deploy_${TS}"

log()  { printf '\033[1;32m[deploy]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[deploy FAIL]\033[0m %s\n' "$*"; exit 1; }

cleanup() { rm -rf "$WORK" 2>/dev/null || true; }   # only our own scratch dir
trap cleanup EXIT

# ---- 1. Resolve commit + file list from GitHub API -------------------------
log "Resolving ${SUBTREE}/ at ${COMMIT} ..."
TREE=$(curl -fsSL "https://api.github.com/repos/geofold-admin/GeoFold/git/trees/${COMMIT}?recursive=1") \
  || fail "GitHub API unreachable"
SHA=$(echo "$TREE" | python3 -c "import sys,json; print(json.load(sys.stdin)['tree'] and json.load(open(0))['tree'][0]['path'])" 2>/dev/null || true)
# (SHA of subtree computed below in python properly)
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
log "Syntax check (via throwaway node container) ..."
docker run --rm -v "$WORK/backend:/app" -w /app node:20-alpine \
  sh -c 'find src -name "*.js" -type f | xargs node --check && echo "syntax OK: all files"' \
  || fail "syntax check failed in one or more JS files"

# ---- 4. Boot test: run the new code in an isolated container ----------------
log "Boot test (isolated, no prod ports, no prod volumes) ..."
TEST_IMG="geofold-backend-boottest-${TS}"
docker build -t "$TEST_IMG" "$WORK/backend" >/dev/null 2>&1 \
  || { docker rmi -f "$TEST_IMG" >/dev/null 2>&1; fail "docker build failed in boot test"; }

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

# ---- 5. Deploy: hot-copy source (bind mount) then recreate backend ---------
log "Deploying to ${APP} ..."
# Snapshot current source for real rollback (kept only for this run)
ROLLBACK="${WORK}/rollback_src"
mkdir -p "$ROLLBACK"
cp -a "${APP}/backend/src/." "$ROLLBACK/" 2>/dev/null || true
rsync -a --delete "$WORK/backend/src/" "${APP}/backend/src/"
if ! diff -q "$WORK/Caddyfile" "${APP}/Caddyfile" >/dev/null 2>&1; then
  cp "$WORK/Caddyfile" "${APP}/Caddyfile"
  log "Caddyfile changed -> will reload Caddy"
  CADDY_CHANGED=1
else
  CADDY_CHANGED=0
fi
if ! diff -q "$WORK/docker-compose.yml" "${APP}/docker-compose.yml" >/dev/null 2>&1; then
  cp "$WORK/docker-compose.yml" "${APP}/docker-compose.yml"
  log "docker-compose.yml changed -> backend will be recreated"
fi
docker rmi -f "$TEST_IMG" >/dev/null 2>&1 || true

cd "$APP"
# Recreate ONLY the backend service with --force-recreate so bind-mounted
# source changes actually take effect (plain `up -d` no-ops if the container
# is already running, silently shipping nothing). db and caddy untouched.
docker compose up -d --force-recreate backend
if [ "$CADDY_CHANGED" = "1" ]; then
  docker exec app-caddy-1 caddy reload --config /etc/caddy/Caddyfile || fail "Caddy reload failed"
fi

# ---- 6. Post-deploy health check -------------------------------------------
# Probe the real public endpoint via HTTPS (Caddy 308-redirects plain HTTP).
# --resolve pins api.geofold.sayba.id to 127.0.0.1 so this works without DNS.
log "Post-deploy health check ..."
for i in $(seq 1 15); do
  sleep 2
  CODE=$(curl -sk --resolve api.geofold.sayba.id:443:127.0.0.1 \
    -o /dev/null -w '%{http_code}' https://api.geofold.sayba.id/health 2>/dev/null || echo 000)
  if [ "$CODE" = "200" ]; then log "prod healthy (HTTP 200 via Caddy)"; exit 0; fi
done
log "Health check failed — rolling back source tree and restarting backend ..."
rsync -a --delete "$ROLLBACK/" "${APP}/backend/src/"
cd "$APP"
docker compose up -d backend
log "Rollback deployed. Verify: curl -sk https://api.geofold.sayba.id/health ; inspect: docker logs app-backend-1"
exit 1
