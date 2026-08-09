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

| Command                | Purpose                             |
| ----------------------- | ------------------------------------ |
| `npm run serve`         | Start the Vite dev server            |
| `npm run build`         | Build for production into `dist/`    |
| `npm run preview`       | Preview a production build locally   |
| `npm run lint`          | Lint and auto-fix with ESLint        |
| `npm run prettier-check`| Check formatting                     |
| `npm run prettier-fix`  | Auto-format with Prettier            |

## Configuration

The displayed app name comes from the `VITE_APP_NAME` environment variable
(see `website/src/config.js`), defaulting to "Summer Bodies" via the
committed `.env`. Override it locally with a gitignored `.env.local`.

## Deploy

```bash
npm run build
firebase deploy --only hosting
```
