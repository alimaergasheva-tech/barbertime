import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.MINIAPP_PORT ?? 5173),
    strictPort: true,
    // HTTPS tunnels used to open the dev server inside Telegram.
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.app"],
    // One origin for app + API, so a single tunnel is enough.
    proxy: {
      "/api": { target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:4000", changeOrigin: true },
    },
  },
});
