<template>
  <div>
    <div class="preview-banner">
      🧪 Local preview - mock data, not live.
      <router-link :to="{ path: '/preview', query: { scenario: 'in-progress' } }" :class="{ active: scenario === 'in-progress' }">In progress</router-link>
      ·
      <router-link :to="{ path: '/preview', query: { scenario: 'final' } }" :class="{ active: scenario === 'final' }">Final</router-link>
    </div>
    <Results :mock-data="previewResults" />
  </div>
</template>

<script>
import Results from "./Results.vue";
import { mockResults } from "../mock/results";

export default {
  name: "Preview",
  components: { Results },
  computed: {
    scenario() {
      return this.$route.query.scenario === "final" ? "final" : "in-progress";
    },
    previewResults() {
      // Everything else in the fixture is the same for both scenarios - only currentTime (relative to
      // endDate) needs to change to flip Results.vue's isResultsInProgress banner/copy.
      const currentTime = this.scenario === "final" ? mockResults.endDate + 3600 : mockResults.currentTime;
      return { ...mockResults, currentTime };
    },
  },
};
</script>

<style scoped>
.preview-banner {
  background: #fff3cd;
  color: #664d03;
  border-bottom: 1px solid #ffe69c;
  padding: 8px 16px;
  text-align: center;
  font-size: 13px;
}

.preview-banner a {
  color: #664d03;
  font-weight: 600;
}

.preview-banner a.active {
  text-decoration: underline;
}
</style>
