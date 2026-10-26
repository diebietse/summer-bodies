# Summer Bodies

[![build-status][build-badge]][build-link]
[![license-badge][license-badge]][license-link]

A simple [Slack][slack] bot that can monitor weekly [Strava][strava] group progress. The Slack bot runs in [Google Functions][google-functions]. A selectable number of groups can be monitored and the results can be posted to a slack channel using a configurable cron job. All configuration for the bot is stored in [Firestore][firestore].

Members in each group can earn points in a group in 2 ways:

## Weekly Goals

Achieve a weekly goal by logging at least 3 activities with a minimum of 30 minutes of active time.

## Weekly Fitcoin

Achieve a position on the leader boards at the end of each week and earn FitCoin. The Top 5 in each category will earn FitCoin.

| Activity Type | Category       | 1st Place | 2nd Place | 3rd Place | 4th Place | 5th Place |
| ------------- | -------------- | --------- | --------- | --------- | --------- | --------- |
|               | Distance       | 5 FitCoin | 4 FitCoin | 3 FitCoin | 2 FitCoin | 1 FitCoin |
| On Wheels     | Duration       | 5 FitCoin | 4 FitCoin | 3 FitCoin | 2 FitCoin | 1 FitCoin |
|               | Elevation      | 5 FitCoin | 5 FitCoin | 3 FitCoin | 2 FitCoin | 1 FitCoin |
| ------------- | -------------- | --------- | --------- | --------- | --------- | --------- |
|               | Distance       | 5 FitCoin | 4 FitCoin | 3 FitCoin | 2 FitCoin | 1 FitCoin |
| On Foot       | Duration       | 5 FitCoin | 4 FitCoin | 3 FitCoin | 2 FitCoin | 1 FitCoin |
|               | Elevation      | 5 FitCoin | 5 FitCoin | 3 FitCoin | 2 FitCoin | 1 FitCoin |
| ------------- | -------------- | --------- | --------- | --------- | --------- | --------- |
| Other         | Duration       | 5 FitCoin | 4 FitCoin | 3 FitCoin | 2 FitCoin | 1 FitCoin |

## Streak Challenge

Log at least 1km of an On Foot activity (Run/Walk/Hike) every single day between `challengeStartDate` and `challengeEndDate`. Missing a day eliminates you for the rest of the challenge, once that week's Sunday 23:59 upload deadline has passed. Everyone still in earns 1 FitCoin for each day survived. Status is shown on the results page, not posted to Slack.

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

## Removing an Athlete

If an athlete revokes access on Strava's side, or asks to have their data removed, run [remove-athlete.ts][remove-athlete] to delete their registration (profile + stored refresh token) and current-challenge streak doc:

```console
npm run ts ./examples/remove-athlete.ts -- --id 12345
# or
npm run ts ./examples/remove-athlete.ts -- --name "First Last"
```

This also fixes the more common reason to need it: a revoked or otherwise invalid refresh token fails that one athlete's Strava fetch, and since a single athlete's failure fails the whole weekly batch (see `publishWeeklyResults` in [bot.ts][bot]), weekly results stop for everyone until the athlete is removed. Daily updates carry on without that athlete and post a warning to the errors channel.

## Re-running a Failed Job

If a scheduled daily update or weekly results run failed (e.g. after removing an athlete as above), run the same job locally with [publish-daily-updates.ts][publish-daily-updates] or [publish-weekly-results.ts][publish-weekly-results]. Slack posts go to `#test-bot` unless you pass another channel or `--live` (the configured channels):

```console
npm run ts ./examples/publish-daily-updates.ts            # check it in #test-bot first
npm run ts ./examples/publish-daily-updates.ts -- --live
npm run ts ./examples/publish-weekly-results.ts -- --live
```

The weekly script stores last week's real FitCoin and streaks whichever channel it posts to, so only run it when the Monday run failed (re-running after a successful run can leave stale FitCoin behind), and before the next Monday, since "last week" is relative to now.

## Lucky Draw

After the challenge, FitCoin becomes tickets in a lucky draw for 20 prizes (one per person). It's built so anyone can check the result without having to trust whoever runs it:

1. **Freeze the entries** once the final weekly results have run (the Monday after the challenge). Pick the draw time - when everyone's draw page draws the winners:

   ```console
   npm run ts ./examples/create-draw-snapshot.ts -- 2026-11-06T12:00:00+02:00 --dry-run   # check it first
   npm run ts ./examples/create-draw-snapshot.ts -- 2026-11-06T12:00:00+02:00
   ```

   [create-draw-snapshot.ts][create-draw-snapshot] stores everyone's FitCoin total and ticket range, the prizes and the [drand](https://drand.love) round published at the draw time, and prints the snapshot's SHA-256 fingerprint and its link, `https://summer-bodies.web.app/draw/<random id>`. It can only be stored once, and only people with the link can see the entries.

2. **Announce it in Slack**: the fingerprint, the draw time and the draw link. Slack's timestamp shows these were fixed before anyone could know the drand round's random number. Until the draw, the page shows a countdown and everyone's tickets.
3. **The draw**: when the countdown reaches zero, everyone's draw page fetches the drand round, checks its signature and works out the winners (1st prize first) by itself. **Watch the reveal** then plays the animation ([lucky-draw.html][lucky-draw]) on the page, from 20th place up to 1st; **Show winners** lists them, with every draw step. Anyone can also re-run the draw with `node scripts/verify-draw.mjs <draw link>` (in `website/`).

To keep or share a video of it, render the reveal with the real winners (needs ffmpeg; takes a minute or two):

```console
npm run ts ./examples/render-reveal.ts -- https://summer-bodies.web.app/draw/<id> ./excluded/lucky-draw-reveal.mp4
```

Locally, `/preview-draw` shows the page with made-up entries. How the reveal animation and its voice-over were made, and how to regenerate them: [docs/lucky-draw/](docs/lucky-draw/).

## Local Dev

For local development, service account credentials can be created by following [getting started][getting-started] Google guide. Generate JSON service account credentials. Place the credentials in the project root directory and ensure it is named `service-account.json`.

[firestore]: https://firebase.google.com/docs/firestore
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
