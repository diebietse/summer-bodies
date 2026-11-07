import { Request, Response, Router } from "express";
import { Firestore, SummerBodiesConfig } from "./firestore";
import { Strava } from "./strava";
import { errorMessage, isExpectedStravaCodeError, reportError } from "./errorReporting";
import { backfillAthleteActivities } from "./activityStore";
import { registerAthlete } from "./registration";
import { webhookPostResponse, webhookVerificationResponse } from "./activityLogic";
import { dateStringUnix, now } from "./util";

export class Api {
  private router = Router();

  constructor() {
    this.router.post("/athlete", async (req: Request, res: Response) => {
      const { code } = req.body;
      let config: SummerBodiesConfig | undefined;
      try {
        config = await Firestore.getConfig();
        const token = await Strava.getTokenFromCode(config.stravaClientId, config.stravaClientSecret, code);
        const { stravaClientId, stravaClientSecret } = config;
        const registered = await registerAthlete(token, {
          isRegistered: (athleteId) => Firestore.athleteIsRegistered(athleteId),
          store: (newToken) => Firestore.storeAthlete(newToken),
          saveToken: (athleteId, refreshToken) => Firestore.updateAthleteRefreshToken(athleteId.toString(), refreshToken),
          revoke: (refreshToken) => Strava.revokeToken(stravaClientId, stravaClientSecret, refreshToken),
          reportError: (context, error) => reportError(context, error, config),
        });
        if (!registered) {
          res.status(200).json({ okay: true, message: "You are already registered" });
        } else {
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

    // A lucky draw snapshot by its secret link id, sent as the exact stored text so the page can check its SHA-256
    // fingerprint against the announced one.
    this.router.get("/draw/:id", async (req: Request, res: Response) => {
      try {
        const id = String(req.params.id);
        const snapshot = await Firestore.getDrawSnapshot(id);
        if (snapshot === null) {
          res.status(404).json({ error: "Lucky draw not found" });
          return;
        }
        res.status(200).type("application/json").send(snapshot);
      } catch (error) {
        await reportError("Error fetching the lucky draw snapshot", error);
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

    // One-time validation handshake Strava performs when a push subscription is created (or re-verified) -
    // see functions/examples/manage-strava-webhook.ts. Must echo hub.challenge within 2s. The last path segment is
    // the secret part of the callback URL: Strava doesn't sign webhook events, so knowing the URL is what tells
    // Strava's requests apart from anyone else's.
    this.router.get("/strava-webhook/:secret", async (req: Request, res: Response) => {
      try {
        const { status, body } = webhookVerificationResponse(String(req.params.secret), req.query, await Firestore.getConfig());
        res.status(status).json(body);
      } catch (error) {
        await reportError("Error handling Strava webhook verification", error);
        res.status(500).json({ error: errorMessage(error) });
      }
    });

    // Activity create/update/delete and athlete-deauthorization events - see Strava's webhook docs
    // (https://developers.strava.com/docs/webhooks/). Strava wants a 200 within 2 seconds and retries otherwise, so
    // this only checks the event and queues it; processStravaWebhookEvent (index.ts) then checks it with Strava and
    // applies it - see webhookEvents.ts.
    this.router.post("/strava-webhook/:secret", async (req: Request, res: Response) => {
      try {
        const response = webhookPostResponse(String(req.params.secret), req.body, await Firestore.getConfig());
        if (response.warning) console.warn(response.warning);
        if (response.queue) await Firestore.queueWebhookEvent(response.queue);
        res.status(response.status).json(response.body);
      } catch (error) {
        // A non-200 lets Strava's own retry try again.
        await reportError("Error queueing Strava webhook event", error);
        res.status(500).json({ error: errorMessage(error) });
      }
    });
  }

  public server(): Router {
    return this.router;
  }
}
