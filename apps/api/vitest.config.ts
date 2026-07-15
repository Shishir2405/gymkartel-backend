import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    // Infra tests that need Docker (testcontainers) are tagged and skipped in CI.
    exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.infra.test.ts"],
    environment: "node",
    globals: false,
  },
});
