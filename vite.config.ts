import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "icon.svg",
        "apple-touch-icon.png",
        "data/KJV-LICENSE.txt",
      ],
      manifest: {
        name: "The Word Within",
        short_name: "Word Within",
        description:
          "Scripture held in the heart. Private, offline Bible memorization.",
        theme_color: "#102d27",
        background_color: "#0b1d19",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,json,txt}"],
        maximumFileSizeToCacheInBytes: 6000000,
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
      },
    }),
  ],
});
