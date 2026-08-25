import { describe, expect, it } from "vitest";
import { formatNutrient, remainingCopy } from "@diabetes-companion/food-engine";

describe("nutrition display helpers", () => {
  it("renders unknown nutrients as an em dash rather than zero", () => {
    expect(formatNutrient(null, "g")).toBe("—");
    expect(formatNutrient(0, "g")).toBe("0 g");
  });

  it("does not describe leftover sodium as something to consume", () => {
    const copy = remainingCopy("sodiumMg", 150, { kind: "limit", value: 2000 });
    expect(copy?.toLowerCase()).toContain("limit");
    expect(copy?.toLowerCase()).not.toContain("remaining to");
  });
});
