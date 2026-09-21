#!/usr/bin/env node
// Fetches branding (app name + logo) from Firestore, via the deployed GET /branding endpoint, and applies it
// for this build only - restoring the generic defaults afterward regardless of whether the build succeeds,
// same safety guarantee the old local-overlay deploy script had, just sourced from Firestore instead of a
// manual folder. This has to run *before* `vite build`, not in the browser, so the static <title>/logo baked
// into the shipped HTML are correct for link unfurlers (Slack, WhatsApp, etc.), which don't run JavaScript.
// See functions/examples/upload-branding.ts and website/README.md.
import { execSync } from "node:child_process";
import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API_BASE_URL } from "../src/apiBase.js";

const WEBSITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGO_PATH = path.join(WEBSITE_DIR, "src/assets/logo.svg");
const ENV_LOCAL_PATH = path.join(WEBSITE_DIR, ".env.local");
const ENV_LOCAL_BACKUP = `${ENV_LOCAL_PATH}.build-backup`;

function isGitClean(filePath) {
  try {
    execSync(`git diff --quiet HEAD -- "${filePath}"`, { cwd: WEBSITE_DIR });
    return true;
  } catch {
    return false;
  }
}

async function fetchBranding() {
  try {
    const response = await fetch(`${API_BASE_URL}/branding`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(`Could not fetch branding, building with generic defaults: ${error.message}`);
    return null;
  }
}

function buildVite() {
  execSync("npx vite build", { cwd: WEBSITE_DIR, stdio: "inherit" });
}

// Best-effort: writes the env file and downloads the logo. Never throws - e.g. a transient Storage hiccup on
// the logo URL must not fail the build, unlike a genuine `vite build` error. Returns whether the logo file was
// actually overwritten, so the caller knows whether it needs restoring afterward.
async function applyBranding(branding) {
  try {
    if (branding.appName) {
      writeFileSync(ENV_LOCAL_PATH, `VITE_APP_NAME="${branding.appName}"\n`);
    }

    if (branding.logoUrl) {
      const logoResponse = await fetch(branding.logoUrl);
      if (!logoResponse.ok) throw new Error(`Failed to download logo: HTTP ${logoResponse.status}`);
      writeFileSync(LOGO_PATH, await logoResponse.text());
    }

    console.log(`Building with branding: appName=${branding.appName ?? "(default)"}, logo=${branding.logoUrl ? "custom" : "(default)"}`);
    return !!branding.logoUrl;
  } catch (error) {
    console.warn(`Could not fully apply branding, building with generic defaults instead: ${error.message}`);
    return false;
  }
}

async function main() {
  const branding = await fetchBranding();

  if (!branding?.appName && !branding?.logoUrl) {
    console.log("No branding configured, building with generic defaults.");
    buildVite();
    return;
  }

  if (branding.logoUrl && !isGitClean(LOGO_PATH)) {
    console.error(`error: ${LOGO_PATH} already has uncommitted changes. Commit or stash them before building.`);
    process.exit(1);
  }

  const hadEnvLocal = existsSync(ENV_LOCAL_PATH);
  if (hadEnvLocal) renameSync(ENV_LOCAL_PATH, ENV_LOCAL_BACKUP);
  let logoUpdated = false;

  try {
    logoUpdated = await applyBranding(branding);
    buildVite(); // A real build failure here is deliberately left to propagate and fail the build.
  } finally {
    console.log("Restoring generic branding...");
    if (hadEnvLocal) {
      renameSync(ENV_LOCAL_BACKUP, ENV_LOCAL_PATH);
    } else {
      rmSync(ENV_LOCAL_PATH, { force: true });
    }
    if (logoUpdated) execSync(`git checkout -- "${LOGO_PATH}"`, { cwd: WEBSITE_DIR });
  }
}

main();
