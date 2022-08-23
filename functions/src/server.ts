import * as express from "express";
import cors from "cors";
import { Router } from "express";
import { Api } from "./api";

export class Server {
  private router = Router();

  constructor() {
    const api = new Api();
    this.router.use(express.json());
    this.router.use(cors({ origin: true }));
    this.router.use("/", api.server());
  }

  public server(): Router {
    return this.router;
  }
}
