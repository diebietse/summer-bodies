// Starts the Strava OAuth flow. client_id is fetched from the backend (Firestore's config) rather than
// hardcoded here, so the website's authorize redirect and the backend's token exchange can never end up using
// two different Strava applications - see GET /strava-config in functions/src/api.ts. redirect_uri is derived
// from the current origin rather than hardcoded or configured, since a stale value there would reproduce the
// exact same class of bug for a different field.
import axios from "axios";
import { API_BASE_URL } from "./apiBase";

export async function startStravaAuth() {
  try {
    const response = await axios.get(`${API_BASE_URL}/strava-config`);
    const redirectUri = `${window.location.origin}/callback`;
    const params = new URLSearchParams({
      client_id: response.data.clientId,
      response_type: "code",
      scope: "activity:read",
      redirect_uri: redirectUri,
    });
    window.location = `https://www.strava.com/oauth/authorize?${params.toString()}`;
  } catch (error) {
    console.error("Failed to start Strava authorization:", error);
    alert("Couldn't start the Strava connection - please try again in a moment.");
  }
}
