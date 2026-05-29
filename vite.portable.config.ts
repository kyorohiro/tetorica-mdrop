// vite.portable.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  publicDir: "public_portable",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  build: {
    outDir: "dist-portable",
    rollupOptions: {
      input: resolve(__dirname, "portable.html"),
    },
  },
});