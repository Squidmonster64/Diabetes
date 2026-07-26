import { describe, expect, it } from "vitest";
import { Decimal } from "../src/decimal.js";

describe("Decimal", () => {
  it("parses and round-trips canonical strings", () => {
    expect(Decimal.parse("4").toCanonicalString()).toBe("4");
    expect(Decimal.parse("4.50").toCanonicalString()).toBe("4.5");
    expect(Decimal.parse("-2.25").toCanonicalString()).toBe("-2.25");
    expect(Decimal.parse("0").toCanonicalString()).toBe("0");
  });

  it("rejects exponential notation", () => {
    expect(() => Decimal.parse("1e2")).toThrow();
  });

  it("rejects locale-formatted values (thousands separators)", () => {
    expect(() => Decimal.parse("1,000")).toThrow();
  });

  it("rejects empty and overlong strings", () => {
    expect(() => Decimal.parse("")).toThrow();
    expect(() => Decimal.parse("1".repeat(40))).toThrow();
  });

  it("computes exact decimal arithmetic without float drift", () => {
    const result = Decimal.parse("0.1").add(Decimal.parse("0.2"));
    expect(result.toCanonicalString()).toBe("0.3");
  });

  it("divides exactly using rational arithmetic", () => {
    const result = Decimal.parse("40").divide(Decimal.parse("10"));
    expect(result.toCanonicalString()).toBe("4");
  });

  it("rounds half-up to the configured increment", () => {
    expect(Decimal.parse("4.25").roundHalfUpToIncrement(Decimal.parse("0.5")).toCanonicalString()).toBe("4.5");
    expect(Decimal.parse("4.24").roundHalfUpToIncrement(Decimal.parse("0.5")).toCanonicalString()).toBe("4");
    expect(Decimal.parse("4.3").add(Decimal.parse("0.2")).roundHalfUpToIncrement(Decimal.parse("0.5")).toCanonicalString()).toBe(
      "4.5",
    );
  });

  it("rejects rounding a negative dose", () => {
    expect(() => Decimal.parse("-1").roundHalfUpToIncrement(Decimal.parse("0.5"))).toThrow();
  });

  it("compares and takes max correctly", () => {
    expect(Decimal.parse("3").compare(Decimal.parse("5"))).toBeLessThan(0);
    expect(Decimal.parse("5").max(Decimal.parse("3")).toCanonicalString()).toBe("5");
  });
});
