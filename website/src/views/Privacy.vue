<template>
  <div class="privacy">
    <img class="logo" :alt="`${appName} logo`" src="../assets/logo.svg" />
    <h1>
      Privacy &amp; support<br />
      <!-- Image from https://developers.strava.com/guidelines/ -->
      <img class="strava-badge" alt="Powered by Strava" src="../assets/strava_powered_by_horiz.svg" />
    </h1>

    <!-- Each section answers something Strava's API Policy (https://www.strava.com/legal/api_policy) requires apps to
         tell their users - keep it true to what the code does when either changes. -->
    <section>
      <h2>Who runs this</h2>
      <p>{{ appName }} is a free, non-commercial fitness challenge run by {{ organizer }} for its participants. It isn't developed, sponsored or endorsed by Strava.</p>
    </section>

    <section>
      <h2>What we collect, and how</h2>
      <p>Only after you connect with Strava and allow it, and only through Strava's API:</p>
      <ul>
        <li>your Strava athlete id and your first and last name;</li>
        <li>for each of your activities: its title, type, start date and time, distance, moving and elapsed time and elevation gain;</li>
        <li>the access token Strava gives us, so we can read the above.</li>
      </ul>
      <p>Strava lets us know when you add, edit or delete an activity, and we then read that activity from Strava. We never collect maps, GPS routes, heart rate, photos, your email address, profile picture or anything else.</p>
    </section>

    <section>
      <h2>What we use it for, and who sees it</h2>
      <p>
        Only to run the challenge: team and individual results, goals, streaks, FitCoin and lucky draws. Your name and your activity totals are shown to the other participants on the results pages. Those are only reachable through private links with a long random code, shared with participants, so
        they work like a password: they can't be guessed, browsed to or found through search engines<template v-if="resultsSharedIn"> and posted in {{ resultsSharedIn }}</template
        >.
      </p>
      <p>We never sell or share your data with anyone else, and never use it for advertising, analytics or AI.</p>
    </section>

    <section>
      <h2>Where it's kept, and for how long</h2>
      <p>
        With Google Firebase, in the EU. Your activities are kept only for the challenge. An activity you delete or hide on Strava is removed here as well, usually within minutes. When you disconnect, and at the end of every season, your connection and activities are deleted. The weekly results,
        which show your name with your totals, are kept as the challenge's history. Ask us and we'll remove you from them as well.
      </p>
    </section>

    <section>
      <h2>Withdrawing consent, and deleting your data</h2>
      <p>
        Disconnect {{ appName }} in your
        <a href="https://www.strava.com/settings/apps" target="_blank" rel="noopener">Strava account's apps settings</a>
        at any time. Strava tells us straight away, and we delete your connection, activities and streak automatically.
      </p>
      <p>To see the data we hold about you, have it deleted, or get written confirmation that it has been deleted, contact us (see Support below). We'll confirm in writing once it's done.</p>
    </section>

    <section>
      <h2>Strava</h2>
      <p>
        Strava may monitor and collect usage data about how {{ appName }} uses its API, and use it for any business purpose, as described in Strava's <a href="https://www.strava.com/legal/api" target="_blank" rel="noopener">API Agreement</a> and
        <a href="https://www.strava.com/legal/privacy" target="_blank" rel="noopener">Privacy Policy</a>. Your Strava account itself is managed at <a href="https://www.strava.com/settings/profile" target="_blank" rel="noopener">strava.com</a>.
      </p>
    </section>

    <section>
      <h2>Support</h2>
      <p>
        Questions, problems or data requests?
        <template v-if="contactEmail">
          Email <a :href="`mailto:${contactEmail}`">{{ contactEmail }}</a
          >.
        </template>
        <template v-else-if="hasContactEmail">
          <button type="button" class="btn btn-link p-0 align-baseline" @click="contactEmail = decodeContactEmail()">Show email address</button>
        </template>
        <template v-else>Contact {{ organizer }}.</template>
      </p>
    </section>

    <section>
      <h2>No warranty</h2>
      <p>
        {{ appName }} is provided as is, for fun. On behalf of Strava and any other third-party service providers, all warranties are disclaimed, including implied warranties of merchantability, fitness for a particular purpose and non-infringement, and they are not liable for any consequential,
        special, punitive or indirect damages.
      </p>
    </section>

    <router-link to="/">Back</router-link>
  </div>
</template>

<script>
import { APP_NAME, HAS_CONTACT_EMAIL, ORGANIZER, RESULTS_SHARED_IN, decodeContactEmail } from "../config";

export default {
  name: "Privacy",
  data() {
    return {
      appName: APP_NAME,
      organizer: ORGANIZER,
      // Revealed on click only - see config.js.
      contactEmail: "",
      hasContactEmail: HAS_CONTACT_EMAIL,
      resultsSharedIn: RESULTS_SHARED_IN,
    };
  },
  methods: {
    decodeContactEmail,
  },
  created() {
    document.title = `Privacy & support - ${APP_NAME}`;
  },
};
</script>

<style scoped>
.privacy {
  max-width: 640px;
  padding: 0 20px 40px;
  text-align: left;
}

h1 {
  text-align: center;
}

h2 {
  font-size: 1.15em;
  margin-top: 1.5em;
}

.logo {
  display: block;
  width: 250px;
  margin: 0 auto;
  padding: 20px;
}

/* Kept smaller than our own logo so the Strava attribution stays subordinate to our branding,
   per https://developers.strava.com/guidelines/ */
.strava-badge {
  width: 150px;
  padding: 8px;
}
</style>
