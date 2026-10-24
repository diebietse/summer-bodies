<template>
  <div class="draw">
    <img class="logo" :alt="`${appName} logo`" src="../assets/logo.svg" />
    <h1>Lucky Draw</h1>

    <div v-if="loading" class="text-center my-5">
      <div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>
    </div>
    <div v-else-if="error" class="alert alert-warning my-5">{{ error }}</div>

    <template v-else>
      <p class="lead">{{ snapshot.prizes.length }} prizes worth ${{ prizeTotal }}, drawn from {{ snapshot.entries.length }} entries - one ticket per FitCoin.</p>

      <!-- The draw -->
      <div class="mb-4">
        <template v-if="secondsToDraw > 0">
          <p class="text-muted mb-1">The draw is on {{ formatSast(snapshot.drand.roundTime) }}</p>
          <div class="countdown">
            Draw in <strong>{{ formatCountdown(secondsToDraw) }}</strong>
          </div>
        </template>
        <template v-else-if="!result">
          <div v-if="drawError" class="alert alert-danger">
            {{ drawError }}
            <button class="btn btn-sm btn-outline-danger ms-2" @click="runDraw">Try again</button>
          </div>
          <div v-else class="text-muted"><span class="spinner-border spinner-border-sm me-2" role="status"></span>Drawing the winners...</div>
        </template>
        <template v-else>
          <div v-if="watching" class="reveal mb-3">
            <iframe :src="revealUrl" title="Lucky draw reveal" allow="autoplay; fullscreen" allowfullscreen></iframe>
          </div>
          <div class="d-flex gap-2 justify-content-center flex-wrap">
            <button v-if="!watching" class="btn btn-primary btn-lg" @click="watching = true">Watch the reveal</button>
            <button class="btn btn-outline-secondary btn-lg" @click="showWinners = !showWinners">{{ showWinners ? "Hide winners" : "Show winners" }}</button>
          </div>
        </template>
      </div>

      <div v-if="result && showWinners" class="card mb-4">
        <div class="table-responsive">
          <table class="table mb-0">
            <thead class="table-dark">
              <tr>
                <th scope="col">Place</th>
                <th scope="col">Name</th>
                <th scope="col">Prize</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="winner in result.winners" :key="winner.place" :class="{ 'table-warning': winner.place === 1 }">
                <td>{{ winner.place }}</td>
                <td class="fw-bold">{{ winner.name }}</td>
                <td>${{ winner.amountUsd }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <details class="text-start mb-3">
        <summary>Entries and tickets</summary>
        <table class="table table-sm mt-2">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">FitCoin</th>
              <th scope="col">Tickets</th>
              <th scope="col">Chance of drawing first</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in snapshot.entries" :key="entry.name">
              <td>{{ entry.name }}</td>
              <td>{{ entry.fitcoin }}</td>
              <td>{{ entry.firstTicket }}-{{ entry.lastTicket }}</td>
              <td>{{ ((entry.fitcoin / snapshot.totalTickets) * 100).toFixed(1) }}%</td>
            </tr>
          </tbody>
        </table>
      </details>

      <details class="text-start mb-4 audit">
        <summary>Audit it yourself</summary>

        <h6 class="mt-3">Fixed in advance</h6>
        <p class="mb-1">
          Entries fingerprint (SHA-256): <code class="fingerprint">{{ fingerprint }}</code>
        </p>
        <p class="text-muted small">This was announced in Slack before the draw. If it matches, these exact entries, prizes and drand round were fixed before anyone could know the result.</p>

        <h6>The random number</h6>
        <p class="mb-1">
          drand round <a :href="drandUrl" target="_blank" rel="noopener">{{ snapshot.drand.round }}</a
          >, published {{ formatSast(snapshot.drand.roundTime) }}.
        </p>
        <p class="text-muted small">
          <a href="https://drand.love" target="_blank" rel="noopener">drand</a> publishes a signed random number every 3 seconds that nobody can predict or influence.
          <template v-if="result">
            This page checked the round's signature against drand's public key.<br />
            Randomness: <code class="fingerprint">{{ result.beacon.randomness }}</code>
          </template>
        </p>

        <h6>How the winners follow</h6>
        <p class="small">{{ snapshot.algorithm }}</p>

        <template v-if="result">
          <h6>Every draw ({{ result.steps.length }}, including repeats that were skipped)</h6>
          <table class="table table-sm">
            <thead>
              <tr>
                <th scope="col">Draw</th>
                <th scope="col">Ticket</th>
                <th scope="col">Holder</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="step in result.steps" :key="step.draw" :class="{ 'text-muted': !step.place }">
                <td>{{ step.draw }}</td>
                <td>{{ step.ticket }}</td>
                <td>{{ step.name }}</td>
                <td>{{ step.place ? `Place ${step.place}` : "Already won - skipped" }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <h6>Re-run it</h6>
        <p class="small">
          <a :href="snapshotDownloadUrl" download="lucky-draw-snapshot.json">Download the entries snapshot</a> (its SHA-256 is the fingerprint above) and take round {{ snapshot.drand.round }}'s randomness from <a :href="drandUrl" target="_blank" rel="noopener">drand</a>. The ticket for draw 1, in
          Python:
        </p>
        <pre class="small"><code>import hashlib
r = "&lt;randomness&gt;"
print(int(hashlib.sha256(f"{r}:1".encode()).hexdigest(), 16) % {{ snapshot.totalTickets }} + 1)</code></pre>
        <p class="small text-muted mb-0">Or re-run the whole draw, signature check included, from the website folder of the summer-bodies repo: <code>node scripts/verify-draw.mjs lucky-draw-snapshot.json</code></p>
      </details>
    </template>
  </div>
</template>

<script>
import axios from "axios";
import { API_BASE_URL } from "../apiBase";
import { APP_NAME } from "../config";
import { drandRoundUrl, drawWinners, fetchVerifiedBeacon, snapshotFingerprint } from "../draw/luckyDraw";

export default {
  name: "Draw",
  props: {
    // The snapshot's exact text, for the local preview (views/DrawPreview.vue) - otherwise it's loaded from the API.
    mockSnapshotText: { type: String, default: null },
  },
  data() {
    return {
      appName: APP_NAME,
      loading: true,
      error: null,
      snapshotText: null,
      snapshot: null,
      fingerprint: "",
      now: Date.now(),
      timer: null,
      drawing: false,
      drawError: null,
      result: null,
      showWinners: false,
      watching: false,
    };
  },
  computed: {
    prizeTotal() {
      return this.snapshot.prizes.reduce((sum, prize) => sum + prize.amountUsd, 0);
    },
    drandUrl() {
      return drandRoundUrl(this.snapshot.drand.round);
    },
    secondsToDraw() {
      return Math.ceil((Date.parse(this.snapshot.drand.roundTime) - this.now) / 1000);
    },
    // The reveal animation (public/lucky-draw.html) shows the winners in reverse, ending on 1st place.
    revealUrl() {
      const data = { names: this.result.winners.map((winner) => winner.name), entries: this.snapshot.entries.length, app: APP_NAME };
      return `/lucky-draw.html#d=${encodeURIComponent(JSON.stringify(data))}`;
    },
    snapshotDownloadUrl() {
      return `data:application/json;charset=utf-8,${encodeURIComponent(this.snapshotText)}`;
    },
  },
  async mounted() {
    document.title = `${APP_NAME} - Lucky Draw`;
    try {
      this.snapshotText =
        this.mockSnapshotText ??
        // As text, untouched: the fingerprint is of the exact stored bytes.
        (await axios.get(`${API_BASE_URL}/draw/${encodeURIComponent(this.$route.params.id)}`, { responseType: "text", transformResponse: (body) => body })).data;
      this.snapshot = JSON.parse(this.snapshotText);
      this.fingerprint = await snapshotFingerprint(this.snapshotText);
      this.timer = setInterval(this.tick, 1000);
      this.tick();
    } catch (error) {
      this.error = error.response && error.response.status === 404 ? "There's no lucky draw at this link - check you have the whole link from Slack." : "Failed to load the lucky draw. Please try again later.";
    } finally {
      this.loading = false;
    }
  },
  beforeUnmount() {
    clearInterval(this.timer);
  },
  methods: {
    // Draws by itself once the round time has passed - everyone watching the countdown gets their winners at once.
    tick() {
      this.now = Date.now();
      if (this.secondsToDraw <= 0 && !this.result && !this.drawing && !this.drawError) this.runDraw();
    },
    // drand can take a second or two past the round time to publish, so keep trying for a little while.
    async runDraw() {
      this.drawing = true;
      this.drawError = null;
      for (let attempt = 1; ; attempt++) {
        try {
          const beacon = await fetchVerifiedBeacon(this.snapshot.drand.round);
          this.result = { beacon, ...(await drawWinners(this.snapshot, beacon.randomness)) };
          break;
        } catch (error) {
          if (attempt < 10) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }
          console.error("Lucky draw failed:", error);
          this.drawError = `Couldn't get a verified drand beacon for round ${this.snapshot.drand.round}. (${error.message})`;
          break;
        }
      }
      this.drawing = false;
    },
    formatSast(iso) {
      return `${new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "full", timeStyle: "medium" })} SAST`;
    },
    formatCountdown(seconds) {
      const days = Math.floor(seconds / 86400);
      const time = new Date((seconds % 86400) * 1000).toISOString().slice(11, 19);
      return days > 0 ? `${days}d ${time}` : time;
    },
  },
};
</script>

<style scoped>
.draw {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.logo {
  width: 350px;
  max-width: 100%;
  padding: 20px;
}

.fingerprint {
  word-break: break-all;
}

.countdown {
  font-size: 1.5rem;
}

/* The animation is 16:9 with its control bar below; it letterboxes itself to whatever box it gets. */
.reveal iframe {
  width: 100%;
  aspect-ratio: 16 / 10;
  border: 0;
  border-radius: 8px;
}

.audit h6 {
  font-weight: bold;
  margin-top: 1rem;
}

details summary {
  cursor: pointer;
  font-weight: bold;
}

pre {
  background: #f6f8fa;
  padding: 12px;
  border-radius: 6px;
}
</style>
