import { createRouter, createWebHistory } from "vue-router";
import Home from "../views/Home.vue";
import Callback from "../views/Callback.vue";
import Results from "../views/Results.vue";

const routes = [
  {
    path: "/",
    name: "Home",
    component: Home,
  },
  {
    path: "/callback",
    name: "Callback",
    component: Callback,
  },
  {
    path: "/results/:id",
    name: "Results",
    component: Results,
  },
];

// Dev-only route for local visual testing with mock data (see views/Preview.vue and README.md "Local
// preview"). import.meta.env.DEV is statically false in a production build, so Vite/Rollup dead-code-eliminates
// this whole block - including the dynamically imported Preview.vue chunk - out of what actually ships.
if (import.meta.env.DEV) {
  routes.push({
    path: "/preview",
    name: "Preview",
    component: () => import("../views/Preview.vue"),
  });
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
