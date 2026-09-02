import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@sirel/shared": fileURLToPath(new URL("../shared/src", import.meta.url)),
      "@sirel/server": fileURLToPath(new URL("../server/src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Homologação controlada pelo hostname institucional, sem wildcard.
    allowedHosts: ["www.sirel.com.br"],
    cors: false,
    fs: {
      strict: true,
    },
    proxy: {
      "/api": {
        target: "http://localhost:3030",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
