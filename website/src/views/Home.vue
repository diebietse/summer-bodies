<template>
  <div class="home">
    <img alt="Vue logo" src="../assets/logo_dark.png" />
    <h1>Wellness Program</h1>
    <button type="button" @click="login" class="btn btn-lg btn-primary">Register</button>
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
