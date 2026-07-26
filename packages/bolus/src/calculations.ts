import { Decimal } from "./decimal.js";
import { REFUSAL_TEMPLATES, ValidationRefusal } from "./errors.js";
import { runSafetyGates, type ParsedCalculationInput } from "./safety.js";
import type { ParsedClinicianSettings } from "./settings.js";
import {
  CALCULATOR_VERSION,
  SAFETY_POLICY_VERSION,
  type BolusCalculationRequest,
  type BolusPreviewResult,
  type BolusRefusal,
  type BolusSuccess,
  type ClinicianSettingsRecord,
  type RefusalCode,
  type SafetyContext,
} from "./types.js";
import { sha256, type AuditStore, type CalculationRepository, type Clock, type IdGenerator } from "./repositories.js";

const ZERO = Decimal.fromInteger(0n);
const REVIEW_TTL_MS = 5 * 60 * 1000;

export interface BolusCoreResult {
  readonly status: "CALCULATED" | "CALCULATED_ZERO";
  readonly mealComponentUnits: string;
  readonly correctionComponentUnits: string;
  readonly activeInsulinAdjustmentUnits: "0";
  readonly unroundedTotalUnits: string;
  readonly roundedTotalUnits: string;
  readonly explanation: readonly string[];
}

/**
 * calculateMealBolus - handoff section 8.2 / 4.1 / 4.2. Must only be invoked
 * after runSafetyGates has passed (active-insulin/history gates already clear).
 */
export function calculateMealBolus(
  settings: ParsedClinicianSettings,
  input: ParsedCalculationInput,
): BolusCoreResult {
  return computeCore(settings, input, "MEAL");
}

/** calculateCorrectionBolus - handoff section 8.3 / 4.1 / 4.2. */
export function calculateCorrectionBolus(
  settings: ParsedClinicianSettings,
  input: ParsedCalculationInput,
): BolusCoreResult {
  return computeCore(settings, input, "CORRECTION_ONLY");
}

function computeCore(
  settings: ParsedClinicianSettings,
  input: ParsedCalculationInput,
  mode: "MEAL" | "CORRECTION_ONLY",
): BolusCoreResult {
  const mealComponent = mode === "MEAL" ? input.carbohydrateGrams.divide(settings.icr) : ZERO;
  const correctionComponent = input.currentGlucose.subtract(settings.targetGlucose).divide(settings.isf);
  const combined = mode === "MEAL" ? mealComponent.add(correctionComponent) : correctionComponent;

  if (combined.compare(ZERO) < 0) {
    // Handoff section 4.7: negative total clamps to zero (CALCULATED_ZERO), never negative.
    const zero = ZERO;
    return {
      status: "CALCULATED_ZERO",
      mealComponentUnits: mealComponent.toCanonicalString(),
      correctionComponentUnits: correctionComponent.toCanonicalString(),
      activeInsulinAdjustmentUnits: "0",
      unroundedTotalUnits: zero.toCanonicalString(),
      roundedTotalUnits: zero.toCanonicalString(),
      explanation: explanationFor(mode, mealComponent, correctionComponent, zero, zero, settings),
    };
  }

  const unroundedTotal = combined.max(ZERO);
  const roundedTotal = unroundedTotal.roundHalfUpToIncrement(settings.doseIncrementUnits);

  return {
    status: roundedTotal.compare(ZERO) === 0 ? "CALCULATED_ZERO" : "CALCULATED",
    mealComponentUnits: mealComponent.toCanonicalString(),
    correctionComponentUnits: correctionComponent.toCanonicalString(),
    activeInsulinAdjustmentUnits: "0",
    unroundedTotalUnits: unroundedTotal.toCanonicalString(),
    roundedTotalUnits: roundedTotal.toCanonicalString(),
    explanation: explanationFor(mode, mealComponent, correctionComponent, unroundedTotal, roundedTotal, settings),
  };
}

function explanationFor(
  mode: "MEAL" | "CORRECTION_ONLY",
  mealComponent: Decimal,
  correctionComponent: Decimal,
  unroundedTotal: Decimal,
  roundedTotal: Decimal,
  settings: ParsedClinicianSettings,
): readonly string[] {
  const lines: string[] = [];
  if (mode === "MEAL") {
    lines.push(
      `Meal component: ${settings.record.icr} g/U divides confirmed carbohydrate grams = ${mealComponent.toCanonicalString()} U`,
    );
  }
  lines.push(
    `Correction component: (current glucose - ${settings.record.targetGlucose}) / ${settings.record.isf} = ${correctionComponent.toCanonicalString()} U`,
  );
  lines.push("No active-insulin subtraction is permitted in this scope.");
  lines.push(`Unrounded total: max(0, combined) = ${unroundedTotal.toCanonicalString()} U`);
  lines.push(`Rounded once to ${settings.record.doseIncrementUnits} U increment: ${roundedTotal.toCanonicalString()} U`);
  return lines;
}

function refusal(refusalCode: RefusalCode, settings?: ClinicianSettingsRecord): BolusRefusal {
  const template = REFUSAL_TEMPLATES[refusalCode];
  return {
    status: "REFUSED",
    refusalCode,
    refusalCategory: template.refusalCategory,
    userFacingMessage: template.userFacingMessage,
    blockingReason: template.blockingReason,
    safeNextStep: template.safeNextStep,
    settingsId: settings?.id,
    settingsVersion: settings?.version,
    calculationVersion: CALCULATOR_VERSION,
    safetyPolicyVersion: SAFETY_POLICY_VERSION,
    timestamp: new Date().toISOString(),
  };
}

export interface BolusPreviewDependencies {
  readonly settingsRepository: { getActiveSettings(patientId: string): Promise<ClinicianSettingsRecord | undefined> };
  readonly auditStore: AuditStore;
  readonly calculationRepository: CalculationRepository;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

/**
 * calculateBolusPreview - handoff section 8.5. Full orchestration: safety
 * gates (1-30), arithmetic (gate 31), maximum-dose gates (32/33), audit
 * persistence (gate 34) and snapshot creation (gate 35). If audit persistence
 * fails, no result is returned to the caller - see handoff section 9.1.
 */
export async function calculateBolusPreview(
  request: BolusCalculationRequest,
  context: SafetyContext,
  dependencies: BolusPreviewDependencies,
): Promise<BolusPreviewResult> {
  const settings = await dependencies.settingsRepository.getActiveSettings(request.patientId);
  try {
    return await runCalculation(request, context, dependencies, settings);
  } catch (error) {
    if (error instanceof AuditPersistenceError) {
      // Handoff section 9.1: if audit persistence fails, no dose is displayed.
      return refusal("AUDIT_PERSISTENCE_FAILURE", settings);
    }
    return refusal("ARITHMETIC_FAILURE", settings);
  }
}

async function runCalculation(
  request: BolusCalculationRequest,
  context: SafetyContext,
  dependencies: BolusPreviewDependencies,
  settings: ClinicianSettingsRecord | undefined,
): Promise<BolusPreviewResult> {
  const calculationId = dependencies.idGenerator.newId();

  await appendAuditOrThrow(dependencies.auditStore, {
    eventType: "CALCULATION_STARTED",
    patientId: request.patientId,
    calculationId,
    occurredAt: request.calculatedAt,
    payload: { request },
    offline: false,
  });

  const gateResult = runSafetyGates(settings, request, context);
  if (!gateResult.allowed) {
    const result = refusal(gateResult.refusalCode, settings);
    await appendAuditOrThrow(dependencies.auditStore, {
      eventType: "CALCULATION_REFUSED",
      patientId: request.patientId,
      calculationId,
      occurredAt: request.calculatedAt,
      payload: { refusalCode: gateResult.refusalCode },
      offline: false,
    });
    await dependencies.calculationRepository.save({
      calculationId,
      patientId: request.patientId,
      state: "REFUSED",
      createdAt: request.calculatedAt,
      result,
    });
    return result;
  }

  let core: BolusCoreResult;
  try {
    core = request.mode === "MEAL"
      ? calculateMealBolus(gateResult.settings, gateResult.input)
      : calculateCorrectionBolus(gateResult.settings, gateResult.input);
  } catch {
    const result = refusal("ARITHMETIC_FAILURE", settings);
    await appendAuditOrThrow(dependencies.auditStore, {
      eventType: "CALCULATION_REFUSED",
      patientId: request.patientId,
      calculationId,
      occurredAt: request.calculatedAt,
      payload: { refusalCode: "ARITHMETIC_FAILURE" },
      offline: false,
    });
    return result;
  }

  // Gates 32/33: maximum dose, raw and rounded. Never cap.
  const maximumDoseUnits = gateResult.settings.maximumDoseUnits;
  const unroundedTotal = Decimal.parse(core.unroundedTotalUnits);
  const roundedTotal = Decimal.parse(core.roundedTotalUnits);
  if (unroundedTotal.compare(maximumDoseUnits) > 0 || roundedTotal.compare(maximumDoseUnits) > 0) {
    const result = refusal("MAXIMUM_DOSE_EXCEEDED", settings);
    await appendAuditOrThrow(dependencies.auditStore, {
      eventType: "CALCULATION_REFUSED",
      patientId: request.patientId,
      calculationId,
      occurredAt: request.calculatedAt,
      payload: { refusalCode: "MAXIMUM_DOSE_EXCEEDED" },
      offline: false,
    });
    await dependencies.calculationRepository.save({
      calculationId,
      patientId: request.patientId,
      state: "REFUSED",
      createdAt: request.calculatedAt,
      result,
    });
    return result;
  }

  const createdAtMs = Date.parse(request.calculatedAt);
  const expiresAt = new Date(createdAtMs + REVIEW_TTL_MS).toISOString();

  const preSnapshotResult: BolusSuccess = {
    status: core.status,
    calculationId,
    mealComponentUnits: core.mealComponentUnits,
    correctionComponentUnits: core.correctionComponentUnits,
    activeInsulinAdjustmentUnits: "0",
    unroundedTotalUnits: core.unroundedTotalUnits,
    roundedTotalUnits: core.roundedTotalUnits,
    doseIncrementUnits: gateResult.settings.doseIncrementUnits.toCanonicalString(),
    maximumDoseUnits: gateResult.settings.maximumDoseUnits.toCanonicalString(),
    warnings: [],
    explanation: core.explanation,
    settingsId: (settings as ClinicianSettingsRecord).id,
    settingsVersion: (settings as ClinicianSettingsRecord).version,
    calculationVersion: CALCULATOR_VERSION,
    safetyPolicyVersion: SAFETY_POLICY_VERSION,
    timestamp: request.calculatedAt,
    expiresAt,
    snapshotHash: "",
    confirmationRequired: true,
  };

  let snapshotHash: string;
  try {
    snapshotHash = sha256({ calculationId, patientId: request.patientId, request, result: preSnapshotResult });
  } catch {
    return refusal("APPLICATION_INTEGRITY_FAILURE", settings);
  }

  const finalResult: BolusSuccess = { ...preSnapshotResult, snapshotHash };

  await appendAuditOrThrow(dependencies.auditStore, {
    eventType: "CALCULATION_COMPLETED",
    patientId: request.patientId,
    calculationId,
    occurredAt: request.calculatedAt,
    payload: { result: finalResult, snapshotHash },
    offline: false,
  });

  await dependencies.calculationRepository.save({
    calculationId,
    patientId: request.patientId,
    state: finalResult.status,
    createdAt: request.calculatedAt,
    expiresAt,
    result: finalResult,
    snapshotHash,
  });

  return finalResult;
}

async function appendAuditOrThrow(
  auditStore: AuditStore,
  event: Parameters<AuditStore["append"]>[0],
): Promise<void> {
  try {
    await auditStore.append(event);
  } catch {
    throw new AuditPersistenceError();
  }
}

export class AuditPersistenceError extends Error {
  readonly refusalCode: RefusalCode = "AUDIT_PERSISTENCE_FAILURE";
  constructor() {
    super("AUDIT_PERSISTENCE_FAILURE");
  }
}
