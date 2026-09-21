import { Request, Response, Router } from "express";
import { Firestore, SummerBodiesConfig } from "./firestore";
import { Strava } from "./strava";
import { errorMessage, isExpectedStravaCodeError, reportError } from "./errorReporting";

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
  }

  public server(): Router {
    return this.router;
  }
}
