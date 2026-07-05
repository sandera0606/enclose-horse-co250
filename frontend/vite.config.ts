import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: Vite serves the app on :5173 and proxies /api to the FastAPI backend on
// :8000, so the browser sees a single origin (no CORS). `pnpm build` emits to
// dist/, which FastAPI can serve directly for a single-process demo.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
