#!/usr/bin/env node
/**
 * CI food-database integrity check (docs/UPGRADE-bolus-calc.md §8).
 *
 * Recomputes sha256(data/australian_foods.sqlite) and compares it to the
 * committed docs/data-source/australian_foods.sqlite.sha256. A mismatch is
 * only acceptable when this PR also touches docs/data-source/ (i.e. a
 * deliberate data update commits its own new hash file in the same PR) -
 * anything else means the database's byte content changed without anyone
 * consciously updating its recorded hash, which is either an accident or
 * an unreviewed change either way.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(repoRoot, "data", "australian_foods.sqlite");
const hashFilePath = path.join(repoRoot, "docs", "data-source", "australian_foods.sqlite.sha256");

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", cwd: repoRoot }).trim();
}

function main() {
  const actualHash = createHash("sha256").update(readFileSync(dbPath)).digest("hex");

  const recordedLine = readFileSync(hashFilePath, "utf8").trim();
  const recordedHash = recordedLine.split(/\s+/)[0];

  if (actualHash === recordedHash) {
    console.log(`Food DB hash check: matches recorded hash (${actualHash}).`);
    return;
  }

  const baseRef = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/main";
  let changedFiles = [];
  try {
    changedFiles = run("git", ["diff", "--name-only", `${baseRef}...HEAD`]).split("\n").filter(Boolean);
  } catch (error) {
    console.error(`Food DB hash check: could not diff against ${baseRef}: ${error.message}`);
    process.exit(1);
  }

  const hashFileUpdatedThisPr = changedFiles.some((file) => file.startsWith("docs/data-source/"));

  if (hashFileUpdatedThisPr) {
    console.log(
      "Food DB hash check: file content changed, but docs/data-source/ was also updated in this PR " +
        "- treating as a deliberate, reviewed data update.",
    );
    return;
  }

  console.error(
    `::error::data/australian_foods.sqlite's hash (${actualHash}) does not match the recorded hash ` +
      `(${recordedHash}) in docs/data-source/australian_foods.sqlite.sha256, and this PR does not update ` +
      "that file. Either the database changed unintentionally, or this is a deliberate data update that " +
      "must also commit a new hash file - see packages/bolus/FROZEN.md.",
  );
  process.exit(1);
}

main();
