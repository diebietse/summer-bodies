<template>
  <router-view />
  <!-- Strava's API Policy wants privacy and support details easy to reach from everywhere Strava data shows. Not on
       Home, whose consent note links there already, nor in screenshot mode: those pages are only rendered for the
       Slack bot's screenshots (functions/src/puppeteer.ts). -->
  <footer v-if="!$route.query.screenshot && !['Home', 'Privacy'].includes($route.name)" class="site-footer">
    <router-link to="/privacy">Privacy &amp; support</router-link>
  </footer>
</template>

<style>
#app {
  min-height: 100%; /* Fallback for browsers do NOT support vh unit */
  min-height: 100vh; /* These two lines are counted as one :-)       */

  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  margin: auto;

  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}

.site-footer {
  padding: 16px;
  font-size: 0.85em;
}

.site-footer a {
  color: #666;
}

#nav {
  padding: 30px;
}

#nav a {
  font-weight: bold;
  color: #2c3e50;
}

#nav a.router-link-exact-active {
  color: #42b983;
}
</style>
