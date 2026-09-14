import { createApp } from "vue";
import { createPinia } from "pinia";
import "./style.css";
import App from "./App.vue";

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.mount("#app");

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn("Boardly service worker registration failed", error);
    });
  });
} else if (import.meta.env.DEV && "serviceWorker" in navigator) {
  // A previously installed production worker must not cache Vite's modules
  // or interfere with the HMR WebSocket during local development.
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      if (registration.active?.scriptURL.endsWith("/sw.js")) void registration.unregister();
    }
  });
}
