import { Request, Response, Router } from "express";
import { Firestore } from './firestore';
import { Strava } from './strava';
export class Api {
  private router = Router();

  constructor() {
    this.router.post("/athlete", async (req: Request, res: Response) => {
      const { code } = req.body;
      const config = await Firestore.getConfig();
      const token = await Strava.getTokenFromCode(config.stravaClientId, config.stravaClientSecret, code)
      await Firestore.storeAthlete(token);
      res.end();
    });
  }

  public server(): Router {
    return this.router;
  }
}
