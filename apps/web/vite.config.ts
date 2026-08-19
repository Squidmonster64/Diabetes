import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Clinical workflow fixes must not remain behind a hidden PWA update
      // prompt. A new version is downloaded and activated automatically on
      // the next launch/reload; API, auth, and calculation data remain
      // network-only as defined below.
      registerType: "autoUpdate",
      includeAssets: ["favicon.png"],
      manifest: {
        name: "Diabetes Companion",
        short_name: "DiaCompanion",
        description: "Australian-first diabetes companion: food carbohydrate lookup and deterministic bolus calculator preview.",
        theme_color: "#12181C",
        background_color: "#12181C",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // App shell + static assets only. Clinical calculation results,
        // settings, and auth tokens are never cached by the service worker -
        // APP_BUILD_PROMPT.md section 12.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/foods\/search/,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /\/api\/v1\/bolus\//,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
