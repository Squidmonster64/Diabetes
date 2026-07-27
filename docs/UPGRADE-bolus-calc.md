# Upgrade plan: bolus calculator

**Status: draft, not yet approved. No implementation has started under this
plan.** This is the engineering migration plan for closing the gap between
the deployed bolus calculator (`packages/bolus`, see `BOLUS_MODULE.md` and
`SAFETY_MODEL.md`) and the clinical target specification supplied by the
product owner, reproduced verbatim at
[`docs/clinical/bolus-calculator-target-spec.md`](clinical/bolus-calculator-target-spec.md)
("the target spec"). Section numbers in this document are this plan's own
- they do not correspond to the target spec's section numbers, which are
cited explicitly (e.g. "target spec §6/M8") wherever referenced, to avoid
the two documents' numbering being confused with each other.

**Only PR 1 (§3, §5-§8) is currently in scope for implementation, and it
makes zero user-visible or dose-affecting change.** Every later PR in the
sequence (§9) requires this document to be reviewed and the specific PR's
entry in §9 to be explicitly approved before work starts.

---

## 1. Purpose and scope

The target spec describes a substantially more capable calculator than what
is deployed: per-time-block clinician parameters, insulin-on-board decay
curves, fat/protein (Warsaw method) dosing, CGM trend adjustment, fifteen
contextual modifier layers (dawn phenomenon, exercise, illness, alcohol,
medications, hormonal cycle, absorption variability, and more), and an
optional predictive ("eventual BG") architecture. None of this is a
drop-in addition - several of these are architecture-level changes to a
system whose entire current safety model is built around a much simpler
shape: fixed per-configuration ICR/ISF/target, a binary "prior dose still
active → refuse" lockout instead of any subtracted IOB value, and a closed,
fail-closed gate sequence with no multiplicative modifier composition at
all (see §2 for the full gap list).

This plan exists because the target spec itself warns, in its own words,
that "double-counting IOB is the single most common cause of hypos in
home-built calculators," and its own build-order recommendation is
additive and gated ("§1–§5 with all modifiers off → validate ... for 2–4
weeks → add M1, M2, M5 → add M6/M7 → add M3/M4 (FPU) last"). The purpose of
this plan is to give that recommendation a concrete engineering mechanism:
a way to add capability to `packages/bolus` incrementally, in reviewable
PRs, with automated proof at every step that behaviour already shipped and
already relied upon has not silently changed.

## 2. Gap analysis: target spec vs. deployed system

| Target spec area | Deployed today (`packages/bolus` / `apps/api`) | Gap |
|---|---|---|
| §0 Architecture A/B | An architecture close in spirit to "A," but without IOB subtraction (see below) | No architecture decision has been formally recorded; "B" is entirely unbuilt |
| §1 Global configuration | `GlucoseUnit`, `doseIncrementUnits`, rounding (half-up, single-pass) exist; no `bolus_insulin_brand`/`basal_insulin_brand`/`delivery_method` enums | Brand/delivery-method fields don't exist; DIA/peak are per-configuration numbers, not brand-derived |
| §2 Time-blocked profile | `ClinicianSettingsRecord` (`packages/bolus/src/types.ts`) has **one** `icr`/`isf`/`targetGlucose`/`insulinDurationHours` per active configuration - no time blocks at all | Full gap - this is a schema and gate-logic change, not additive |
| §3 Per-event inputs | `BolusCalculationRequest` has `currentGlucose`, `glucoseTrend` (accepted but "genuinely never enters arithmetic," per `SAFETY_MODEL.md`/handoff conflict C-09), `carbohydrateGrams`, `priorRapidActingDoses`. No protein/fat/fibre/GI/exercise/illness/alcohol/site/heat fields exist anywhere in the type | Most of §3's field list doesn't exist as data at all, let alone as arithmetic inputs |
| §4 IOB / COB | **No IOB value is ever computed.** `ACTIVE_PRIOR_BOLUS` (gate 18-20, `safety.ts`) is a binary refuse-if-still-active check against `insulinDurationHours` - it never produces a subtractable `iob_u`. No COB model exists. | This is the single largest and highest-risk gap - see §2.1 |
| §5 Core equations | `mealComponent = carbohydrateGrams / icr`, `correctionComponent = (currentGlucose - targetGlucose) / isf`, summed, rounded once (`calculations.ts`) - matches target spec §5 Architecture A almost exactly, **minus the `− iob_u` term and any `trend_adj`/`modifier_composite`** | Formula shape is compatible; the missing terms are exactly the risky ones |
| §6 Modifiers M1-M15 | None implemented. `SpecialSituation` (closed enum, `types.ts`) can flag e.g. `EXERCISE_ADJUSTMENT`, `SICK_DAY`, `ALCOHOL_ADJUSTMENT`, `STEROID_ADJUSTMENT` as **refusal triggers** (routes to "consult your clinician‑issued plan," per `SAFETY_MODEL.md`'s "what is deliberately not implemented") - never as a dose multiplier | Every modifier in target-spec §6 is currently "refuse and escalate to a human plan," not "calculate a multiplier." This is a deliberate, explicit safety design choice today, not an oversight - changing any single one to an automated multiplier is a clinically material decision requiring its own sign-off, not just an engineering PR |
| §7 Delivery shaping | Only `suggested_dose`-equivalent output exists (`roundedTotal` in `BolusCoreResult`) | No prebolus timer, split/extended-bolus output, or post-meal-check scheduling |
| §8 Safety layer | Extensively implemented - see `SAFETY_MODEL.md` and `audit/SAFETY_GATE_COVERAGE.md` (42 gates). Hypo gate, anti-stacking (via the binary lockout), hard caps, duplicate-dose prevention, ketone/illness refusal, stale-input rule, fail-safe-refuse-on-missing-input, immutable audit trail are all present and gate-tested | Broadly ahead of, not behind, the target spec here - this system already refuses in several places the target spec only asks for a "gate," and does so with a tested, ordered, fail-closed implementation |
| §9 ADHD automation layer | Not implemented in the web app (no favourites/templates, no persistent home-screen dose state, no reminders/timers) | Entirely a UI/product feature layer; no clinical-arithmetic risk, so out of scope for this document - track separately |
| §10 Logging & clinician outputs | An immutable audit trail exists (`audit_events`/`calculations` tables, `packages/bolus/src/logging.ts`) but no TIR/CV/GMI reporting or modifier-outcome analytics | Reporting/analytics gap, not an arithmetic-safety gap |
| §11 Clinician sign-off worksheet | `ClinicianSettingsRecord` already requires `insulinDurationPatientConfirmedAccurate: true` and a confirmation timestamp for DIA specifically (handoff-mandated) - no equivalent field exists for any other target-spec §11 row | Every new parameter this upgrade introduces needs its own signed-off, versioned settings field, following the existing DIA-provenance pattern, not a single blanket "clinician approved" flag |

### 2.1 Why IOB is the load-bearing risk, not a normal feature gap

The current system's `ACTIVE_PRIOR_BOLUS` gate (`packages/bolus/src/safety.ts`,
gates 18-20) computes `elapsed = calculatedAt - priorDose.administeredAt` per
prior dose and refuses outright if `elapsed < insulinDurationHours` for
*any* prior dose. It never produces a number to subtract. Introducing
target-spec §4's `iob_u` (whichever curve is chosen) changes the system from
"refuse when insulin might still be active" to "estimate how much insulin
is still active and subtract it" - a fundamentally different risk profile,
because a *wrong* IOB estimate now silently under- or over-doses instead of
visibly refusing. This is why the migration sequence in §9 puts an
IOB-model PR behind its own dedicated golden-case set and clinician
sign-off gate, separate from every other modifier, and why it comes before
any of M1-M15 (which all multiply on top of whatever `raw_dose` IOB
handling produces).

## 3. Parity harness (FROZEN modules)

### 3.1 Purpose

A **parity harness** is an automated regression suite that runs a large,
versioned set of **golden cases** - fixed `(ClinicianSettingsRecord,
BolusCalculationRequest) → expected BolusCoreResult | BolusRefusal` pairs -
against the current implementation of every **frozen module** (§5) on every
PR, and fails the PR if a single golden case's output changes in any field:
dose amount, refusal code, refusal category, user-facing message, or
gate-firing order. Its job is to make "this PR didn't change existing
behaviour" a machine-checked fact instead of a claim in a PR description,
for the entire duration of the multi-PR migration in §9.

### 3.2 Relationship to existing tests

`packages/bolus/test/` already contains 102 passing tests, including two
that are structurally close to a parity harness already:

- `calculations.test.ts`: *"is deterministic: identical input/settings
  repeated 100 times yields identical output"* and *"property sweep:
  rounded dose is always a nonnegative multiple of the increment and never
  above max"* - property-based, not case-based, and scoped to
  `calculateBolusPreview` only.
- `safety.test.ts` (46 tests) already exercises every gate individually
  with a hand-built request per test.

The parity harness does not replace these - it is a **new, separate**
suite (`packages/bolus/test/parity/`) whose cases are golden **because they
are frozen artifacts checked into the repo and versioned**, not because
they are well-designed unit tests. The existing 102 tests may still change
as engineers refactor test code; golden cases in the parity harness may
only be added to, never edited or removed, without an explicit, reviewed
"golden case change" commit that stands on its own (see §3.6).

### 3.3 Golden case format

Each golden case is a single JSON file under
`packages/bolus/test/parity/cases/<category>/<slug>.json`:

```jsonc
{
  "id": "meal-standard-mmol-01",       // stable, never reused even if the case is later removed
  "description": "Standard meal bolus, mid-range glucose, mmol/L, no modifiers",
  "addedInPr": "n/a - seeded from existing test fixtures at harness creation",
  "settings": { /* ClinicianSettingsRecord, minus id/createdAt/checksum - harness computes those */ },
  "request": { /* BolusCalculationRequest, minus calculationId-equivalent fields */ },
  "referenceNowMs": 1780000000000,      // fixed clock, so time-relative fields (prior-dose elapsed) are deterministic
  "expected": {
    "outcome": "PASS",                  // or "REFUSAL"
    // if PASS:
    "mealComponentUnits": "4",
    "correctionComponentUnits": "0.5",
    "unroundedTotalUnits": "4.5",
    "roundedTotalUnits": "4.5"
    // if REFUSAL:
    // "refusalCode": "ACTIVE_PRIOR_BOLUS",
    // "userFacingMessage": "..." (exact string, since this is genuinely user-visible)
  }
}
```

Numeric fields are compared as exact decimal strings (via the existing
`Decimal` type's own parser, never `Number`/floating point), matching how
`packages/bolus` already represents every clinical quantity - the harness
must not introduce a float-comparison bug into the one part of the system
whose entire purpose is avoiding float comparison bugs.

### 3.4 Coverage target

**Golden-case count target for PR 1: at least 60 cases**, seeded primarily
by mechanically converting each of the 46 `safety.test.ts` gate scenarios
and the 14 `calculations.test.ts` scenarios into a golden-case JSON file
(most gate tests already construct a full valid request/settings pair per
scenario, so this is largely extraction, not new authoring), plus every row
of the handoff's own test matrix (`BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md`
§10.1) not already covered 1:1 by an existing test. This count is a floor,
not a target to stop at - §9's later PRs each add their own golden cases
covering the specific new behaviour they introduce, before that behaviour
ships.

**Branch coverage requirement:** the frozen modules (§5) must reach **100%
branch coverage** under the combined existing-test-suite-plus-parity-harness
run, enforced in CI (§7). No coverage tooling currently exists in this repo
(confirmed in §13.6) - PR 1 adds `@vitest/coverage-v8` to
`packages/bolus`'s dev dependencies and a `coverage` script, and the CI
workflow (§7) fails the build if branch coverage of any file under
`packages/bolus/src/` (excluding `repositories.ts`'s in-memory
reference implementation, which is test/dev scaffolding, not production
logic) drops below 100%. Every existing safety-gate test already appears
to reach every branch (46 gates, each independently tested, per
`audit/SAFETY_GATE_COVERAGE.md`'s traceability matrix) - PR 1's job is to
make that an enforced, visible number rather than an implicit claim.

### 3.5 Harness runner

`packages/bolus/test/parity/run-parity.test.ts` is a single vitest test file
that:

1. Loads every `cases/**/*.json` file.
2. For each case, reconstructs a `ClinicianSettingsRecord` (computing
   `configurationChecksum` via the existing `computeConfigurationChecksum`)
   and a `BolusCalculationRequest`, using the case's `referenceNowMs` as
   `calculatedAt`.
3. Calls `calculateBolusPreview` (or, for pure-formula-only cases,
   `calculateMealBolus`/`calculateCorrectionBolus` directly) exactly as
   `apps/api`'s route handler does today - the harness must exercise the
   same entry point production traffic uses, not a lower-level function
   that could drift from what's actually deployed.
4. Asserts the result against `expected`, field by field, with a
   descriptive failure message naming the case `id` and the exact field
   that diverged (never just "a golden case failed").

### 3.6 Changing a golden case

A golden case file may only be modified in a commit whose message begins
`golden-case:` and whose diff is limited to `packages/bolus/test/parity/`
plus this document's changelog (§12). This is enforced by the CODEOWNERS
review requirement (§6) rather than by CI, since CI cannot distinguish "a
deliberate, reviewed behaviour change" from "an accidental one" - only a
human reviewer, looking at a commit that says exactly what it's doing and
nothing else, can.

## 4. Non-negotiable migration principles

1. No PR in the sequence (§9) may touch a frozen module (§5) and change
   golden-case behaviour in the same commit as a golden-case update,
   without the commit being clearly `golden-case:`-prefixed per §3.6.
2. No modifier (target spec §6, M1-M15) may be implemented as an automatic
   dose multiplier without: (a) its own dedicated golden-case set proving
   the composite-modifier cap (target spec §6's "hard-capped" requirement)
   actually holds under a property sweep, and (b) an explicit clinician
   sign-off row added to the settings schema, following the existing DIA
   sign-off pattern (§2, row 11) - never a single "modifiers enabled" flag.
3. IOB (target spec §4) is its own PR, gated separately from every
   modifier PR, per §2.1.
4. Every new per-time-block or per-modifier clinician parameter is
   versioned exactly like existing `ClinicianSettingsRecord` fields
   (immutable, checksummed, superseded not overwritten) - no new mutable
   "settings blob."
5. `packages/bolus` keeps its existing hard constraint (`BOLUS_MODULE.md`):
   no dependency on React, Supabase, Railway, service workers, food
   databases, speech recognition, AI services, browser storage, or network
   access. Nothing in this upgrade changes that.
6. Food-data and clinical-arithmetic changes are reviewed as what they are
   - a change to `packages/bolus/src/` and a change to
   `data/australian_foods.sqlite` are different classes of risk and are
   never bundled in the same PR.

## 5. FROZEN.md (design)

A new file, `packages/bolus/FROZEN.md`, lists every path considered frozen
and the review requirement for touching it:

```markdown
# Frozen paths

These paths implement the deterministic bolus calculator's dose arithmetic
and safety gates. Any PR touching them must:
1. Pass the full parity harness (packages/bolus/test/parity/) unchanged,
   OR include a commit prefixed `golden-case:` that updates it deliberately.
2. Be approved by a CODEOWNERS reviewer for this path (see /CODEOWNERS).
3. Maintain 100% branch coverage (enforced in CI).

| Path | Why frozen |
|---|---|
| packages/bolus/src/decimal.ts | Exact-arithmetic primitive every dose figure is built from |
| packages/bolus/src/types.ts | Request/result/refusal contracts and the closed SpecialSituation enum |
| packages/bolus/src/errors.ts | Refusal → user-facing message templates (verbatim, clinically reviewed wording) |
| packages/bolus/src/settings.ts | Configuration validation, checksum computation |
| packages/bolus/src/safety.ts | The 42-gate fail-closed sequence |
| packages/bolus/src/calculations.ts | The dose formulas and full-preview orchestration |
| packages/bolus/src/confirmation.ts | Confirmation/rejection/administration-logging gates |

packages/bolus/src/logging.ts and repositories.ts are excluded (operational
redaction helpers and a test/dev in-memory reference implementation
respectively - neither affects a dose figure).
```

This is a design, not yet a committed file - creating it is part of PR 1
(§9).

## 6. CODEOWNERS (design)

A root `/CODEOWNERS` file (none exists today - confirmed in §13.5), scoped
narrowly rather than repo-wide, so it only adds friction where the risk
actually is:

```
# Dose arithmetic and safety gates - see packages/bolus/FROZEN.md
/packages/bolus/  @<clinical-reviewer-placeholder>

# Food database integrity
/data/australian_foods.sqlite  @<clinical-reviewer-placeholder>
/docs/data-source/  @<clinical-reviewer-placeholder>
```

`@<clinical-reviewer-placeholder>` is a literal placeholder - **this plan
does not name a reviewer**, since that is an organisational decision for
the product owner, not an engineering one. PR 1 adds the file with the
placeholder team/handle the product owner supplies at approval time; until
a real owner is named, GitHub's CODEOWNERS enforcement has no effect, so
this section's file should not be considered "protecting" anything until
that handle exists and required-reviewer branch protection is turned on
for `main` (a repository-settings change, outside what a CODEOWNERS file
alone can enforce - noted in §13.5).

## 7. CI path guard (design)

No CI currently exists in this repository at all (confirmed in §13.4) - PR
1 is also, therefore, this repository's first GitHub Actions workflow. A
single workflow, `.github/workflows/ci.yml`, runs on every PR:

1. `npm ci`
2. `npm run build` - **must run before typecheck/test**, not after: several
   workspace packages (`shared-types`, `food-contracts`, `bolus`,
   `natural-language`) are consumed by their dependents via plain
   `node_modules` resolution against each package's built `dist/` output
   (no TypeScript project references/composite builds are configured
   here), and `dist/` is gitignored - a fresh CI checkout has none of it
   until this step runs. An earlier draft of this workflow ran typecheck
   first and failed every downstream package with "Cannot find module
   '@diabetes-companion/food-contracts' or its corresponding type
   declarations" on its first real PR run - never caught locally, since a
   local checkout always has leftover `dist/` output from an earlier
   build. Fixed by reordering; see the CI workflow file's own comment.
3. `npm run typecheck` (existing script, every workspace)
4. `npm run test` (existing script; now includes the parity harness as
   part of `packages/bolus`'s test run - no new top-level script needed)
5. **Frozen-path guard**: a small script
   (`scripts/check-frozen-paths.mjs`) that runs `git diff --name-only
   origin/main...HEAD`, checks whether any changed path matches an entry in
   `packages/bolus/FROZEN.md`'s path table, and if so, requires **either**
   (a) the parity harness step above to have passed with zero golden-case
   diffs, **or** (b) at least one commit in the PR whose message matches
   `^golden-case:`. This is a belt-and-braces check *in addition to*
   CODEOWNERS review (§6), not a replacement for it - CODEOWNERS requires a
   human; this requires the mechanical proof that human is reviewing.
6. **Food database hash check** (§8).

Coverage enforcement (§3.4) runs as part of step 3's `packages/bolus`
test invocation (`vitest run --coverage`, with `thresholds.branches: 100`
scoped to `src/**` excluding `repositories.ts`, configured in
`packages/bolus/vitest.config.ts`) - a separate CI step is not needed if
vitest itself fails the run below threshold.

## 8. Food database integrity check (design)

`docs/data-source/australian_foods.sqlite.sha256` already exists and
already matches the live file (verified while writing this plan:
`af42f35e7c9c565ae0f0b348d74d92128273498b095baf96cd7a8b8d4be23b4c` for
both). No CI check currently enforces this, though the API's
`/health` endpoint already surfaces the live hash at runtime
(`apps/api/src/server.ts`, per `audit/*` provenance docs).

PR 1 adds `scripts/check-food-db-hash.mjs`: compute
`sha256(data/australian_foods.sqlite)`, compare to the committed
`.sha256` file, and fail if they differ **and** the PR does not also touch
`docs/data-source/` (i.e., a deliberate data update commits its own new
hash file in the same PR; anything else touching the byte content of the
database without updating the hash file is either an accident or an
unreviewed change, and either way should fail CI). This directly protects
the carbohydrate-calculation half of the system's inputs the same way
FROZEN.md protects the dose-arithmetic half, closing the one remaining gap
between "database changed" and "someone had to consciously say so."

## 9. PR sequence (build order)

Directly follows the target spec's own recommendation (its final line:
"§1–§5 with all modifiers off → validate ... → add M1, M2, M5 → add M6/M7
→ add M3/M4 (FPU) last"), translated into engineering PRs gated by this
plan's mechanisms:

| PR | Scope | User-visible change | Gate to proceed |
|---|---|---|---|
| **1** (this document's current scope) | Parity harness, FROZEN.md, CODEOWNERS, CI (incl. path guard, coverage, food-DB hash) | **None** | This plan approved; §3.4's golden-case count and branch-coverage number reported and reviewed |
| 2 | Time-blocked clinician parameters (target spec §2) - schema/settings only, arithmetic still uses whichever block is active exactly as today's single value is used | Settings UI gains time-block entry | Golden cases added for block-selection edge cases (block boundary, missing block) |
| 3 | IOB model (target spec §4) - **own PR, own sign-off**, per §2.1/§4.3 | Dose figures change for any request with a recent prior dose within DIA | Dedicated IOB golden-case set (linear model first, per target spec §4's "choose one model" - exponential deferred to its own later PR); clinician sign-off field added to settings; 2-4 week shadow-mode validation (compute IOB-adjusted dose and log it without displaying it) recommended before this PR's output is user-facing, per target spec's own preamble ("sanity-checked against the existing wizard for 2-4 weeks before trusting it") |
| 4 | M1 (dawn/time-block ICR-ISF), M2 (GI-based prebolus timing), M5 (trend adjustment) | Prebolus timing display; trend-adjusted dose for CGM users | Per-modifier golden cases; composite-cap property sweep test (target spec §6's cap requirement) |
| 5 | M6/M7 (exercise) | Exercise-context dose adjustment | Golden cases per exercise state; late-onset overnight-watch flag is a UI/notification feature, tracked separately from the arithmetic change |
| 6 | M3/M4 (FPU / protein) - **last**, per target spec's explicit warning that "fat/protein dosing is where home-built calculators most often overshoot" | Extended/split dose guidance for high-fat meals | Golden cases specifically targeting the overshoot failure mode the target spec warns about |
| 7+ | Remaining modifiers (M8-M15), Architecture B (predictive), delivery shaping (§7), ADHD automation layer (§9) | Varies | Each gets its own entry added to this table before it starts - this table is not exhaustive beyond PR 6, deliberately, since planning modifier-by-modifier this far ahead of PR 1 shipping would be speculative |

## 10. Rollback strategy

Every PR after PR 1 is additive to `packages/bolus`'s public surface
(`BolusCalculationRequest` gains optional fields; existing required fields
and their meaning never change) so that reverting any single PR in the
sequence is a normal `git revert` with no data-migration step, provided its
new settings fields are additive/nullable in the same way
`ClinicianSettingsRecord` already accretes fields across schema versions
today (`SUPPORTED_SCHEMA_VERSIONS`). The parity harness (§3) is the
mechanism that proves a revert actually restores prior behaviour, not just
prior source code.

## 11. Clinician sign-off dependencies

This plan does not set, propose, or default any clinical constant. Every
row of the target spec's own §11 worksheet remains "nothing below should be
self-set." PR 2 onward each add exactly the settings fields needed for
that PR's specific target-spec rows, following the pattern
`insulinDurationPatientConfirmedAccurate`/`insulinDurationPatientConfirmedAt`
already sets for DIA today - never a bulk "clinician approved everything"
checkbox.

## 12. Open engineering questions (for product-owner/clinician input, not decided here)

1. Architecture A vs B (target spec §0) - this plan assumes **A**
   throughout §9, matching the target spec's own "safer starting point"
   verdict and the current system's existing shape, but this has not been
   explicitly confirmed by the product owner.
2. IOB model choice (target spec §4) - linear vs exponential (Loop model).
   §9 PR 3 assumes linear first, per the target spec's own phrasing
   ("choose one model; exponential is most accurate" - implying linear is
   an acceptable, simpler starting point), with exponential as a later,
   separately-gated PR.
3. Where do per-time-block settings live in the existing versioned-
   configuration model - one `ClinicianSettingsRecord` per block, or one
   record containing a block table? This affects the checksum/versioning
   design in PR 2 and needs a decision before that PR is scoped in detail.
4. CODEOWNERS reviewer identity (§6) - currently a placeholder.
5. Changelog: this document should track major decisions/PR completions
   under a "Changelog" heading once PR 1 lands; none exists yet since
   nothing has shipped under this plan.

## 13. Real stack, paths and tooling

Confirmed by direct inspection of this repository while writing this plan
(commands used are reproducible: `find`, `grep`, `cat package.json`,
`node -v`, `shasum -a 256`, `git log`).

### 13.1 Monorepo layout

npm workspaces (root `package.json`, `"workspaces": ["packages/*",
"apps/*", "tests/e2e"]`), Node `>=22` (engines field), built/run against
Node `v24.18.0` / npm `11.16.0` at the time of writing.

- `packages/bolus` - the dose-arithmetic and safety-gate module this plan
  concerns (§5's frozen paths live here). Zero dependency on any other
  workspace package or on network/DOM/database access.
- `packages/food-contracts` - shared types for the food-search/custom-food/
  saved-meal boundary; explicitly the *only* boundary permitted to cross
  into `packages/bolus` (a confirmed numeric carbohydrate-gram figure,
  never a food identity or database row).
- `packages/natural-language` - deterministic text-extraction for the
  "describe what's happening" entry flow; has a single **type-only**
  import from `packages/bolus` (the closed `SpecialSituation` union),
  erased at compile time, and otherwise no runtime dependency on it.
- `packages/shared-types` - small shared type package (pre-existing).
- `apps/api` - Fastify server; `apps/api/src/bolus/` wires HTTP routes to
  `packages/bolus`; `apps/api/src/food/` (`calculate.ts`, `search.ts`,
  `measures.ts`, `errors.ts`, `shared.ts`) is **the food-database
  directory's actual logic** (query/scoring/portion arithmetic against the
  SQLite file, distinct from `packages/bolus` and from
  `packages/food-contracts`).
- `apps/web` - React 19 + Vite 7 + react-router-dom 7 PWA frontend.
- `tests/e2e` - Playwright, black-box HTTP against a running server (not
  browser-DOM - see `audit/KNOWN_LIMITATIONS.md` item 10 for why).

### 13.2 The three directories the original review request asked to confirm

1. **Dose algorithms**: `packages/bolus/src/` (`calculations.ts` for the
   formulas, `safety.ts` for the 42 gates, `confirmation.ts` for post-
   preview gates, `settings.ts` for configuration validation,
   `decimal.ts` for the exact-arithmetic primitive everything else is
   built on).
2. **Plain-language generation**: `packages/bolus/src/errors.ts`
   (`REFUSAL_TEMPLATES`, a `Record<RefusalCode, RefusalTemplate>` mapping
   every refusal code to a fixed `userFacingMessage`/category/next-step -
   consumed by `calculations.ts` when constructing a `BolusRefusal`). There
   is no other plain-language/NLG component anywhere in `packages/bolus`;
   the *natural-language input* side (parsing dictated/typed text) is a
   completely separate, one-way concern in `packages/natural-language`,
   which never generates output text back into the bolus flow.
3. **Food database**: the binary data file is `data/australian_foods.sqlite`
   (13,467,648 bytes at time of writing; sha256
   `af42f35e7c9c565ae0f0b348d74d92128273498b095baf96cd7a8b8d4be23b4c`,
   matching the already-committed
   `docs/data-source/australian_foods.sqlite.sha256`). The code that reads
   it is `apps/api/src/food/*.ts` (via `better-sqlite3`, see `db.ts`);
   provenance/manifest docs live in `docs/data-source/` (`source_manifest.csv`,
   `application_views_report.md`).

### 13.3 Test tooling

Vitest `^3.2.4` uniformly across every workspace
(`packages/bolus`, `packages/food-contracts` has none configured,
`packages/natural-language`, `apps/api`, `apps/web`). `packages/bolus/test/`
has 6 files / 102 tests today; `packages/bolus/test/fixtures/` already
holds two reusable fixture builders (`base-request.ts`, `base-settings.ts`)
that PR 1's golden-case seeding can reuse directly rather than duplicating
request/settings construction.

### 13.4 CI

**None exists.** No `.github/workflows/` directory, no other CI config
file, and no mention of CI in `README.md`. PR 1's workflow (§7) is this
repository's first automated CI of any kind - it should be scoped
narrowly (typecheck, test, build, the two guard scripts) rather than
attempting to retrofit a general-purpose CI setup in the same PR as the
frozen-path protections this plan actually needs.

### 13.5 Review/ownership tooling

**No `/CODEOWNERS` file exists.** No branch-protection configuration is
visible from within the repository (that's a GitHub repository setting,
not a file) - confirming/enabling "require CODEOWNERS review before
merge" for `main` is a manual step for whoever administers the
`Squidmonster64/Diabetes` GitHub repository, outside what this plan or any
PR can do by committing files alone. This should be called out explicitly
at PR 1 review time so it isn't assumed to be "done" just because the file
exists.

### 13.6 Coverage tooling

**None exists.** No `@vitest/coverage-v8` (or any coverage package) is a
dependency anywhere in the repo; no `vitest.config.ts` configures a
`coverage` block. §3.4/§7 require adding this as part of PR 1.

### 13.7 Deployment / build

Railway (`railway.json`, `nixpacks.toml`), auto-deploying `main` on push
(no separate staging environment observed). Production:
`https://diabetes-companion-app-production.up.railway.app`. Supabase
(Postgres + auth) is the persistence layer for settings/calculations/audit
events (`supabase/migrations/`, 9 migration files today); `data/*.sqlite`
is a separate, bundled, read-only reference dataset unrelated to Supabase.
This upgrade plan does not require any change to the deployment pipeline
itself - PR 1's new CI workflow runs on pull requests, independent of the
existing Railway auto-deploy-on-push-to-main behaviour.

### 13.8 Existing audit/documentation conventions this plan follows

`SAFETY_MODEL.md`, `audit/KNOWN_LIMITATIONS.md`, and
`audit/SAFETY_GATE_COVERAGE.md` are the existing precedents for how this
codebase documents safety-relevant design and residual risk; this plan and
`packages/bolus/FROZEN.md` (§5) are written to sit alongside them, not
duplicate or replace them. `audit/TEST_RESULTS.md`'s existing per-feature
section format (a numbered "## Feature name (branch) - N tests" heading per
past change) is the pattern PR 1's own test-results update should follow
once implemented.
