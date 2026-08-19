export interface BrandedFoodOption {
  readonly id: string;
  readonly brand: string;
  readonly label: string;
  readonly carbohydrateGrams: number;
  readonly servingLabel: string;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
  readonly sourceVersion: string;
  readonly footlongIsApproximate: boolean;
}

const SUBWAY_AU_SOURCE_URL = "https://media.subway.com/dam/urn:aaid:aem:07679edc-a6f3-424c-a167-f7864b20da6e/original/as/AUS%20Nutritional%20Web%20Guide%20May%202026.pdf";
const SUBWAY_AU_SOURCE_LABEL = "Subway Australia Nutritional Web Guide";
const SUBWAY_AU_SOURCE_VERSION = "May 2026";

const SUBWAY_AU_SIX_INCH: ReadonlyArray<readonly [string, string, number]> = [
  ["bbq-southern-style-chicken", "BBQ Southern-Style Chicken", 63.1],
  ["chicken-bacon-ranch", "Chicken & Bacon Ranch", 39.1],
  ["chicken-classic", "Chicken Classic", 47.5],
  ["chicken-schnitzel", "Chicken Schnitzel", 50.2],
  ["chicken-strips", "Chicken Strips", 38.3],
  ["chipotle-steak-melt", "Chipotle Steak Melt", 42.4],
  ["honey-mustard-leg-ham", "Honey Mustard Leg Ham", 48.0],
  ["italian-bmt", "Italian B.M.T.", 42.5],
  ["italian-meatball", "Italian Meatball", 51.8],
  ["philly-style-three-cheese-steak", "Philly-Style Three-Cheese Steak", 41.5],
  ["pizza-melt", "Pizza Melt", 42.6],
  ["rotisserie-style-chicken", "Rotisserie-Style Chicken", 42.5],
  ["seafood-sensation", "Seafood Sensation", 46.7],
  ["smashed-falafel", "Smashed Falafel", 57.6],
  ["sweet-onion-chicken-teriyaki", "Sweet Onion Chicken Teriyaki", 54.5],
  ["tuna-mayo", "Tuna Mayo", 38.2],
  ["turkey-on-rye", "Turkey on Rye", 47.7],
  ["veggie-delite-with-avo", "Veggie Delite with Avo", 44.5],
  ["veggie-patty", "Veggie Patty", 67.1],
];

/**
 * Official standard-menu Subway Australia values. The source guide expressly
 * directs users to double 6-inch values for an approximate Footlong value;
 * this is shown as an approximation, never as a product-specific claim.
 */
export function subwayAustraliaOptions(size: "SIX_INCH" | "FOOTLONG"): readonly BrandedFoodOption[] {
  const multiplier = size === "FOOTLONG" ? 2 : 1;
  const servingLabel = size === "FOOTLONG" ? "Footlong (official guide: approximately double 6-inch values)" : "6-inch standard menu sub";
  return SUBWAY_AU_SIX_INCH.map(([id, label, carbohydrateGrams]) => ({
    id: `subway-au-${size.toLowerCase()}-${id}`,
    brand: "Subway Australia",
    label,
    carbohydrateGrams: Math.round(carbohydrateGrams * multiplier * 10) / 10,
    servingLabel,
    sourceLabel: SUBWAY_AU_SOURCE_LABEL,
    sourceUrl: SUBWAY_AU_SOURCE_URL,
    sourceVersion: SUBWAY_AU_SOURCE_VERSION,
    footlongIsApproximate: size === "FOOTLONG",
  }));
}

/** Does not attempt fuzzy brand identification; the patient must say Subway explicitly. */
export function brandedFoodOptionsForPhrase(phrase: string): readonly BrandedFoodOption[] {
  return /\bsubway\b/i.test(phrase) ? subwayAustraliaOptions("SIX_INCH") : [];
}
