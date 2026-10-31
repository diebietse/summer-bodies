<template>
  <div>
    <div class="preview-banner">
      🧪 Local preview - made-up entries, not live.
      <router-link :to="{ path: '/preview-draw', query: { scenario: 'upcoming' } }" :class="{ active: scenario === 'upcoming' }">A day before</router-link>
      ·
      <router-link :to="{ path: '/preview-draw', query: { scenario: 'soon' } }" :class="{ active: scenario === 'soon' }">Draw in 5 seconds</router-link>
      ·
      <router-link :to="{ path: '/preview-draw', query: { scenario: 'drawn' } }" :class="{ active: scenario === 'drawn' }">Drawn</router-link>
      |
      <router-link :to="{ path: '/preview-draw', query: { ...$route.query, format: 'v2' } }" :class="{ active: format === 'v2' }">Squared tickets</router-link>
      ·
      <router-link :to="{ path: '/preview-draw', query: { ...$route.query, format: 'v1' } }" :class="{ active: format === 'v1' }">One ticket per FitCoin (2026)</router-link>
    </div>
    <Draw :key="`${scenario}-${format}`" :mock-snapshot-text="snapshotText" />
  </div>
</template>

<script>
import Draw from "./Draw.vue";
import { mockDrawSnapshot, mockDrawSnapshotV2 } from "../mock/drawSnapshot";

export default {
  name: "DrawPreview",
  components: { Draw },
  computed: {
    scenario() {
      return ["upcoming", "soon"].includes(this.$route.query.scenario) ? this.$route.query.scenario : "drawn";
    },
    format() {
      return this.$route.query.format === "v1" ? "v1" : "v2";
    },
    // The other scenarios move the (already published) round's time ahead, so the countdown shows - "soon" to watch
    // the page draw by itself when it reaches zero.
    snapshotText() {
      const snapshot = this.format === "v1" ? mockDrawSnapshot : mockDrawSnapshotV2;
      const aheadMs = { upcoming: 86400000 + 3723000, soon: 5000, drawn: 0 }[this.scenario];
      const drand = aheadMs ? { ...snapshot.drand, roundTime: new Date(Date.now() + aheadMs).toISOString() } : snapshot.drand;
      return JSON.stringify({ ...snapshot, drand }, null, 2);
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
