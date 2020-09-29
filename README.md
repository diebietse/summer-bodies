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

## Configuration

| Configuration Item | Description                                                      |
| ------------------ | ---------------------------------------------------------------- |
| slackWebhookUrl    | Set the [Slack Webhook][slack-webhooks] URL to post messages to. |
| stravaBotId        | Name of the Strava bot account                                   |
| stravaClientId     | Strava OAuth ID of the bot account                               |
| stravaRefreshToken | Strava OAuth refresh token of the bot account                    |
| stravaClientSecret | Strava OAuth client secret token of the bot account              |
| stravaClubs        | Array of Strava clubs to monitor                                 |

An example config upload is provided in [upload-config.ts][upload-config].

### Strava OAuth Refresh Token

To use the Strava API you will need an Oauth refresh token, to get that you will first need to create an [API application][strava-dev], you can then get your client ID and secret from the [strava api settings page][strava-api-settings]

The scope of the Strava OAuth token must be set to `read,activity:read,activity:write`.
Write permission is needed to create the weekly placeholder event

More details on [Strava authentication][strava-oauth] can be found on their website.

You can get a refresh token with the correct scope by running the [create-strava-token.ts][create-strava-token] script:

```console
npm run ts ./examples/create-strava-token.ts -- --clientId <your-client-id> --clientSecret <your-client-secret>
```

Authorize the OAuth login of the strava account you want to give access and you will get the refresh token

## Local Dev

For local development, service account credentials can be created by following [getting started][getting-started] Google guide. Generate JSON service account credentials. Place the credentials in the project root directory and ensure it is named `service-account.json`.

[firestore]: https://firebase.google.com/docs/firestore
[getting-started]: https://cloud.google.com/docs/authentication/getting-started
[google-functions]: https://cloud.google.com/functions
[slack]: https://slack.com
[slack-webhooks]: https://entersekt.slack.com/apps/A0F7XDUAZ-incoming-webhooks
[strava]: https://www.strava.com
[strava-oauth]: https://developers.strava.com/docs/authentication/
[strava-api-settings]: https://www.strava.com/settings/api
[upload-config]: functions/examples/upload-config.ts
[create-strava-token]: functions/examples/create-strava-token.ts
[strava-dev]: https://developers.strava.com/docs/getting-started/#account
[license-badge]: https://img.shields.io/badge/license-MIT-000000.svg
[license-link]: https://github.com/diebietse/summer-bodies/blob/master/LICENSE
[build-badge]: https://github.com/diebietse/summer-bodies/workflows/build/badge.svg?branch=master
[build-link]: https://github.com/diebietse/summer-bodies/actions?query=workflow%3Abuild+branch%3Amaster