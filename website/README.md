# summer-bodies-website

Vue 3 + Vite frontend for the [Strava][strava] OAuth signup flow and results
pages. Talks to the `functions/` API for registration and results data.

[strava]: https://www.strava.com

## Setup

```bash
npm install
npm run serve   # dev server with hot reload
```

## Local preview

`npm run serve`, then visit `/preview` for the results page rendered with committed mock data
(`src/mock/results.js`) instead of a live `/results/:id` fetch — useful for checking layout/styling changes
without needing real Strava/Firestore data. Toggle `?scenario=in-progress` / `?scenario=final` (or the links
on the page) to see both the in-progress and final-results copy.

This route only exists in dev builds — `router/index.js` registers it behind `import.meta.env.DEV`, so it (and
its mock data) are dead-code-eliminated out of `npm run build`'s output.

## Scripts

| Command                  | Purpose                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `npm run serve`          | Start the Vite dev server                                          |
| `npm run build`          | Fetch branding, then build for production into `dist/` (see below) |
| `npm run preview`        | Preview a production build locally                                 |
| `npm run lint`           | Lint and auto-fix with ESLint                                      |
| `npm run prettier-check` | Check formatting                                                   |
| `npm run prettier-fix`   | Auto-format with Prettier                                          |
| `npm run deploy`         | Build and deploy to Firebase Hosting                               |

## Branding

The app name and logo are white-labeled from Firestore rather than a local
overlay folder — the single source of truth is Firestore, set once via
[upload-branding.ts][upload-branding]:

```bash
# from functions/
npm run ts ./examples/upload-branding.ts -- --appName "My Challenge" --logo ./my-logo.svg --favicon ./favicon.ico
```

`--favicon` is optional. This uploads the logo (and favicon, if given) to
Firebase Storage and stores the app name and asset URLs in Firestore for
your project.

`npm run build` (`scripts/fetch-branding.mjs`) fetches that branding at
**build time** — not in the browser — via the deployed `GET /branding`
endpoint, and applies it only for that build:

- Writes `VITE_APP_NAME` into a temporary `.env.local`
- Downloads the logo over `src/assets/logo.svg`, and the favicon (if set)
  over `public/favicon.ico`
- Runs `vite build`
- Restores the generic `.env.local`/`logo.svg`/`favicon.ico` afterward,
  regardless of whether the build succeeds or fails — the working tree is
  never left dirty

Branding has to be baked in at build time (into the static `index.html`
`<title>`, favicon link, and the bundled logo), not fetched by the browser
after the page loads, so that link unfurlers (Slack, WhatsApp, etc.) — which
read the raw HTML and never run JavaScript — see the correct name, logo,
and icon.

If Firestore has no branding configured, or the fetch fails (e.g. no
network), the build falls back to the generic defaults: the `VITE_APP_NAME`
environment variable (see `src/config.js`, defaulting to "Summer Bodies Challenge"
via the committed `.env`) and the committed `src/assets/logo.svg`/`public/favicon.ico`.

[upload-branding]: ../functions/examples/upload-branding.ts

## Deploy

```bash
npm run deploy
```

Each self-hosted deployment runs its own Firebase project; if you've forked
this repo, update `API_BASE_URL` in `src/apiBase.js` to point at your
project's Cloud Functions URL before deploying.
