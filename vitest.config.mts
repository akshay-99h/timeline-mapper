import { defineConfig } from "vitest/config";

// Unit tests for the pure, worker-safe parsers in lib/. No DOM needed.
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
