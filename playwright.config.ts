import { defineConfig } from "@playwright/test";
import type { PrdReporterOptions } from "./tests/e2e/adapters/prd-reporter";

// Journeys AC-01..AC-08 run against the app in PROTOTYPE_MODE (in-memory store, fake Midtrans).
const PORT = 3100;
const prd: PrdReporterOptions = {
  outputFile: "prototype/evidence/scenario-results.json",
  artifactRoot: "prototype",
  evidenceDir: "evidence",
  prdId: "PRD-JT-01",
};

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1, // one shared in-memory store
  reporter: [["list"], ["./tests/e2e/adapters/prd-reporter.ts", prd]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "on", viewport: { width: 390, height: 844 } },
  webServer: {
    command: `next build && next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { PROTOTYPE_MODE: "1", MIDTRANS_SERVER_KEY: "", MIDTRANS_IS_PRODUCTION: "false", NEXT_DIST_DIR: ".next-prototype" },
  },
});
