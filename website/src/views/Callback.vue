<template>
  <img alt="Vue logo" src="../assets/entersekt.svg" />
  <h1>
    Wellness Program<br />
    <!-- Image from https://developers.strava.com/guidelines/ -->
    <img alt="Entersekt logo" src="../assets/strava_powered_by_horiz.svg" />
  </h1>
  <h2>{{ success }}</h2>
</template>

<script>
import axios from "axios";

export default {
  data() {
    return {
      success: "",
    };
  },
  async mounted() {
    console.log("Mounted");
    const firebaseURL =
      "https://us-central1-summer-bodies.cloudfunctions.net/httpServer/athlete";

    const code = this.$route.query.code;
    const scopes = this.$route.query.scope.split(",");
    const group = localStorage.getItem("groupSetting");
    if (!scopes.includes("read") || !scopes.includes("activity:read")) {
      this.success =
        "Please ensure 'View data about your activities' is selected as well.";
      return;
    }

    try {
      console.log("posting");
      const response = await axios.post(`${firebaseURL}`, { code, group });
      this.success = response.data.message;
    } catch (error) {
      this.success = "Something went wrong...";
    }
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
