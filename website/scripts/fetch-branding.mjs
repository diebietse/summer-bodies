#!/usr/bin/env node
// Reads branding (app name + logo + optional favicon + the privacy page's organizer/contact) from Firestore, with
// the project's service account (see functions/examples/export-branding.ts), and applies it for this build only -
// restoring the generic defaults afterward regardless of whether the build succeeds, same safety guarantee the old
// local-overlay deploy script had, just sourced from Firestore instead of a manual folder. This has to run *before*
// `vite build`, not in the browser, so the static <title>/logo/favicon baked into the shipped HTML are correct for
// link unfurlers (Slack, WhatsApp, etc.), which don't run JavaScript.
//
// Without service-account.json (CI, or a fresh clone) it builds with the generic defaults - except with
// --require-branding, which `npm run deploy` passes, so a deploy can never silently ship them.
// See functions/examples/upload-branding.ts and website/README.md.
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEBSITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGO_PATH = path.join(WEBSITE_DIR, "src/assets/logo.svg");
const FAVICON_PATH = path.join(WEBSITE_DIR, "public/favicon.ico");
const ENV_LOCAL_PATH = path.join(WEBSITE_DIR, ".env.local");
const ENV_LOCAL_BACKUP = `${ENV_LOCAL_PATH}.build-backup`;
const FUNCTIONS_DIR = path.join(WEBSITE_DIR, "../functions");
const SERVICE_ACCOUNT_PATH = path.join(WEBSITE_DIR, "../service-account.json");
const REQUIRE_BRANDING = process.argv.includes("--require-branding");
// Branding fields baked in as Vite env vars - read by src/config.js.
const ENV_VARS = {
  appName: "VITE_APP_NAME",
  organizer: "VITE_ORGANIZER",
  contactEmail: "VITE_CONTACT_EMAIL_ENCODED",
  resultsSharedIn: "VITE_RESULTS_SHARED_IN",
};

// The contact email ships base64-encoded and reversed, so it never appears as plain text in the built HTML/JS for
// address harvesters to grep - src/config.js decodes it when a visitor clicks to reveal it.
function encodeEmail(email) {
  return Buffer.from(email).toString("base64").split("").reverse().join("");
}

function isGitClean(filePath) {
  try {
    execSync(`git diff --quiet HEAD -- "${filePath}"`, { cwd: WEBSITE_DIR });
    return true;
  } catch {
    return false;
  }
}

// Throws if Firestore can't be read - the caller must not confuse that with "branding legitimately isn't
// configured" (`{}`), since treating a failed read the same as "no branding" would silently ship generic branding
// to production. Needs functions/'s dependencies installed.
function readBranding() {
  const output = path.join(os.tmpdir(), `summer-bodies-branding-${process.pid}.json`);
  try {
    execFileSync("npx", ["tsx", "examples/export-branding.ts", output], { cwd: FUNCTIONS_DIR, stdio: ["ignore", "ignore", "inherit"] });
    return JSON.parse(readFileSync(output, "utf8"));
  } finally {
    rmSync(output, { force: true });
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
    const env = Object.entries(ENV_VARS)
      .filter(([field]) => branding[field])
      .map(([field, name]) => `${name}=${JSON.stringify(field === "contactEmail" ? encodeEmail(branding[field]) : branding[field])}\n`);
    if (env.length > 0) writeFileSync(ENV_LOCAL_PATH, env.join(""));

    const downloads = await Promise.all(assets.map((asset) => downloadBinary(asset.url)));
    assets.forEach((asset, i) => {
      writeFileSync(asset.path, downloads[i]);
      updatedPaths.add(asset.path);
    });

    console.log(`Building with branding: appName=${branding.appName ?? "(default)"}, contactEmail=${branding.contactEmail ? "set" : "(none)"}, logo=${branding.logoUrl ? "custom" : "(default)"}, favicon=${branding.faviconUrl ? "custom" : "(default)"}`);
  } catch (error) {
    console.warn(`Could not fully apply branding, building with generic defaults instead: ${error.message}`);
  }
}

async function main() {
  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    if (REQUIRE_BRANDING) {
      console.error(`error: ${SERVICE_ACCOUNT_PATH} is needed to read the branding - not deploying a generic build.`);
      process.exit(1);
    }
    console.log("No service-account.json, building with generic defaults.");
    buildVite();
    return;
  }

  let branding;
  try {
    branding = readBranding();
  } catch (error) {
    console.error(`error: could not read branding: ${error.message}`);
    process.exit(1);
  }

  if (!Object.keys(ENV_VARS).some((field) => branding?.[field]) && !branding?.logoUrl && !branding?.faviconUrl) {
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
