import { describe, expect, it } from "vitest";
import { validateSettings, computeConfigurationChecksum } from "../src/settings.js";
import { makeSettings } from "./fixtures/base-settings.js";

const AT = "2026-07-24T04:00:00.000Z";

describe("validateSettings", () => {
  it("accepts a fully valid, patient-confirmed configuration", () => {
    const result = validateSettings(makeSettings(), AT);
    expect(result.valid).toBe(true);
  });

  it("refuses when no settings are supplied", () => {
    const result = validateSettings(undefined, AT);
    expect(result).toMatchObject({ valid: false, refusalCode: "NO_ACTIVE_CONFIGURATION" });
  });

  it("refuses when status is not ACTIVE", () => {
    const result = validateSettings(makeSettings({ status: "DRAFT" }), AT);
    expect(result).toMatchObject({ valid: false, refusalCode: "NO_ACTIVE_CONFIGURATION" });
  });

  it("refuses revoked configurations", () => {
    const result = validateSettings(makeSettings({ status: "REVOKED" }), AT);
    expect(result).toMatchObject({ valid: false, refusalCode: "CONFIGURATION_REVOKED" });
  });

  it("refuses expired configurations", () => {
    const result = validateSettings(makeSettings({ expiresAt: "2026-01-01T00:00:00.000Z" }), AT);
    expect(result).toMatchObject({ valid: false, refusalCode: "CONFIGURATION_EXPIRED" });
  });

  it("refuses unsupported schema versions", () => {
    const result = validateSettings(makeSettings({ schemaVersion: "9.9" }), AT);
    expect(result).toMatchObject({ valid: false, refusalCode: "UNSUPPORTED_CONFIGURATION_VERSION" });
  });

  it("refuses a tampered checksum", () => {
    const settings = makeSettings();
    const tampered = { ...settings, icr: "999" };
    const result = validateSettings(tampered, AT);
    expect(result).toMatchObject({ valid: false, refusalCode: "CONFIGURATION_INTEGRITY_FAILURE" });
  });

  it.each([
    ["icr", "0"],
    ["isf", "0"],
    ["insulinDurationHours", "0"],
    ["doseIncrementUnits", "0"],
    ["maximumDoseUnits", "0"],
  ])("refuses non-positive %s", (field, value) => {
    const base = makeSettings();
    const withOverride = { ...base, [field]: value };
    const checksum = computeConfigurationChecksum(withOverride);
    const result = validateSettings({ ...withOverride, configurationChecksum: checksum }, AT);
    expect(result).toMatchObject({ valid: false, refusalCode: "INVALID_CONFIGURATION" });
  });

  it("refuses when maximum dose is below the dose increment", () => {
    const base = makeSettings();
    const withOverride = { ...base, maximumDoseUnits: "0.25" };
    const checksum = computeConfigurationChecksum(withOverride);
    const result = validateSettings({ ...withOverride, configurationChecksum: checksum }, AT);
    expect(result).toMatchObject({ valid: false, refusalCode: "INVALID_CONFIGURATION" });
  });

  it("refuses when target glucose is not above the low threshold", () => {
    const base = makeSettings();
    const withOverride = { ...base, targetGlucose: "3", lowGlucoseThreshold: "4" };
    const checksum = computeConfigurationChecksum(withOverride);
    const result = validateSettings({ ...withOverride, configurationChecksum: checksum }, AT);
    expect(result).toMatchObject({ valid: false, refusalCode: "INVALID_CONFIGURATION" });
  });

  it("refuses DIA without patient accuracy confirmation", () => {
    const base = makeSettings();
    const withOverride = { ...base, insulinDurationPatientConfirmedAccurate: false as unknown as true };
    const checksum = computeConfigurationChecksum(withOverride);
    const result = validateSettings({ ...withOverride, configurationChecksum: checksum }, AT);
    expect(result).toMatchObject({ valid: false, refusalCode: "INVALID_CONFIGURATION" });
  });

  it("refuses DIA with an unrecognised entry source", () => {
    const base = makeSettings();
    const withOverride = { ...base, insulinDurationEntrySource: "CLINICIAN_ENTERED" as never };
    const checksum = computeConfigurationChecksum(withOverride);
    const result = validateSettings({ ...withOverride, configurationChecksum: checksum }, AT);
    expect(result).toMatchObject({ valid: false, refusalCode: "INVALID_CONFIGURATION" });
  });
});
