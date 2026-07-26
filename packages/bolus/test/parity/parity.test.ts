import { describe, expect, it } from "vitest";
import {
  calculateBolusPreview,
  InMemoryAuditStore,
  InMemoryCalculationRepository,
  type BolusPreviewDependencies,
} from "../../src/index.js";
import { PARITY_CASES } from "./cases.js";

/**
 * The parity harness (docs/UPGRADE-bolus-calc.md §3). Runs every case in
 * cases.ts through the exact same entry point production traffic uses
 * (calculateBolusPreview) and asserts the clinically-meaningful subset of
 * the result against a committed snapshot.
 *
 * Deliberately excluded from the snapshot: calculationId, settingsId,
 * settingsVersion, timestamp, expiresAt, calculationVersion,
 * safetyPolicyVersion - these are provenance/identity/version fields that
 * are supposed to vary independently of dose arithmetic (a version-string
 * bump, or a new random id, is not a regression this harness exists to
 * catch; a changed dose figure, refusal code, or explanation string is).
 *
 * Updating a snapshot is a "golden-case:"-prefixed commit reviewed under
 * /CODEOWNERS (see packages/bolus/FROZEN.md) - never a routine `-u` run.
 */
describe("parity harness (frozen dose arithmetic and plain-language output)", () => {
  for (const parityCase of PARITY_CASES) {
    it(`${parityCase.id}: ${parityCase.description}`, async () => {
      const dependencies: BolusPreviewDependencies = {
        settingsRepository: {
          getActiveSettings: async () => parityCase.settings ?? undefined,
        },
        auditStore: new InMemoryAuditStore(),
        calculationRepository: new InMemoryCalculationRepository(),
        clock: { now: () => parityCase.request.calculatedAt },
        idGenerator: { newId: () => `parity-${parityCase.id}` },
      };

      const result = await calculateBolusPreview(parityCase.request, parityCase.context, dependencies);

      const frozen =
        result.status === "REFUSED"
          ? {
              status: result.status,
              refusalCode: result.refusalCode,
              refusalCategory: result.refusalCategory,
              userFacingMessage: result.userFacingMessage,
              blockingReason: result.blockingReason,
              safeNextStep: result.safeNextStep,
            }
          : {
              status: result.status,
              mealComponentUnits: result.mealComponentUnits,
              correctionComponentUnits: result.correctionComponentUnits,
              activeInsulinAdjustmentUnits: result.activeInsulinAdjustmentUnits,
              unroundedTotalUnits: result.unroundedTotalUnits,
              roundedTotalUnits: result.roundedTotalUnits,
              doseIncrementUnits: result.doseIncrementUnits,
              maximumDoseUnits: result.maximumDoseUnits,
              warnings: result.warnings,
              explanation: result.explanation,
            };

      await expect(JSON.stringify(frozen, null, 2)).toMatchFileSnapshot(`./__snapshots__/${parityCase.id}.snap.json`);
    });
  }

  it("golden-case count meets the PR-1 floor of 60", () => {
    expect(PARITY_CASES.length).toBeGreaterThanOrEqual(60);
  });

  it("every case id is unique (snapshot files must never silently collide)", () => {
    const ids = PARITY_CASES.map((parityCase) => parityCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
