# summer-bodies

Firebase Functions + Vue 3 app running a Strava-based team fitness challenge.

This repo is public and generic: keep anything specific to one deployment (organization, people, Slack channels,
Strava app ids) out of it - that lives in Firestore config/branding, and notes about it in the gitignored
`CLAUDE.local.md`.
Two independent packages: `functions/` (Cloud Functions, TypeScript) and `website/` (Vite + Vue 3).

## Before committing

Run the same checks CI runs (`.github/workflows/build.yml`), scoped to whichever package changed - not an
ad hoc equivalent. `npx tsc --noEmit` and `npx prettier --check <file>` are not the same checks and can pass
locally while CI still fails on the real scripts below.

**`functions/` (any `.ts` change):**

```
npm run typecheck      # tsc --noEmit -p tsconfig.typecheck.json - also covers examples/, not just src/
npm test
npm run prettier-check # prettier --check "**/*.ts" - every .ts file in the package, not just the ones touched
```

**`website/` (any `.js`/`.vue` change):**

```
npx eslint .
npm test               # node --test "src/**/*.test.js"
npm run prettier-check # prettier --check "src/**/*.{js,vue}" "scripts/**/*.mjs"
```

`website`'s `npm run build` runs `scripts/fetch-branding.mjs`, which reads the branding from Firestore through
`functions/examples/export-branding.ts` when the root `service-account.json` exists (so `functions/` needs its
dependencies installed) and builds generic without it, as CI does.
