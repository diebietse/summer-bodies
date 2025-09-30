import { Request, Response, Router } from "express";
import { Firestore } from "./firestore";
import { Strava } from "./strava";
export class Api {
  private router = Router();

  constructor() {
    this.router.post("/athlete", async (req: Request, res: Response) => {
      const { code } = req.body;
      try {
        const config = await Firestore.getConfig();
        const token = await Strava.getTokenFromCode(config.stravaClientId, config.stravaClientSecret, code);
        const alreadyRegistered = await Firestore.athleteIsRegistered(token.athlete.id);
        if (alreadyRegistered) {
          res.status(200).json({ okay: true, message: "You are already registered" });
        } else {
          await Firestore.storeAthlete(token);
          res.status(200).json({ okay: true, message: "Thank you for registering" });
        }
      } catch (error) {
        const message = (error as { message: string }).message;
        res.status(400).json({ error: message });
      }
    });

    this.router.get("/results/:id", async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const results = await Firestore.getResults(id);

        if (results === null) {
          res.status(404).json({ error: "Results not found" });
          return;
        }

        // Parse the JSON string and return the parsed results
        const parsedResults = JSON.parse(results);
        res.status(200).json(parsedResults);
      } catch (error) {
        const message = (error as { message: string }).message;
        res.status(400).json({ error: message || "Failed to retrieve results" });
      }
    });
  }

  public server(): Router {
    return this.router;
  }
}
