import { FoodModuleError } from "./errors.js";

export function requireFiniteQuantity(value: number, max: number): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new FoodModuleError("INVALID_QUANTITY", "Quantity must be a finite number.");
  }
  if (value <= 0) throw new FoodModuleError("INVALID_QUANTITY", "Quantity must be greater than zero.");
  if (value > max) throw new FoodModuleError("QUANTITY_TOO_LARGE", `Quantity must not exceed ${max}.`);
}

export function round1dp(value: number): number {
  return Math.round(value * 10) / 10;
}

export const MAX_GRAMS = 5000;
export const MAX_MILLILITRES = 5000;
export const MAX_MEASURE_MULTIPLIER = 100;
