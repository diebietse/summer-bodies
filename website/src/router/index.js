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

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
