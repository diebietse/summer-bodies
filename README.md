# Summer Bodies

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

TODO Add config setup TS file?

| Configuration Item | Description                                                      |
| ------------------ | ---------------------------------------------------------------- |
| slackWebhookUrl    | Set the [Slack Webhook][slack-webhooks] URL to post messages to. |
| stravaBotId        | Name of the Strava bot account                                   |
| stravaClientId     | Strava OAuth ID of the bot account                               |
| stravaRefreshToken | Strava OAuth refresh token of the bot account                    |
| stravaAccessToken  | Strava OAuth access token of the bot account                     |
| stravaClientSecret | Strava OAuth client secret token of the bot account              |
| stravaClubs        | Array of Strava clubs to monitor                                 |

## Local Dev

[firestore]: https://firebase.google.com/docs/firestore
[google-functions]: https://cloud.google.com/functions
[slack]: https://slack.com
[slack-webhooks]: https://entersekt.slack.com/apps/A0F7XDUAZ-incoming-webhooks
[strava]: https://www.strava.com
