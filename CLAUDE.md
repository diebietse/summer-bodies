# summer-bodies

Firebase Functions + Vue 3 app running a Strava-based team fitness challenge ("EnterAktive Challenge").
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
npm run prettier-check # prettier --check "src/**/*.{js,vue}" "scripts/**/*.mjs"
```

`website`'s `npm run build` also runs `scripts/fetch-branding.mjs`, which fetches live branding from the
deployed API and fails the build if that fetch fails - don't assume a failure there is a local/environment
problem without first checking the live `/branding` endpoint.
