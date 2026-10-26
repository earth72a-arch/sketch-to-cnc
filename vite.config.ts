/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/sketch-to-cnc/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
