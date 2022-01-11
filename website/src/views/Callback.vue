<template>
  <img alt="Vue logo" src="../assets/logo_dark.png" />
  <h1>Wellness Program</h1>
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
    try {
      console.log("posting");
      await axios.post(`${firebaseURL}`, { code });
      this.success = "Thank you for registering";
    } catch (error) {
      this.success = "Something went wrong...";
    }
  },
};
</script>

<style scoped>
img {
  width: 350px;
  padding: 20px;
}
</style>
