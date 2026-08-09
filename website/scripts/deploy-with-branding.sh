#!/usr/bin/env bash
# Build and deploy the website with a branding overlay applied on top of
# the generic defaults, then restore the generic branding afterward
# regardless of whether the build or deploy succeeds.
#
# Usage: scripts/deploy-with-branding.sh <path-to-branding-folder>
#
# The branding folder must contain:
#   logo.svg    - copied over src/assets/logo.svg for this build
#   .env.local  - copied over .env.local (e.g. to set VITE_APP_NAME)
#
# Branding folders are expected to live outside version control (e.g. a
# gitignored directory at the repo root) since they exist specifically to
# hold values that shouldn't be committed.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <path-to-branding-folder>" >&2
  exit 1
fi

BRANDING_DIR="$(cd "$1" && pwd)"
cd "$(dirname "$0")/.."

LOGO_PATH="src/assets/logo.svg"
ENV_LOCAL_PATH=".env.local"
ENV_LOCAL_BACKUP=".env.local.deploy-backup"

if [[ ! -f "$BRANDING_DIR/logo.svg" || ! -f "$BRANDING_DIR/.env.local" ]]; then
  echo "error: $BRANDING_DIR must contain logo.svg and .env.local" >&2
  exit 1
fi

if ! git diff --quiet -- "$LOGO_PATH" || ! git diff --cached --quiet -- "$LOGO_PATH"; then
  echo "error: $LOGO_PATH already has uncommitted changes. Commit or stash them before running this script." >&2
  exit 1
fi

restore() {
  echo "Restoring generic branding..."
  git checkout -- "$LOGO_PATH"
  if [[ -f "$ENV_LOCAL_BACKUP" ]]; then
    mv "$ENV_LOCAL_BACKUP" "$ENV_LOCAL_PATH"
  else
    rm -f "$ENV_LOCAL_PATH"
  fi
}
trap restore EXIT

if [[ -f "$ENV_LOCAL_PATH" ]]; then
  mv "$ENV_LOCAL_PATH" "$ENV_LOCAL_BACKUP"
fi

cp "$BRANDING_DIR/logo.svg" "$LOGO_PATH"
cp "$BRANDING_DIR/.env.local" "$ENV_LOCAL_PATH"

echo "Building with branding from $BRANDING_DIR..."
npm run build

echo "Deploying to Firebase Hosting..."
firebase deploy --only hosting
