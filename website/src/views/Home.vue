<template>
  <div class="home">
    <img :alt="`${appName} logo`" src="../assets/logo.svg" />
    <h1>
      {{ appName }}<br />
      <!-- Image from https://developers.strava.com/guidelines/ -->
      <img class="strava-badge" alt="Powered by Strava" src="../assets/strava_powered_by_horiz.svg" />
    </h1>

    <p class="scope-warning">On the next screen, please leave <strong>both</strong> boxes checked - especially "View data about your activities". If you uncheck it, we can't see your activities and the challenge won't work for you.</p>

    <!-- Image from https://developers.strava.com/guidelines/ -->
    <img type="button" @click="startStravaAuth" alt="Connect with Strava" src="../assets/strava_login.svg" />

    <p class="consent-note">By connecting, your name, club, and activity stats (distance, duration, elevation) will be visible to other registered participants on the results pages and leaderboards.</p>
  </div>
</template>

<script>
import { APP_NAME } from "../config";
import { startStravaAuth } from "../stravaAuth";

export default {
  name: "Home",
  components: {},
  data() {
    return {
      appName: APP_NAME,
    };
  },
  methods: {
    startStravaAuth,
  },
  created() {
    document.title = APP_NAME;
  },
};
</script>

<style scoped>
img {
  width: 350px;
  padding: 20px;
}

/* Kept smaller than our own logo so the Strava attribution stays subordinate to our branding,
   per https://developers.strava.com/guidelines/ */
.strava-badge {
  width: 150px;
  padding: 8px;
}

.consent-note {
  max-width: 480px;
  margin: 0 auto;
  padding: 0 20px;
  color: #666;
  font-size: 0.85em;
}

.scope-warning {
  max-width: 480px;
  margin: 0 auto 16px;
  padding: 10px 16px;
  background: #fff3cd;
  border: 1px solid #ffe69c;
  border-radius: 6px;
  color: #664d03;
  font-size: 0.9em;
}
</style>
