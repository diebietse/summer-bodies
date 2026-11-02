# Summer Bodies

[![build-status][build-badge]][build-link]
[![license-badge][license-badge]][license-link]

A simple [Slack][slack] bot that can monitor weekly [Strava][strava] group progress. The Slack bot runs in [Google Functions][google-functions]. A selectable number of groups can be monitored and the results can be posted to a slack channel using a configurable cron job. All configuration for the bot is stored in [Firestore][firestore].

Members in each group can earn points in a group in 2 ways:

## Weekly Goals

Achieve a weekly goal by logging at least 3 activities with a minimum of 30 minutes of active time.

## Weekly Fitcoin

Achieve a position on the leader boards at the end of each week and earn FitCoin. The Top 5 in each category will earn FitCoin. Other has 10 tiers, continuing down to 2 FitCoin, and pays double as it has a single ranking against three for On Foot and On Wheels.

| Activity Type | Category       | 1st Place  | 2nd Place  | 3rd Place  | 4th Place  | 5th Place  |
| ------------- | -------------- | ---------- | ---------- | ---------- | ---------- | ---------- |
|               | Distance       | 5 FitCoin  | 4 FitCoin  | 3 FitCoin  | 2 FitCoin  | 1 FitCoin  |
| On Wheels     | Duration       | 5 FitCoin  | 4 FitCoin  | 3 FitCoin  | 2 FitCoin  | 1 FitCoin  |
|               | Elevation      | 5 FitCoin  | 4 FitCoin  | 3 FitCoin  | 2 FitCoin  | 1 FitCoin  |
| ------------- | -------------- | ---------  | ---------  | ---------  | ---------  | ---------  |
|               | Distance       | 5 FitCoin  | 4 FitCoin  | 3 FitCoin  | 2 FitCoin  | 1 FitCoin  |
| On Foot       | Duration       | 5 FitCoin  | 4 FitCoin  | 3 FitCoin  | 2 FitCoin  | 1 FitCoin  |
|               | Elevation      | 5 FitCoin  | 4 FitCoin  | 3 FitCoin  | 2 FitCoin  | 1 FitCoin  |
| ------------- | -------------- | ---------  | ---------  | ---------  | ---------  | ---------  |
| Other         | Duration       | 20 FitCoin | 18 FitCoin | 16 FitCoin | 14 FitCoin | 12 FitCoin |

Each results page has a FitCoin tab with everyone's FitCoin for that week and their total so far, and the Slack posts include it as an image.

## Streak Challenge

Log at least 1km of an On Foot activity (Run/Walk/Hike) on consecutive days between `challengeStartDate` and `challengeEndDate`. A missed day (once that week's Sunday 23:59 upload deadline has passed) ends your current streak, but you can start a new one the next day - also if you join the challenge late. It's scored once, at the end of the challenge: 1 FitCoin for each day of your longest streak, posted with the final week's results (and counted on its own in the lucky draw). Progress is shown on the results page.

## Configuration

| Configuration Item | Description                                                      |
| ------------------ | ---------------------------------------------------------------- |
| slackWebhookUrl    | Set the [Slack Webhook][slack-webhooks] URL to post messages to. |
| slackChannelErrors | Optional - Slack channel unexpected backend errors are posted to |
| stravaBotId        | Name of the Strava bot account                                   |
| stravaClientId     | Strava OAuth ID of the bot account                               |
| stravaRefreshToken | Strava OAuth refresh token of the bot account                    |
| stravaClientSecret | Strava OAuth client secret token of the bot account              |
| challengeStartDate | Inclusive SAST start date (`YYYY-MM-DD`) of the streak challenge |
| challengeEndDate   | Inclusive SAST end date (`YYYY-MM-DD`) of the streak challenge   |

`stravaWebhookVerifyToken`, `stravaWebhookPathSecret` and `stravaWebhookSubscriptionId` are also stored in the config, but set by [manage-strava-webhook.ts][manage-strava-webhook] `--create` rather than by hand - see [Strava Webhook](#strava-webhook). [upload-config.ts][upload-config] merges into the stored config, so re-uploading keeps them.

An example config upload is provided in [upload-config.ts][upload-config].

## Branding

The website's app name and logo are white-labeled at runtime from Firestore, not baked into the build — see [website's README][website-readme] and [upload-branding.ts][upload-branding].

### Strava OAuth Refresh Token

To use the Strava API you will need an Oauth refresh token, to get that you will first need to create an [API application][strava-dev], you can then get your client ID and secret from the [strava api settings page][strava-api-settings]

> **Note:** Strava no longer allows free accounts to create API applications. You need a paid Strava subscription on the account used to register the application before you can get a client ID and secret.

The scope of the Strava OAuth token must be set to `read,activity:read,activity:write`.
`activity:write` was for a weekly placeholder event the bot no longer creates - nothing writes to Strava any more.

More details on [Strava authentication][strava-oauth] can be found on their website.

You can get a refresh token with the correct scope by running the [create-strava-token.ts][create-strava-token] script:

```console
npm run ts ./examples/create-strava-token.ts -- --clientId <your-client-id> --clientSecret <your-client-secret>
```

Authorize the OAuth login of the strava account you want to give access and you will get the refresh token

## Strava Webhook

Activities reach the bot through a Strava [push subscription][strava-webhooks]: Strava posts every activity create, update and delete, and every athlete deauthorization, to `POST /strava-webhook/<secret>` ([api.ts][api]), which keeps the `activities` Firestore collection up to date. The daily update reads that collection instead of polling Strava. The weekly results still poll every athlete live, score that, and make the collection match the poll, so a missed event can't affect the weekly results.

Strava doesn't sign its events, so they're handled with care ([webhookEvents.ts][webhook-events]):

- The callback URL ends in a secret only Strava knows; requests to any other path get a 404.
- An event is only a prompt to ask Strava: the activity is fetched and stored as Strava returns it, it's only deleted once Strava no longer shows it, and an athlete is only removed for a deauthorization once their token stops working.
- Strava wants a reply within 2 seconds, so the endpoint just queues the event in `webhookEvents`; the `processStravaWebhookEvent` function ([index.ts][index]) handles it from there, retrying failures for up to 20 hours before giving up and reporting it. The daily update reports and clears any event still queued after a day. The function runs in `europe-west1` because a Firestore-triggered function has to run inside the database's location (`eur3`).

Strava allows one subscription per application. Create it after deploying the functions (Strava checks the endpoint during the call), and view or delete it with [manage-strava-webhook.ts][manage-strava-webhook]. `--create` picks a new secret, appends it to `--url`, and saves the secret, the verify token and the subscription id to the config. Delete the old subscription before creating a new one.

```console
npm run ts ./examples/manage-strava-webhook.ts -- --view
npm run ts ./examples/manage-strava-webhook.ts -- --delete --id 12345
npm run ts ./examples/manage-strava-webhook.ts -- --create --url https://us-central1-<project>.cloudfunctions.net/httpServer/strava-webhook
```

`--view` shows the callback URL with its secret, so don't share its output.

Strava sends no heartbeat, so the bot watches for silence itself and reports to the errors channel:

- During the challenge, the daily update checks that Strava still has the configured subscription and that an event has arrived in the last 24 hours.
- The Monday reconciliation lists every activity the webhooks missed (and every stale one it removed) before the week's results are scored.

Webhooks only report changes, so a newly registered athlete's activities since the challenge started are fetched once on registration.

## Between Seasons

Run [reset-season.ts][reset-season] once the season is over, and before the next one's registrations open. It revokes every registered athlete's Strava access and deletes their registration, streak and stored activities, so Strava's connected-athlete count drops back to zero. Everyone registers again for the next season. It first writes a backup of who was registered and their streaks (no tokens or activities) to `functions/excluded/`; delete it once the reset is confirmed.

```console
npm run ts ./examples/reset-season.ts
```

FitCoin and results are kept as history: a season's totals and lucky draw only count the weeks between its own `challengeStartDate` and `challengeEndDate`, plus awards with its start date in their name (the streak challenge's `streak-<challengeStartDate>`). Name any one-off FitCoin correction that way too, e.g. `tie-fix-2027-10-04`, or it won't count.

## Removing an Athlete

If an athlete revokes access on Strava's side, or asks to have their data removed, run [remove-athlete.ts][remove-athlete] to revoke their access on Strava's side and delete their registration (profile + stored refresh token), stored activities and current-challenge streak doc. A deauthorization on Strava's side arrives as a webhook event and removes the athlete automatically, so this is mainly for data-removal requests and broken tokens:

```console
npm run ts ./examples/remove-athlete.ts -- --id 12345
# or
npm run ts ./examples/remove-athlete.ts -- --name "First Last"
```

This also fixes the more common reason to need it: a revoked or otherwise invalid refresh token fails that one athlete's Strava fetch, and since a single athlete's failure fails the whole weekly batch (see `publishWeeklyResults` in [bot.ts][bot]), weekly results stop for everyone until the athlete is removed. The daily update reads the webhook-fed activity store and never touches athlete tokens, so the Monday error is the first sign; [check-athlete-tokens.ts][check-athlete-tokens] finds the broken token.

## Re-running a Failed Job

If a scheduled daily update or weekly results run failed (e.g. after removing an athlete as above), run the same job locally with [publish-daily-updates.ts][publish-daily-updates] or [publish-weekly-results.ts][publish-weekly-results]. Slack posts go to `#test-bot` unless you pass another channel or `--live` (the configured channels):

```console
npm run ts ./examples/publish-daily-updates.ts            # check it in #test-bot first
npm run ts ./examples/publish-daily-updates.ts -- --live
npm run ts ./examples/publish-weekly-results.ts -- --live
```

The weekly script stores last week's real FitCoin and streaks whichever channel it posts to, so only run it when the Monday run failed (re-running after a successful run can leave stale FitCoin behind). "Last week" is relative to now; after the next Monday, pass the Monday the failed week started on, e.g. `--week 2027-10-25`. Re-run missed weeks oldest first, and always re-run a failed final week: the streak challenge's FitCoin is only stored when the final week is scored.

## Lucky Draw

After the challenge, FitCoin becomes tickets in a lucky draw for 20 prizes (one per person). It's built so anyone can check the result without having to trust whoever runs it:

1. **Freeze the entries** once the final weekly results have run (the Monday after the challenge). Pick the draw time - when everyone's draw page draws the winners:

   ```console
   npm run ts ./examples/create-draw-snapshot.ts -- 2026-11-06T12:00:00+02:00 --dry-run   # check it first
   npm run ts ./examples/create-draw-snapshot.ts -- 2026-11-06T12:00:00+02:00
   ```

   [create-draw-snapshot.ts][create-draw-snapshot] stores everyone's FitCoin per week, tickets (each week's FitCoin squared, plus the streak challenge's squared, added up - so a big week counts for more than two small ones, and joining late only costs the weeks missed) and ticket range, the prizes and the [drand](https://drand.love) round published at the draw time, and prints the snapshot's SHA-256 fingerprint and its link, `https://summer-bodies.web.app/draw/<random id>`. It can only be stored once, and only people with the link can see the entries.

2. **Announce it in Slack**: the fingerprint, the draw time and the draw link. Slack's timestamp shows these were fixed before anyone could know the drand round's random number. Until the draw, the page shows a countdown and everyone's tickets.
3. **The draw**: when the countdown reaches zero, everyone's draw page fetches the drand round, checks its signature and works out the winners (1st prize first) by itself. **Watch the reveal** then plays the animation ([lucky-draw.html][lucky-draw]) on the page, from 20th place up to 1st; **Show winners** lists them, with every draw step. Anyone can also re-run the draw with `node scripts/verify-draw.mjs <draw link>` (in `website/`).

To keep or share a video of it, render the reveal with the real winners (needs ffmpeg; takes a minute or two):

```console
npm run ts ./examples/render-reveal.ts -- https://summer-bodies.web.app/draw/<id> ./excluded/lucky-draw-reveal.mp4
```

Locally, `/preview-draw` shows the page with made-up entries. How the reveal animation and its voice-over were made, and how to regenerate them: [docs/lucky-draw/](docs/lucky-draw/).

## Local Dev

For local development, service account credentials can be created by following [getting started][getting-started] Google guide. Generate JSON service account credentials. Place the credentials in the project root directory and ensure it is named `service-account.json`.

### Node Versions

The website runs on the latest Node LTS (`website/.nvmrc`). The functions run on Node 24 (`functions/.nvmrc`, `engines` in `functions/package.json`), as Cloud Functions only has Node 26 in preview and the Firebase CLI can't deploy it yet. Once Node 26 is generally available on [Cloud Functions][functions-runtimes] and the Firebase CLI deploys `nodejs26`, move the functions to it too: both `.nvmrc` files, `engines` and `@types/node`. Going by Node 22 (LTS on 29 October 2024, generally available on Cloud Functions on 18 November 2024), that should be late 2026.

[firestore]: https://firebase.google.com/docs/firestore
[functions-runtimes]: https://cloud.google.com/functions/docs/runtime-support
[getting-started]: https://cloud.google.com/docs/authentication/getting-started
[google-functions]: https://cloud.google.com/functions
[slack]: https://slack.com
[slack-webhooks]: https://api.slack.com/messaging/webhooks
[strava]: https://www.strava.com
[strava-oauth]: https://developers.strava.com/docs/authentication/
[strava-api-settings]: https://www.strava.com/settings/api
[upload-config]: functions/examples/upload-config.ts
[upload-branding]: functions/examples/upload-branding.ts
[remove-athlete]: functions/examples/remove-athlete.ts
[manage-strava-webhook]: functions/examples/manage-strava-webhook.ts
[reset-season]: functions/examples/reset-season.ts
[check-athlete-tokens]: functions/examples/check-athlete-tokens.ts
[api]: functions/src/api.ts
[webhook-events]: functions/src/webhookEvents.ts
[index]: functions/src/index.ts
[strava-webhooks]: https://developers.strava.com/docs/webhooks/
[publish-daily-updates]: functions/examples/publish-daily-updates.ts
[publish-weekly-results]: functions/examples/publish-weekly-results.ts
[create-draw-snapshot]: functions/examples/create-draw-snapshot.ts
[lucky-draw]: website/public/lucky-draw.html
[bot]: functions/src/bot.ts
[website-readme]: website/README.md
[create-strava-token]: functions/examples/create-strava-token.ts
[strava-dev]: https://developers.strava.com/docs/getting-started/#account
[license-badge]: https://img.shields.io/badge/license-MIT-000000.svg
[license-link]: https://github.com/diebietse/summer-bodies/blob/main/LICENSE
[build-badge]: https://github.com/diebietse/summer-bodies/workflows/build/badge.svg?branch=main
[build-link]: https://github.com/diebietse/summer-bodies/actions?query=workflow%3Abuild+branch%3Amain
