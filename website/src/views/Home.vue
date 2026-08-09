<template>
  <div class="home">
    <img :alt="`${appName} logo`" src="../assets/logo.svg" />
    <h1>
      {{ appName }} Challenge<br />
      <!-- Image from https://developers.strava.com/guidelines/ -->
      <img alt="Powered by Strava" src="../assets/strava_powered_by_horiz.svg" />
    </h1>

    <!-- Image from https://developers.strava.com/guidelines/ -->
    <img type="button" @click="login" alt="Connect with Strava" src="../assets/strava_login.svg" />
  </div>
</template>

<script>
import { APP_NAME } from "../config";

export default {
  name: "Home",
  components: {},
  data() {
    return {
      appName: APP_NAME,
    };
  },
  methods: {
    login() {
      window.location = "https://www.strava.com/oauth/authorize?client_id=52883&response_type=code&scope=activity:read&redirect_uri=https://summer-bodies.web.app/callback";
    },
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
