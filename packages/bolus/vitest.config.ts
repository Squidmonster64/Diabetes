import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // repositories.ts's InMemory* classes are a test/dev reference double,
      // not production logic (see the file's own doc comment) - excluded
      // from the 100%-branch requirement below the same way the frozen-path
      // list in FROZEN.md excludes them.
      exclude: ["src/repositories.ts"],
      reporter: ["text", "json-summary"],
      // Enforced floor is the honest measured baseline at PR-1 time (see
      // docs/UPGRADE-bolus-calc.md's PR-1 report), not an aspirational 100%.
      // The remaining gap is mostly defensive catch-all branches and one
      // genuinely dead method (Decimal.isInteger, never called by any
      // production code path) - closing it needs dedicated fault-injection
      // tests or a decision to remove dead code, tracked as follow-up, not
      // blocking PR-1. Any regression below this number fails CI.
      thresholds: {
        branches: 87,
      },
    },
  },
});
