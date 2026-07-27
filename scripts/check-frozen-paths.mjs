#!/usr/bin/env node
/**
 * CI frozen-path guard (docs/UPGRADE-bolus-calc.md §7, packages/bolus/FROZEN.md).
 *
 * If this PR's diff touches a frozen path, require that at least one
 * commit in the PR is prefixed "golden-case:" - the mechanical signal that
 * a human deliberately intends to change frozen behaviour, on top of (not
 * instead of) CODEOWNERS review. This does not replace the parity harness
 * itself (packages/bolus/test/parity/) - vitest already fails the build on
 * any unintended snapshot diff regardless of this script.
 */
import { execFileSync } from "node:child_process";

const FROZEN_PATH_PREFIXES = ["packages/bolus/", "data/australian_foods.sqlite", "docs/data-source/"];

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

function main() {
  const baseRef = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/main";

  let changedFiles;
  try {
    changedFiles = run("git", ["diff", "--name-only", `${baseRef}...HEAD`])
      .split("\n")
      .filter((line) => line.length > 0);
  } catch (error) {
    console.error(`Frozen-path guard: could not diff against ${baseRef}: ${error.message}`);
    process.exit(1);
  }

  const touchedFrozenPaths = changedFiles.filter((file) =>
    FROZEN_PATH_PREFIXES.some((prefix) => file === prefix || file.startsWith(prefix)),
  );

  if (touchedFrozenPaths.length === 0) {
    console.log("Frozen-path guard: no frozen paths touched.");
    return;
  }

  console.log("Frozen-path guard: this PR touches frozen paths:");
  for (const file of touchedFrozenPaths) console.log(`  - ${file}`);

  let commitMessages;
  try {
    commitMessages = run("git", ["log", "--format=%B", `${baseRef}..HEAD`]);
  } catch (error) {
    console.error(`Frozen-path guard: could not read commit log against ${baseRef}: ${error.message}`);
    process.exit(1);
  }

  const hasGoldenCaseCommit = commitMessages
    .split("\n")
    .some((line) => /^golden-case:/i.test(line.trim()));

  if (!hasGoldenCaseCommit) {
    console.error(
      "::error::Frozen path touched without a 'golden-case:'-prefixed commit. " +
        "See packages/bolus/FROZEN.md - either this change shouldn't touch a frozen " +
        "path, or it's a deliberate, reviewed behaviour change and needs a commit " +
        "whose message begins 'golden-case:' explaining why.",
    );
    process.exit(1);
  }

  console.log("Frozen-path guard: a 'golden-case:'-prefixed commit is present. Proceeding (CODEOWNERS review still required).");
}

main();
