import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // test/contrast.test.mjs is a standalone node script (run via `npm run test:contrast`),
    // not a Vitest suite — keep Vitest scoped to src/ so it doesn't try to collect it.
    include: ["src/**/*.{test,spec}.ts"],
    passWithNoTests: true,
  },
});
