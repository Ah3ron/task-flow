import { fileURLToPath, URL } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const apiTarget = process.env.TASKFLOW_API_URL ?? "http://127.0.0.1:8000"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/docs": apiTarget,
      "/openapi.json": apiTarget,
    },
  },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"] },
})
