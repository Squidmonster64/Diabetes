export type FoodErrorCode =
  | "INVALID_QUERY"
  | "FOOD_NOT_FOUND"
  | "MEASURE_NOT_FOUND"
  | "INVALID_QUANTITY"
  | "QUANTITY_TOO_LARGE"
  | "NO_CARBOHYDRATE_DATA"
  | "INVALID_CUSTOM_FOOD"
  | "CUSTOM_FOOD_NOT_FOUND"
  | "CUSTOM_FOOD_ARCHIVED"
  | "MEAL_NOT_FOUND"
  | "MEAL_COMPONENT_NOT_FOUND"
  | "INVALID_MEAL_COMPONENT";

export class FoodModuleError extends Error {
  constructor(readonly code: FoodErrorCode, message: string) {
    super(message);
    this.name = "FoodModuleError";
  }
}
