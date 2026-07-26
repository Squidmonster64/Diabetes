export type FoodErrorCode =
  | "INVALID_QUERY"
  | "FOOD_NOT_FOUND"
  | "MEASURE_NOT_FOUND"
  | "INVALID_QUANTITY"
  | "QUANTITY_TOO_LARGE"
  | "NO_CARBOHYDRATE_DATA";

export class FoodModuleError extends Error {
  constructor(readonly code: FoodErrorCode, message: string) {
    super(message);
    this.name = "FoodModuleError";
  }
}
