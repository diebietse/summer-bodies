#!/usr/bin/env node
// Fetches branding (app name + logo + optional favicon) from Firestore, via the deployed GET /branding
// endpoint, and applies it for this build only - restoring the generic defaults afterward regardless of
// whether the build succeeds, same safety guarantee the old local-overlay deploy script had, just sourced from
// Firestore instead of a manual folder. This has to run *before* `vite build`, not in the browser, so the
// static <title>/logo/favicon baked into the shipped HTML are correct for link unfurlers (Slack, WhatsApp,
// etc.), which don't run JavaScript.
// See functions/examples/upload-branding.ts and website/README.md.
import { execSync } from "node:child_process";
import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API_BASE_URL } from "../src/apiBase.js";

const WEBSITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGO_PATH = path.join(WEBSITE_DIR, "src/assets/logo.svg");
const FAVICON_PATH = path.join(WEBSITE_DIR, "public/favicon.ico");
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

async function downloadBinary(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// Best-effort: writes the env file, then downloads every asset in `assets` in parallel and only writes them
// once *all* downloads succeed - so a single failing asset (e.g. a transient Storage hiccup on the favicon)
// can't leave a half-applied build where an already-succeeded download (the logo) was written but the other
// wasn't, and can't fail the build either, unlike a genuine `vite build` error. Adds each written path to
// `updatedPaths` as it's written, so the caller knows what needs restoring afterward.
async function applyBranding(branding, assets, updatedPaths) {
  try {
    if (branding.appName) {
      writeFileSync(ENV_LOCAL_PATH, `VITE_APP_NAME="${branding.appName}"\n`);
    }

    const downloads = await Promise.all(assets.map((asset) => downloadBinary(asset.url)));
    assets.forEach((asset, i) => {
      writeFileSync(asset.path, downloads[i]);
      updatedPaths.add(asset.path);
    });

    console.log(`Building with branding: appName=${branding.appName ?? "(default)"}, logo=${branding.logoUrl ? "custom" : "(default)"}, favicon=${branding.faviconUrl ? "custom" : "(default)"}`);
  } catch (error) {
    console.warn(`Could not fully apply branding, building with generic defaults instead: ${error.message}`);
  }
}

async function main() {
  const branding = await fetchBranding();

  if (!branding?.appName && !branding?.logoUrl && !branding?.faviconUrl) {
    console.log("No branding configured, building with generic defaults.");
    buildVite();
    return;
  }

  const assets = [branding.logoUrl && { url: branding.logoUrl, path: LOGO_PATH }, branding.faviconUrl && { url: branding.faviconUrl, path: FAVICON_PATH }].filter(Boolean);

  const dirtyAsset = assets.find((asset) => !isGitClean(asset.path));
  if (dirtyAsset) {
    console.error(`error: ${dirtyAsset.path} already has uncommitted changes. Commit or stash them before building.`);
    process.exit(1);
  }

  const hadEnvLocal = existsSync(ENV_LOCAL_PATH);
  if (hadEnvLocal) renameSync(ENV_LOCAL_PATH, ENV_LOCAL_BACKUP);
  const updatedPaths = new Set();

  try {
    await applyBranding(branding, assets, updatedPaths);
    buildVite(); // A real build failure here is deliberately left to propagate and fail the build.
  } finally {
    console.log("Restoring generic branding...");
    if (hadEnvLocal) {
      renameSync(ENV_LOCAL_BACKUP, ENV_LOCAL_PATH);
    } else {
      rmSync(ENV_LOCAL_PATH, { force: true });
    }
    for (const updatedPath of updatedPaths) {
      execSync(`git checkout -- "${updatedPath}"`, { cwd: WEBSITE_DIR });
    }
  }
}

main();
