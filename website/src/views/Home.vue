<template>
  <div class="home">
    <img alt="Entersekt logo" src="../assets/entersekt.svg" />
    <h1>
      Enteraktive Challenge<br />
      <!-- Image from https://developers.strava.com/guidelines/ -->
      <img alt="Entersekt logo" src="../assets/strava_powered_by_horiz.svg" />
    </h1>

    <!-- Image from https://developers.strava.com/guidelines/ -->
    <img
      type="button"
      @click="login"
      alt="Connect with Strava"
      src="../assets/strava_login.svg"
    />
  </div>
</template>

<script>
export default {
  name: "Home",
  components: {},
  methods: {
    login() {
      window.location =
        "https://www.strava.com/oauth/authorize?client_id=52883&response_type=code&scope=activity:read&redirect_uri=https://summer-bodies.web.app/callback";
    },
  },
  created() {
    document.title = "Summer Bodies";
  },
};
</script>

<style scoped>
img {
  width: 350px;
  padding: 20px;
}
</style>
