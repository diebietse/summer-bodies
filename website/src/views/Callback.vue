<template>
  <img :alt="`${appName} logo`" src="../assets/logo.svg" />
  <h1>
    {{ appName }}<br />
    <!-- Image from https://developers.strava.com/guidelines/ -->
    <img class="strava-badge" alt="Powered by Strava" src="../assets/strava_powered_by_horiz.svg" />
  </h1>

  <div v-if="isError" class="alert alert-danger status-box" role="alert">
    <strong>⚠️ Something's not right</strong>
    <p class="mb-0">{{ message }}</p>
  </div>
  <h2 v-else>{{ message }}</h2>

  <button v-if="isError" type="button" class="btn btn-primary mt-3" @click="startStravaAuth">Try again</button>
</template>

<script>
import axios from "axios";
import { API_BASE_URL } from "../apiBase";
import { APP_NAME } from "../config";
import { startStravaAuth } from "../stravaAuth";

export default {
  data() {
    return {
      message: "",
      appName: APP_NAME,
      isError: false,
    };
  },
  methods: {
    startStravaAuth,
  },
  async mounted() {
    console.log("Mounted");
    const firebaseURL = `${API_BASE_URL}/athlete`;

    const code = this.$route.query.code;
    if (!code || !this.$route.query.scope) {
      this.message = "Authorization was not completed. Please try connecting with Strava again.";
      this.isError = true;
      return;
    }

    const scopes = this.$route.query.scope.split(",");
    if (!scopes.includes("read") || !scopes.includes("activity:read")) {
      this.message = "Please ensure 'View data about your activities' is selected as well.";
      this.isError = true;
      return;
    }

    try {
      console.log("posting");
      this.message = "Please wait while your are being registered...";
      const response = await axios.post(`${firebaseURL}`, { code });
      this.message = response.data.message;
    } catch (error) {
      this.message = "Something went wrong...";
      this.isError = true;
    }
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

.status-box {
  max-width: 480px;
  margin: 0 auto;
}
</style>
