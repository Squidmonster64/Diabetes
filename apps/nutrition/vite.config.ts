import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/nutrition/" : "/",
  envDir: path.resolve(rootDir, "../.."),
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Nutrition Tracker",
        short_name: "Nutrition",
        description: "Natural-language nutrition and macro tracker.",
        theme_color: "#12211c",
        background_color: "#12211c",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: command === "build" ? "/nutrition/" : "/",
        icons: [{ src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        navigateFallback: command === "build" ? "/nutrition/index.html" : "/index.html",
        runtimeCaching: [{ urlPattern: /\/api\/v1\/nutrition/, handler: "NetworkOnly" }],
      },
    }),
  ],
  server: {
    port: 5174,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
  build: { outDir: "dist" },
}));
