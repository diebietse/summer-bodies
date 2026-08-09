# summer-bodies-website

Vue 3 + Vite frontend for the [Strava][strava] OAuth signup flow and results
pages. Talks to the `functions/` API for registration and results data.

[strava]: https://www.strava.com

## Setup

```bash
npm install
npm run serve   # dev server with hot reload
```

## Scripts

| Command                  | Purpose                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `npm run serve`          | Start the Vite dev server                                                               |
| `npm run build`          | Build for production into `dist/`                                                       |
| `npm run preview`        | Preview a production build locally                                                      |
| `npm run lint`           | Lint and auto-fix with ESLint                                                           |
| `npm run prettier-check` | Check formatting                                                                        |
| `npm run prettier-fix`   | Auto-format with Prettier                                                               |
| `npm run deploy`         | Build and deploy to Firebase Hosting                                                    |
| `npm run deploy:branded` | Build and deploy with a branding overlay, then restore the generic branding (see below) |

## Configuration

The displayed app name comes from the `VITE_APP_NAME` environment variable
(see `website/src/config.js`), defaulting to "Summer Bodies" via the
committed `.env`. Override it locally with a gitignored `.env.local`.

## Deploy

```bash
npm run deploy
```

To deploy with a different logo/app name (e.g. for a white-labeled
version of this site), point `deploy:branded` at a branding folder
containing `logo.svg` and `.env.local`:

```bash
npm run deploy:branded -- <path-to-branding-folder>
```

The branding is applied only for that build, then reverted — the
working tree is left clean afterward whether the build/deploy
succeeds or fails. See `scripts/deploy-with-branding.sh` for details.
Branding folders themselves aren't part of this repo; keep them
wherever you keep local, gitignored config.
