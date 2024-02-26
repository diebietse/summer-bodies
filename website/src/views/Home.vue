<template>
  <div class="home">
    <img alt="Entersekt logo" src="../assets/logo_dark.png" />
    <h1>
      Wellness Program<br />
      <!-- Image from https://developers.strava.com/guidelines/ -->
      <img alt="Entersekt logo" src="../assets/strava_powered_by_horiz.svg" />
    </h1>
    <div class="py-3">
      <div class="form-check">
        <input
          class="form-check-input"
          type="radio"
          value="Group 1"
          v-model="group"
          name="flexRadioDefault"
          id="flexRadioDefault1"
        />
        <label class="form-check-label" for="flexRadioDefault1">
          I exercise a lot! (3+ times a week)
        </label>
      </div>
      <div class="form-check">
        <input
          class="form-check-input"
          type="radio"
          value="Group 2"
          v-model="group"
          name="flexRadioDefault"
          id="flexRadioDefault2"
        />
        <label class="form-check-label" for="flexRadioDefault2">
          I exercise sometimes (less than 3 times a week)
        </label>
      </div>
    </div>

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
  data() {
    return {
      group: "Group 1",
    };
  },
  methods: {
    login() {
      localStorage.setItem("groupSetting", this.group);
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
