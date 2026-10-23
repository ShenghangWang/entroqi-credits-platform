import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.integration.test.ts"],
    globals: true,
    fileParallelism: false,
    environment: "node",
    testTimeout: 10_000
  }
});
