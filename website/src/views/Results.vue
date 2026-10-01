<template>
  <div class="results">
    <img :alt="`${appName} logo`" src="../assets/logo.svg" />
    <h1>
      <span v-if="isResultsInProgress"> In progress results for {{ formatDateRange() }}<br />Results generated on {{ currentDateFormatted }} </span>
      <span v-else> Final results for {{ formatDateRange() }} </span>
      <br />
      <img class="strava-badge" alt="Powered by Strava" src="../assets/strava_powered_by_horiz.svg" />
    </h1>

    <!-- Loading indicator -->
    <div v-if="loading" class="text-center my-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-3">Loading results...</p>
    </div>

    <!-- Error message -->
    <div v-if="error" class="alert alert-danger text-center my-5">
      <h4>Error</h4>
      <p>{{ error }}</p>
      <button class="btn btn-primary" @click="$router.go(0)">Retry</button>
    </div>

    <!-- Main content - only show when not loading and no error -->
    <div v-if="!loading && !error && results">
      <div v-if="!screenshot && !hideTabs" class="nav-tabs-container">
        <ul class="nav nav-tabs justify-content-center" role="tablist">
          <li class="nav-item" role="presentation">
            <button class="nav-link" :class="{ active: activeTab === 'challenges' }" @click="activeTab = 'challenges'" type="button">Challenge Results</button>
          </li>
          <li class="nav-item" role="presentation">
            <button class="nav-link" :class="{ active: activeTab === 'goals' }" @click="activeTab = 'goals'" type="button">Goal Achievements</button>
          </li>
          <li v-if="hasStreaks" class="nav-item" role="presentation">
            <button class="nav-link" :class="{ active: activeTab === 'streak' }" @click="activeTab = 'streak'" type="button">Streak Challenge</button>
          </li>
          <li v-if="hasAthletes" class="nav-item" role="presentation">
            <button class="nav-link" :class="{ active: activeTab === 'athletes' }" @click="activeTab = 'athletes'" type="button">Registered Athletes</button>
          </li>
        </ul>
      </div>

      <!-- Challenge Results Tab -->
      <div v-if="activeTab === 'challenges' || screenshot" class="tab-content">
        <div class="challenge-results">
          <div v-for="challenge in results.topResults" :key="challenge.name" class="challenge-section">
            <h2 class="challenge-title">{{ challenge.name }}</h2>

            <div class="row justify-content-center">
              <div v-for="grouping in challenge.groupings" :key="grouping.name" class="mb-4" :class="challenge.groupings.length === 1 ? 'col-12 col-md-8 col-lg-6' : 'col-md-6 col-lg-4'">
                <div class="card h-100">
                  <div class="card-header">
                    <h5 class="card-title mb-0">
                      {{ grouping.name }}
                      <span v-if="grouping.unit" class="text-muted small">({{ grouping.unit }})</span>
                    </h5>
                  </div>
                  <div class="card-body p-0">
                    <div class="table-responsive">
                      <table class="table table-sm mb-0" :class="{ 'grouping-table': challenge.groupings.length > 1 }">
                        <thead class="table-dark">
                          <tr>
                            <th scope="col">#</th>
                            <th scope="col">Name</th>
                            <th scope="col">{{ grouping.name }}</th>
                            <th v-if="challenge.name === otherCategory" scope="col">Activities</th>
                            <th scope="col">FitCoin</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(contestant, index) in grouping.contestants" :key="contestant.name" :class="getRowClass(index)">
                            <td>
                              <span class="position-badge" :class="getPositionClass(index)">
                                {{ index + 1 }}
                              </span>
                            </td>
                            <td class="fw-bold">{{ contestant.name }}</td>
                            <td>{{ formatValue(contestant.total, grouping.unit) }}</td>
                            <td v-if="challenge.name === otherCategory" class="text-muted small">{{ (contestant.activityTypes || []).join(", ") }}</td>
                            <td>
                              <span class="badge bg-warning text-dark">{{ contestant.fitcoin }}</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Goal Achievements Tab -->
      <div v-if="activeTab === 'goals'" class="tab-content">
        <div class="goal-results">
          <h2 class="section-title">Goal Achievements</h2>

          <!-- Summary Stats -->
          <div class="row mb-4">
            <div class="col-md-3 col-sm-6 mb-3">
              <div class="card text-center bg-success text-white">
                <div class="card-body">
                  <h3 class="card-title">{{ achievedCount }}</h3>
                  <p class="card-text">Goals Achieved</p>
                </div>
              </div>
            </div>
            <div class="col-md-3 col-sm-6 mb-3">
              <div class="card text-center bg-danger text-white">
                <div class="card-body">
                  <h3 class="card-title">{{ notAchievedCount }}</h3>
                  <p class="card-text">Goals Not Achieved</p>
                </div>
              </div>
            </div>
            <div class="col-md-3 col-sm-6 mb-3">
              <div class="card text-center bg-info text-white">
                <div class="card-body">
                  <h3 class="card-title">{{ totalFitcoin }}</h3>
                  <p class="card-text">Total FitCoin Earned</p>
                </div>
              </div>
            </div>
            <div class="col-md-3 col-sm-6 mb-3">
              <div class="card text-center bg-warning text-dark">
                <div class="card-body">
                  <h3 class="card-title">{{ Math.round(achievementRate) }}%</h3>
                  <p class="card-text">Achievement Rate</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Filter Buttons -->
          <div class="mb-3 text-center">
            <div class="btn-group" role="group">
              <button type="button" class="btn btn-outline-primary" :class="{ active: goalFilter === 'all' }" @click="goalFilter = 'all'">All ({{ results.goalResults.length }})</button>
              <button type="button" class="btn btn-outline-success" :class="{ active: goalFilter === 'achieved' }" @click="goalFilter = 'achieved'">Achieved ({{ achievedCount }})</button>
              <button type="button" class="btn btn-outline-danger" :class="{ active: goalFilter === 'not-achieved' }" @click="goalFilter = 'not-achieved'">Not Achieved ({{ notAchievedCount }})</button>
            </div>
          </div>

          <!-- Goals Table -->
          <div class="card">
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table mb-0">
                  <thead class="table-dark">
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Status</th>
                      <th scope="col">Activities</th>
                      <th scope="col">Total Time</th>
                      <th scope="col">FitCoin</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="participant in filteredGoalResults" :key="participant.name" :class="participant.achieved ? 'table-success' : 'table-light'">
                      <td class="fw-bold">{{ participant.name }}</td>
                      <td>
                        <span class="badge" :class="participant.achieved ? 'bg-success' : 'bg-secondary'">
                          {{ participant.achieved ? "Achieved" : "Not Achieved" }}
                        </span>
                      </td>
                      <td>{{ participant.activities }}/{{ participant.goal }}</td>
                      <td>{{ formatTime(participant.totalTimeMin) }}</td>
                      <td>
                        <span class="badge bg-warning text-dark">{{ participant.fitcoin }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Streak Challenge Tab - also shown in screenshot mode (below Challenge Results), so the daily/weekly
           Slack screenshot surfaces who's still surviving the 1km-a-day streak, not just the leaderboards. -->
      <div v-if="hasStreaks && (activeTab === 'streak' || screenshot)" class="tab-content">
        <div class="streak-results">
          <h2 class="section-title">1km-a-day Streak Challenge</h2>
          <p v-if="isResultsInProgress" class="text-muted text-center mb-4">On track so far this week - not final. Missing a day doesn't eliminate you until this week's Sunday 23:59 upload deadline has passed.</p>
          <p v-else class="text-muted text-center mb-4">This week's result - final.</p>

          <div class="row mb-4 justify-content-center">
            <div class="col-md-3 col-sm-6 mb-3">
              <div class="card text-center bg-success text-white">
                <div class="card-body">
                  <h3 class="card-title">{{ stillInCount }}</h3>
                  <p class="card-text">Still In It</p>
                </div>
              </div>
            </div>
            <div class="col-md-3 col-sm-6 mb-3">
              <div class="card text-center bg-secondary text-white">
                <div class="card-body">
                  <h3 class="card-title">{{ eliminatedCount }}</h3>
                  <p class="card-text">Eliminated</p>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table mb-0">
                  <thead class="table-dark">
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Name</th>
                      <th scope="col">Days Survived</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(streak, index) in sortedStreaks" :key="streak.athleteId" :class="streak.alive ? 'table-success' : 'table-light'">
                      <td>
                        <span class="position-badge" :class="getPositionClass(index)">
                          {{ index + 1 }}
                        </span>
                      </td>
                      <td class="fw-bold">{{ streak.name }}</td>
                      <td>{{ streak.currentStreak }}</td>
                      <td>
                        <span class="badge" :class="streak.alive ? 'bg-success' : 'bg-secondary'">
                          {{ streak.alive ? "Still In" : "Eliminated" }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <p class="text-muted mt-3 small text-center">Miss a day of at least 1km on foot and you're out - eliminations are only final once the week's Sunday 23:59 upload deadline has passed.</p>
        </div>
      </div>

      <!-- Registered Athletes Tab -->
      <div v-if="activeTab === 'athletes' && hasAthletes" class="tab-content">
        <div class="athletes-results">
          <h2 class="section-title">Registered Athletes ({{ results.athletes.length }})</h2>

          <div class="card">
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table mb-0">
                  <thead class="table-dark">
                    <tr>
                      <th scope="col">Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="athlete in results.athletes" :key="athlete.name">
                      <td class="fw-bold">{{ athlete.name }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- End of main content conditional -->
  </div>
</template>

<script>
import axios from "axios";
import { API_BASE_URL } from "../apiBase";
import { APP_NAME } from "../config";

// Keep in sync with the tab buttons/content blocks in the template - also doubles as the allowlist for the
// ?tab= query param, so an unrecognized value can't be used to land on a broken/blank state.
const VALID_TABS = ["challenges", "goals", "streak", "athletes"];

// Matches ActivityType.Other's value in functions/src/challenge-models.ts - kept as a local constant rather
// than importing across the website/functions package boundary for one string.
const OTHER_CATEGORY = "Other";

export default {
  name: "Results",
  props: {
    // Lets a caller (currently only the dev-only Preview.vue) inject results directly instead of fetching by
    // route id - see website/README.md "Local preview".
    mockData: {
      type: Object,
      default: null,
    },
  },
  data() {
    return {
      results: null,
      loading: false,
      error: null,
      activeTab: "challenges",
      goalFilter: "all",
      screenshot: false,
      hideTabs: false,
      appName: APP_NAME,
      otherCategory: OTHER_CATEGORY,
    };
  },
  computed: {
    isResultsInProgress() {
      if (!this.results || !this.results.currentTime || !this.results.endDate) return false;
      return this.results.currentTime < this.results.endDate;
    },
    currentDateFormatted() {
      if (!this.results || !this.results.currentTime) return "";
      const currentDate = new Date(this.results.currentTime * 1000);
      const options = {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      };
      return currentDate.toLocaleDateString(undefined, options);
    },
    achievedCount() {
      if (!this.results || !this.results.goalResults) return 0;
      return this.results.goalResults.filter((p) => p.achieved).length;
    },
    notAchievedCount() {
      if (!this.results || !this.results.goalResults) return 0;
      return this.results.goalResults.filter((p) => !p.achieved).length;
    },
    totalFitcoin() {
      if (!this.results || !this.results.goalResults) return 0;
      return this.results.goalResults.reduce((sum, p) => sum + p.fitcoin, 0);
    },
    achievementRate() {
      if (!this.results || !this.results.goalResults || this.results.goalResults.length === 0) return 0;
      return (this.achievedCount / this.results.goalResults.length) * 100;
    },
    filteredGoalResults() {
      if (!this.results || !this.results.goalResults) return [];
      if (this.goalFilter === "achieved") {
        return this.results.goalResults.filter((p) => p.achieved);
      } else if (this.goalFilter === "not-achieved") {
        return this.results.goalResults.filter((p) => !p.achieved);
      }
      return this.results.goalResults;
    },
    hasStreaks() {
      return !!this.results && Array.isArray(this.results.streaks) && this.results.streaks.length > 0;
    },
    sortedStreaks() {
      if (!this.hasStreaks) return [];
      // Athletes eliminated on their very first evaluated day never accumulated any streak days - showing them
      // as "Eliminated" with 0 days survived reads as a real elimination rather than simply not having started.
      return [...this.results.streaks].filter((s) => s.currentStreak > 0).sort((a, b) => b.currentStreak - a.currentStreak);
    },
    stillInCount() {
      return this.sortedStreaks.filter((s) => s.alive).length;
    },
    eliminatedCount() {
      return this.sortedStreaks.filter((s) => !s.alive).length;
    },
    hasAthletes() {
      return !!this.results && Array.isArray(this.results.athletes) && this.results.athletes.length > 0;
    },
  },
  methods: {
    formatValue(value, unit) {
      if (unit === "min/km") {
        return `${value.toFixed(2)}`;
      } else if (typeof value === "number") {
        return value.toLocaleString();
      }
      return value;
    },
    formatTime(minutes) {
      if (minutes === 0) return "0 min";
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      if (hours > 0) {
        return `${hours}h ${mins}m`;
      }
      return `${mins}m`;
    },
    formatDateRange() {
      if (!this.results || !this.results.startDate || !this.results.endDate) {
        return "";
      }

      const startDate = new Date(this.results.startDate * 1000);
      const endDate = new Date(this.results.endDate * 1000);

      const options = {
        month: "short",
        day: "numeric",
      };

      const startFormatted = startDate.toLocaleDateString(undefined, options);
      const endFormatted = endDate.toLocaleDateString(undefined, options);

      return `${startFormatted} - ${endFormatted}`;
    },
    getRowClass(index) {
      if (index === 0) return "table-warning"; // Gold
      if (index === 1) return "table-secondary"; // Silver
      if (index === 2) return "table-info"; // Bronze
      return "";
    },
    getPositionClass(index) {
      if (index === 0) return "position-gold";
      if (index === 1) return "position-silver";
      if (index === 2) return "position-bronze";
      return "position-default";
    },
  },
  watch: {
    // Resolves ?tab= here rather than in mounted(), since whether a tab is valid depends on the results
    // themselves (e.g. ?tab=streak for a week with no streak challenge running) - this is the one point
    // guaranteed to run once data is actually available, regardless of whether it arrived via mockData's
    // immediate watcher below (which fires before mounted()) or the real fetch in mounted() (which doesn't).
    // Leaves activeTab at its "challenges" default for an unrecognized or data-less tab, instead of a blank
    // page. Must stay listed before mockData: an `immediate` watcher's handler runs as soon as it's
    // registered, so if mockData came first, its handler would set `results` before this watcher exists to
    // observe it.
    results(newResults) {
      if (!newResults) return;
      const requestedTab = this.$route.query.tab;
      if (requestedTab === "streak" && !this.hasStreaks) return;
      if (requestedTab === "athletes" && !this.hasAthletes) return;
      if (VALID_TABS.includes(requestedTab)) this.activeTab = requestedTab;
    },
    // Preview.vue reuses this same instance across scenario changes (same /preview route, just a different
    // query), so mounted() alone would never see a later mockData value - only its first one.
    mockData: {
      immediate: true,
      handler(newValue) {
        if (!newValue) return;
        this.results = newValue;
        this.loading = false;
        this.error = null;
      },
    },
    // Keeps the URL shareable: whatever tab you're looking at is reflected in ?tab=, so copying the current
    // URL (or screenshotting it) always lands the recipient on the same tab. `replace` (not `push`) so
    // switching tabs doesn't spam browser history; skipped when already in sync (e.g. the initial ?tab= read
    // in mounted() triggers this same watcher) to avoid a redundant no-op navigation.
    activeTab(newTab) {
      if (this.$route.query.tab === newTab) return;
      this.$router.replace({ query: { ...this.$route.query, tab: newTab } }).catch(() => {});
    },
  },
  async mounted() {
    // Read regardless of the mockData/fetch path below, so the local preview route can also exercise these
    // modes (e.g. /preview?screenshot=true) - see website/README.md "Local preview".
    if (this.$route.query.screenshot) {
      this.screenshot = true;
    }
    if (this.$route.query.hideTabs) {
      this.hideTabs = true;
    }

    if (this.mockData) return; // handled by the watcher above

    this.loading = true;
    this.error = null;

    // Check if ID parameter exists
    if (!this.$route.params.id) {
      this.error = "No results ID provided in the URL.";
      this.loading = false;
      return;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/results/${this.$route.params.id}`);
      this.results = response.data;
    } catch (error) {
      console.error("Error fetching results:", error);
      if (error.response && error.response.status === 404) {
        this.error = "Results not found for the provided ID.";
      } else {
        this.error = "Failed to load results. Please try again later.";
      }
    } finally {
      this.loading = false;
    }
  },
  created() {
    document.title = `${APP_NAME} - Results`;
  },
};
</script>

<style scoped>
img {
  width: 350px;
  padding: 20px;
}

/* Kept smaller than our own logo so the Strava attribution stays subordinate to our branding,
   per https://developers.strava.com/guidelines/ */
.strava-badge {
  width: 150px;
  padding: 8px;
}

.results {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.nav-tabs-container {
  margin: 30px 0;
}

.challenge-section {
  margin-bottom: 40px;
}

.challenge-title,
.section-title {
  color: #2c3e50;
  margin-bottom: 30px;
  text-align: center;
  font-weight: bold;
}

.card {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border: 1px solid #dee2e6;
}

.card-header {
  background-color: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
}

.position-badge {
  display: inline-block;
  width: 24px;
  height: 24px;
  line-height: 24px;
  text-align: center;
  border-radius: 50%;
  font-weight: bold;
  font-size: 12px;
}

.position-gold {
  background-color: #ffd700;
  color: #000;
}

.position-silver {
  background-color: #c0c0c0;
  color: #000;
}

.position-bronze {
  background-color: #cd7f32;
  color: #fff;
}

.position-default {
  background-color: #6c757d;
  color: #fff;
}

.table th {
  font-weight: 600;
  font-size: 0.9em;
}

.table td {
  vertical-align: middle;
}

/* Name cells never wrap - see the .grouping-table comment below for why this matters for cards that sit
   side by side. For single-table tabs (Goal Achievements, Streak Challenge, Registered Athletes) it's just
   a nicer default. */
.table td.fw-bold {
  white-space: nowrap;
}

/* The Duration/Distance/Elevation (and Mile Challenge Attempts/Pace) cards sit side by side with equal
   widths, but a plain table sizes its own columns from its own content - a longer header ("Elevation" vs
   "Duration") or wider value ("1,240" vs "51") makes that table need more total width than its siblings,
   overflowing its card into a horizontal scrollbar that the sibling cards don't have. Fixed, identical
   column proportions make every sibling card the same width regardless of content - Name gets whatever's
   left after the other three, and overflows into an ellipsis instead of forcing the table wider. Not used
   for Other's table, which only ever appears alone (no sibling to stay consistent with) and so is left to
   size itself naturally - see the challenge.groupings.length check in the template. */
.grouping-table {
  table-layout: fixed;
}

.grouping-table th:first-child,
.grouping-table td:first-child {
  width: 15%;
}

.grouping-table th:nth-child(3),
.grouping-table td:nth-child(3) {
  width: 30%;
}

.grouping-table th:last-child,
.grouping-table td:last-child {
  width: 22%;
}

.grouping-table th {
  white-space: nowrap;
}

.grouping-table td.fw-bold {
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-group .btn.active {
  background-color: #0d6efd;
  border-color: #0d6efd;
  color: white;
}

@media (max-width: 768px) {
  img {
    width: 250px;
    padding: 10px;
  }

  .results {
    padding: 10px;
  }

  .table-responsive {
    font-size: 0.9em;
  }
}
</style>
