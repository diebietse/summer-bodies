import portfinder from "portfinder";
import open from "open";
import http from "http";
import url from "url";
import axios from "axios";
import FormData from "form-data";
import yargs from "yargs";

portfinder.basePort = 9005;

const STRAVA_OAUTH = "https://www.strava.com/oauth";

// Get client ID and secret from: https://www.strava.com/settings/api
const argv = yargs.options({
  clientId: { type: "string", demandOption: true },
  clientSecret: { type: "string", demandOption: true },
}).argv;

auth(argv.clientId, argv.clientSecret);

// Based on https://github.com/firebase/firebase-tools/blob/v8.11.2/src/auth.js
async function auth(clientId: string, clientSecret: string) {
  const nonce = (Math.random() * (2 << 29)).toString();
  const port = await portfinder.getPortPromise();
  const callbackUrl = `http://localhost:${port}`;
  const authUrl = `${STRAVA_OAUTH}/authorize?client_id=${clientId}&state=${nonce}&response_type=code&redirect_uri=${callbackUrl}&approval_prompt=force&scope=read,activity:read,activity:write`;

  server(nonce, clientId, clientSecret).listen(port, () => {
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

    const query = url.parse(req.url, true).query;

    if (query.state !== nonce) {
      res.end();
      return;
    }

    if (query.code) {
      const code = typeof query.code === "string" ? query.code : query.code[0];
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
