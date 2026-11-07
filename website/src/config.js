export const APP_NAME = import.meta.env.VITE_APP_NAME || "Summer Bodies Challenge";

// Shown on the privacy page (views/Privacy.vue) - set per deployment through branding, see
// functions/examples/upload-branding.ts and scripts/fetch-branding.mjs.
export const ORGANIZER = import.meta.env.VITE_ORGANIZER || "the challenge organizer";
// Shipped encoded (see scripts/fetch-branding.mjs's encodeEmail) so harvesters don't find it in the bundle -
// call this only when a visitor asks to see it.
const CONTACT_EMAIL_ENCODED = import.meta.env.VITE_CONTACT_EMAIL_ENCODED || "";
export const HAS_CONTACT_EMAIL = CONTACT_EMAIL_ENCODED !== "";
export function decodeContactEmail() {
  return CONTACT_EMAIL_ENCODED ? new TextDecoder().decode(Uint8Array.from(atob(CONTACT_EMAIL_ENCODED.split("").reverse().join("")), (c) => c.charCodeAt(0))) : "";
}
// Where else results are posted besides the results pages, e.g. "our team's Slack workspace".
export const RESULTS_SHARED_IN = import.meta.env.VITE_RESULTS_SHARED_IN || "";
