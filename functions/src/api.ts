import { Request, Response, Router } from "express";
import { isAxiosError } from "axios";
import { Firestore, SummerBodiesConfig } from "./firestore";
import { Strava, StravaWebhookEvent } from "./strava";
import { errorMessage, isExpectedStravaCodeError, reportError } from "./errorReporting";
import { backfillAthleteActivities, refreshAndPersistAthleteToken } from "./activityStore";
import { isDeauthorizationEvent, toStoredActivity } from "./activityLogic";
import { dateStringUnix, now } from "./util";

const DEFAULT_APP_NAME = "Summer Bodies Challenge";

export class Api {
  private router = Router();

  constructor() {
    this.router.post("/athlete", async (req: Request, res: Response) => {
      const { code } = req.body;
      let config: SummerBodiesConfig | undefined;
      try {
        config = await Firestore.getConfig();
        const token = await Strava.getTokenFromCode(config.stravaClientId, config.stravaClientSecret, code);
        const alreadyRegistered = await Firestore.athleteIsRegistered(token.athlete.id);
        if (alreadyRegistered) {
          res.status(200).json({ okay: true, message: "You are already registered" });
        } else {
          await Firestore.storeAthlete(token);

          // Backfill: webhooks only fire for *future* activity changes, so without this, a mid-challenge
          // registrant's activities from earlier in the challenge would be invisible until the next weekly
          // reconciliation poll. Failure here is non-fatal to registration itself - the gap just waits for
          // this athlete's next webhook event or the next weekly reconciliation instead.
          try {
            const athlete = {
              id: token.athlete.id.toString(),
              firstname: token.athlete.firstname,
              lastname: token.athlete.lastname,
              profile: token.athlete.profile,
              refreshToken: token.refresh_token,
            };
            await backfillAthleteActivities(
              config.stravaClientId,
              config.stravaClientSecret,
              athlete,
              dateStringUnix(config.challengeStartDate),
              now(),
            );
          } catch (error) {
            await reportError("Error backfilling new athlete's activities", error, config);
          }

          res.status(200).json({ okay: true, message: "Thank you for registering" });
        }
      } catch (error) {
        // A stale/already-used authorization code (e.g. the user reloaded the callback page) is a routine,
        // expected user-side outcome, not a backend problem - don't spam the operational errors channel for it.
        if (isExpectedStravaCodeError(error)) {
          console.error("Error registering athlete (expected - stale/reused authorization code):", error);
        } else {
          await reportError("Error registering athlete", error, config);
        }
        res.status(400).json({ error: errorMessage(error) });
      }
    });

    this.router.get("/results/:id", async (req: Request, res: Response) => {
      try {
        const id = String(req.params.id);
        const results = await Firestore.getResults(id);

        if (results === null) {
          res.status(404).json({ error: "Results not found" });
          return;
        }

        // Parse the JSON string and return the parsed results
        const parsedResults = JSON.parse(results);
        res.status(200).json(parsedResults);
      } catch (error) {
        await reportError("Error fetching results", error);
        res.status(400).json({ error: errorMessage(error) });
      }
    });

    this.router.get("/strava-config", async (_req: Request, res: Response) => {
      // The OAuth client_id is not a secret - it's already visible in the authorize URL the browser navigates
      // to. Serving it from here (instead of hardcoding it in the website) keeps the website's OAuth redirect
      // and the backend's token exchange from ever using two different Strava applications - see the
      // "AuthorizationCode / code / invalid" incident this fixes.
      try {
        const config = await Firestore.getConfig();
        res.status(200).json({ clientId: config.stravaClientId });
      } catch (error) {
        await reportError("Error fetching Strava config", error);
        res.status(500).json({ error: "Could not load Strava configuration" });
      }
    });

    this.router.get("/branding", async (_req: Request, res: Response) => {
      // Always 200 with sane defaults - a branding lookup failure should never break the page.
      const branding = await Firestore.getBranding().catch(async (error) => {
        await reportError("Error fetching branding", error);
        return null;
      });
      res.status(200).json({
        appName: branding?.appName || DEFAULT_APP_NAME,
        logoUrl: branding?.logoUrl || null,
        faviconUrl: branding?.faviconUrl || null,
      });
    });

    // One-time validation handshake Strava performs when a push subscription is created (or re-verified) -
    // see functions/examples/manage-strava-webhook.ts. Must echo hub.challenge within 2s.
    this.router.get("/strava-webhook", async (req: Request, res: Response) => {
      try {
        const config = await Firestore.getConfig();
        const verified = req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === config.stravaWebhookVerifyToken;
        if (verified) {
          res.status(200).json({ "hub.challenge": req.query["hub.challenge"] });
        } else {
          res.status(403).json({ error: "Verification token mismatch" });
        }
      } catch (error) {
        await reportError("Error handling Strava webhook verification", error);
        res.status(500).json({ error: errorMessage(error) });
      }
    });

    // Activity create/update/delete and athlete-deauthorization events - see Strava's webhook docs
    // (https://developers.strava.com/docs/webhooks/). Processed synchronously (not decoupled via a staging
    // collection + background trigger): each event is at most one token refresh + one activity detail fetch
    // + one Firestore write, Strava retries a failed/slow delivery up to 3 times, and every write here is
    // idempotent - that's judged sufficient for this app's scale without the added complexity of a fully
    // decoupled ack/process pipeline. A non-200 here is deliberate on failure, so Strava's own retry gives a
    // transient error (e.g. a momentary Firestore hiccup) a chance to succeed on its own.
    this.router.post("/strava-webhook", async (req: Request, res: Response) => {
      try {
        await this.handleWebhookEvent(req.body as StravaWebhookEvent);
        res.status(200).json({});
      } catch (error) {
        await reportError("Error processing Strava webhook event", error);
        res.status(500).json({ error: errorMessage(error) });
      }
    });
  }

  // Strava doesn't sign webhook payloads, so the one thing this must not skip is checking owner_id actually
  // corresponds to a registered athlete before acting on anything else in the event.
  private async handleWebhookEvent(event: StravaWebhookEvent): Promise<void> {
    const athleteId = event.owner_id.toString();
    const athlete = await Firestore.getAthlete(athleteId);
    if (!athlete) return;

    if (event.object_type === "athlete") {
      if (isDeauthorizationEvent(event)) {
        const config = await Firestore.getConfig();
        await Firestore.removeAthlete(athleteId, config.challengeStartDate);
      }
      return;
    }

    if (event.aspect_type === "delete") {
      await Firestore.deleteActivity(event.object_id, athleteId);
      return;
    }

    // Known narrow race, accepted rather than locked against: two webhook events for the same athlete
    // arriving close together could both read this same refreshToken before either persists its rotation,
    // and Strava invalidates a refresh token as soon as it's used - so the loser's refresh fails. That
    // failure returns a non-200 below, and Strava retries the delivery, which by then reads the already-
    // updated token and succeeds - self-healing without needing a per-athlete lock.
    const config = await Firestore.getConfig();
    const accessToken = await refreshAndPersistAthleteToken(config.stravaClientId, config.stravaClientSecret, athlete);

    const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
    try {
      const activity = await strava.getActivity(accessToken, event.object_id);
      await Firestore.upsertActivity(toStoredActivity(activity, athleteId, event.event_time));
    } catch (error) {
      // A 404/403 here means the activity is no longer visible to us (e.g. made private) - treat it the same
      // way a live poll already implicitly would (it just wouldn't be in the list anymore), rather than as a
      // processing failure.
      if (isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 403)) {
        await Firestore.deleteActivity(event.object_id, athleteId);
        return;
      }
      throw error;
    }
  }

  public server(): Router {
    return this.router;
  }
}
