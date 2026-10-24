<template>
  <div>
    <div class="preview-banner">
      🧪 Local preview - made-up entries, not live.
      <router-link :to="{ path: '/preview-draw', query: { scenario: 'upcoming' } }" :class="{ active: scenario === 'upcoming' }">A day before</router-link>
      ·
      <router-link :to="{ path: '/preview-draw', query: { scenario: 'soon' } }" :class="{ active: scenario === 'soon' }">Draw in 5 seconds</router-link>
      ·
      <router-link :to="{ path: '/preview-draw', query: { scenario: 'drawn' } }" :class="{ active: scenario === 'drawn' }">Drawn</router-link>
    </div>
    <Draw :key="scenario" :mock-snapshot-text="snapshotText" />
  </div>
</template>

<script>
import Draw from "./Draw.vue";
import { mockDrawSnapshot } from "../mock/drawSnapshot";

export default {
  name: "DrawPreview",
  components: { Draw },
  computed: {
    scenario() {
      return ["upcoming", "soon"].includes(this.$route.query.scenario) ? this.$route.query.scenario : "drawn";
    },
    // The other scenarios move the (already published) round's time ahead, so the countdown shows - "soon" to watch
    // the page draw by itself when it reaches zero.
    snapshotText() {
      const aheadMs = { upcoming: 86400000 + 3723000, soon: 5000, drawn: 0 }[this.scenario];
      const drand = aheadMs ? { ...mockDrawSnapshot.drand, roundTime: new Date(Date.now() + aheadMs).toISOString() } : mockDrawSnapshot.drand;
      return JSON.stringify({ ...mockDrawSnapshot, drand }, null, 2);
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
}

.preview-banner a.active {
  font-weight: bold;
}
</style>
