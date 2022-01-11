import { Request, Response, Router } from "express";
import { Firestore } from './firestore';
import { Strava } from './strava';
export class Api {
  private router = Router();

  constructor() {
    this.router.post("/athlete", async (req: Request, res: Response) => {
      const { code } = req.body;
      try {
        const config = await Firestore.getConfig();
        const token = await Strava.getTokenFromCode(config.stravaClientId, config.stravaClientSecret, code)
        await Firestore.storeAthlete(token);
        res.status(200).json({okay: true});
      }
      catch(error){
        const message = (error as { message : string}).message;
        res.status(400).json({error: message})
      }
      
    });
  }

  public server(): Router {
    return this.router;
  }
}
