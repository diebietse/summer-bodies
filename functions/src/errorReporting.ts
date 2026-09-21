import { isAxiosError } from "axios";
import { Slack } from "./slack";
import { Firestore, SummerBodiesConfig } from "./firestore";

// Axios's own error.message is just "Request failed with status code 400" - useless on its own. When the
// failure came from a downstream API (e.g. Strava), surface its actual response body, which carries the real
// reason (e.g. an expired/already-used authorization code vs bad client credentials).
export function errorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string; errors?: unknown } | undefined;
    if (data?.message) {
      return data.errors ? `${data.message} (${JSON.stringify(data.errors)})` : data.message;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

// True for the specific Strava OAuth error a stale/already-used/refreshed authorization code produces - a
// routine consequence of a user reloading the callback page, not a backend problem. Callers use this to keep
// that noise out of the operational errors channel while still returning/logging the real reason.
export function isExpectedStravaCodeError(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const errors = (error.response?.data as { errors?: { resource?: string; field?: string }[] } | undefined)?.errors;
  return errors?.some((e) => e.resource === "AuthorizationCode" && e.field === "code") ?? false;
}

// Logs, and posts unexpected backend errors to a dedicated Slack channel (config.slackChannelErrors), separate
// from the athlete-facing daily/weekly channels, so operational failures don't get lost in participant-facing
// chatter or missed entirely. Never throws - a missing/misconfigured channel, or the report itself failing,
// must never mask the original error it's reporting.
//
// Pass `config` when the caller already has one in scope, to avoid a second Firestore read for the same
// document; omit it (e.g. when Firestore.getConfig() itself is what failed) and it's fetched fresh.
export async function reportError(context: string, error: unknown, config?: SummerBodiesConfig): Promise<void> {
  console.error(`${context}:`, error);
  try {
    const resolvedConfig = config ?? (await Firestore.getConfig());
    if (!resolvedConfig.slackChannelErrors) return;

    const slack = new Slack(resolvedConfig.slackWebhookUrl, resolvedConfig.slackChannelErrors);
    await slack.post(`🚨 ${context}\n\`\`\`${errorMessage(error)}\`\`\``);
  } catch (reportingError) {
    console.error("Failed to report error to Slack:", reportingError);
  }
}
