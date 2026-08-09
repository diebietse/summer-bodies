import open from "open";
import http from "http";
import axios from "axios";
import FormData from "form-data";
import { parseArgs } from "node:util";

const STRAVA_OAUTH = "https://www.strava.com/oauth";

// Get client ID and secret from: https://www.strava.com/settings/api
const {
  values: { clientId, clientSecret },
} = parseArgs({
  options: {
    clientId: { type: "string" },
    clientSecret: { type: "string" },
  },
});

if (!clientId || !clientSecret) {
  console.error("Usage: npm run ts ./examples/create-strava-token.ts -- --clientId <your-client-id> --clientSecret <your-client-secret>");
  process.exit(1);
}

auth(clientId, clientSecret);

// Based on https://github.com/firebase/firebase-tools/blob/v8.11.2/src/auth.js
async function auth(clientId: string, clientSecret: string) {
  const nonce = (Math.random() * (2 << 29)).toString();

  const httpServer = server(nonce, clientId, clientSecret);
  httpServer.listen(0, () => {
    const port = (httpServer.address() as { port: number }).port;
    const callbackUrl = `http://localhost:${port}`;
    const authUrl = `${STRAVA_OAUTH}/authorize?client_id=${clientId}&state=${nonce}&response_type=code&redirect_uri=${callbackUrl}&approval_prompt=force&scope=read,activity:read,activity:write`;

    console.log();
    console.log("Visit this URL on this device to log in:");
    console.log(authUrl);
    console.log();
    console.log("Waiting for authentication...");

    open(authUrl);
  });
}

function server(nonce: string, clientId: string, clientSecret: string): http.Server {
  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.end();
      return;
    }

    const query = new URL(req.url, "http://localhost").searchParams;

    if (query.get("state") !== nonce) {
      res.end();
      return;
    }

    const code = query.get("code");
    if (code) {
      server.close();
      res.end("Authentication Successful");

      const refreshToken = await refreshTokensFromAuthCode(clientId, clientSecret, code);

      console.log();
      console.log(`Authentication Successful, Refresh Token: ${refreshToken}`);
      return;
    } else {
      res.end("Authentication Failed");
      server.close();

      console.log();
      console.log("Authentication Failed");
      return;
    }
  });

  return server;
}

async function refreshTokensFromAuthCode(clientId: string, clientSecret: string, authCode: string): Promise<string> {
  const formData = new FormData();
  formData.append("grant_type", "authorization_code");
  formData.append("client_id", clientId);
  formData.append("client_secret", clientSecret);
  formData.append("code", authCode);

  const res = await axios.post<{ refresh_token: string }>(`${STRAVA_OAUTH}/token`, formData, {
    headers: formData.getHeaders(),
  });

  return res.data.refresh_token;
}
