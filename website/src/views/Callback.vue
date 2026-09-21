<template>
  <img :alt="`${appName} logo`" src="../assets/logo.svg" />
  <h1>
    {{ appName }} Challenge<br />
    <!-- Image from https://developers.strava.com/guidelines/ -->
    <img alt="Powered by Strava" src="../assets/strava_powered_by_horiz.svg" />
  </h1>
  <h2>{{ success }}</h2>
</template>

<script>
import axios from "axios";
import { API_BASE_URL } from "../apiBase";
import { APP_NAME } from "../config";

export default {
  data() {
    return {
      success: "",
      appName: APP_NAME,
    };
  },
  async mounted() {
    console.log("Mounted");
    const firebaseURL = `${API_BASE_URL}/athlete`;

    const code = this.$route.query.code;
    if (!code || !this.$route.query.scope) {
      this.success = "Authorization was not completed. Please try connecting with Strava again.";
      return;
    }

    const scopes = this.$route.query.scope.split(",");
    if (!scopes.includes("read") || !scopes.includes("activity:read")) {
      this.success = "Please ensure 'View data about your activities' is selected as well.";
      return;
    }

    try {
      console.log("posting");
      this.success = "Please wait while your are being registered...";
      const response = await axios.post(`${firebaseURL}`, { code });
      this.success = response.data.message;
    } catch (error) {
      this.success = "Something went wrong...";
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
</style>
