import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["tests/unit/**/*.test.ts"] },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // server-only throws outside the React server build; unit tests run the server modules directly.
      "server-only": path.resolve(__dirname, "tests/unit/empty.ts"),
    },
  },
});
