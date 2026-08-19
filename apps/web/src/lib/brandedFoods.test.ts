import { describe, expect, it } from "vitest";
import { brandedFoodOptionsForPhrase, subwayAustraliaOptions } from "./brandedFoods.js";

describe("official branded-food catalogue", () => {
  it("offers Subway Australia standard-menu items only when Subway was explicitly named", () => {
    expect(brandedFoodOptionsForPhrase("subway sandwich")).not.toHaveLength(0);
    expect(brandedFoodOptionsForPhrase("chicken sandwich")).toHaveLength(0);
  });

  it("keeps the official six-inch product carbohydrate value and source trace", () => {
    const chickenClassic = subwayAustraliaOptions("SIX_INCH").find((option) => option.label === "Chicken Classic");
    expect(chickenClassic).toMatchObject({
      carbohydrateGrams: 47.5,
      servingLabel: "6-inch standard menu sub",
      sourceLabel: "Subway Australia Nutritional Web Guide",
      sourceVersion: "May 2026",
      footlongIsApproximate: false,
    });
    expect(chickenClassic?.sourceUrl).toContain("subway.com");
  });

  it("labels Footlong values as the official guide’s approximate double, not as a separate exact product record", () => {
    const chickenClassic = subwayAustraliaOptions("FOOTLONG").find((option) => option.label === "Chicken Classic");
    expect(chickenClassic).toMatchObject({ carbohydrateGrams: 95, footlongIsApproximate: true });
    expect(chickenClassic?.servingLabel).toContain("approximately double");
  });
});
