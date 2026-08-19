import { supabase } from "./supabase.js";
import type {
  CarbohydrateCalculationResult,
  CustomFoodRecord,
  FoodMeasure,
  FoodSearchResult,
  MealCarbohydrateCalculationResult,
  SavedMealRecord,
} from "@diabetes-companion/food-contracts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly requestId?: string) {
    super(message);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeader()),
    ...(init.headers as Record<string, string> | undefined),
  };
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body?.error ?? {};
    throw new ApiError(response.status, error.code ?? "UNKNOWN_ERROR", error.message ?? "Request failed.", error.requestId);
  }
  return body as T;
}

export const api = {
  health: () => request<{ status: string; databaseSha256: string; calculatorVersion: string }>("/health"),

  searchFoods: (query: string, sourceDataset?: string) =>
    request<{ results: FoodSearchResult[]; totalMatches: number }>(
      `/foods/search?q=${encodeURIComponent(query)}${sourceDataset ? `&sourceDataset=${sourceDataset}` : ""}`,
    ),

  getMeasures: (sourceDataset: string, sourceFoodId: string) =>
    request<{ measures: FoodMeasure[] }>(`/foods/${sourceDataset}/${encodeURIComponent(sourceFoodId)}/measures`),

  calculateCarbohydrate: (body: Record<string, unknown>) =>
    request<CarbohydrateCalculationResult>("/foods/calculate-carbohydrate", { method: "POST", body: JSON.stringify(body) }),

  getCurrentSettings: () => request("/settings/current"),
  getSettingsHistory: () => request<{ history: unknown[] }>("/settings/history"),
  createSettings: (body: Record<string, unknown>) =>
    request("/settings", { method: "POST", body: JSON.stringify(body) }),

  previewBolus: (body: Record<string, unknown>) =>
    request("/bolus/preview", { method: "POST", body: JSON.stringify(body) }),
  confirmBolus: (previewId: string, body: Record<string, unknown>) =>
    request(`/bolus/previews/${previewId}/confirm`, { method: "POST", body: JSON.stringify(body) }),
  rejectBolus: (previewId: string, body: Record<string, unknown>) =>
    request(`/bolus/previews/${previewId}/reject`, { method: "POST", body: JSON.stringify(body) }),
  recordAdministration: (body: Record<string, unknown>) =>
    request("/administrations", { method: "POST", body: JSON.stringify(body) }),

  getHistory: () => request<{ events: unknown[] }>("/history"),
  getHistoryEvent: (eventId: string) => request(`/history/${eventId}`),

  // Custom foods (packet-label / manual entries)
  listCustomFoods: (includeArchived = false) =>
    request<{ foods: CustomFoodRecord[] }>(`/custom-foods${includeArchived ? "?includeArchived=true" : ""}`),
  getCustomFood: (id: string) => request<CustomFoodRecord>(`/custom-foods/${id}`),
  createCustomFood: (body: Record<string, unknown>) =>
    request<CustomFoodRecord>("/custom-foods", { method: "POST", body: JSON.stringify(body) }),
  updateCustomFood: (id: string, body: Record<string, unknown>) =>
    request<CustomFoodRecord>(`/custom-foods/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  archiveCustomFood: (id: string) => request<CustomFoodRecord>(`/custom-foods/${id}/archive`, { method: "POST" }),
  unarchiveCustomFood: (id: string) => request<CustomFoodRecord>(`/custom-foods/${id}/unarchive`, { method: "POST" }),
  calculateCustomFoodCarbohydrate: (id: string, grams: number) =>
    request<{ carbohydrateGrams: number }>(`/custom-foods/${id}/calculate-carbohydrate`, {
      method: "POST",
      body: JSON.stringify({ grams }),
    }),

  // Saved reusable meals
  listMeals: (includeArchived = false) =>
    request<{ meals: SavedMealRecord[] }>(`/meals${includeArchived ? "?includeArchived=true" : ""}`),
  getMeal: (id: string) =>
    request<{ meal: SavedMealRecord; calculation: MealCarbohydrateCalculationResult }>(`/meals/${id}`),
  createMeal: (body: Record<string, unknown>) => request<SavedMealRecord>("/meals", { method: "POST", body: JSON.stringify(body) }),
  renameMeal: (id: string, name: string) =>
    request<SavedMealRecord>(`/meals/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  addMealComponent: (mealId: string, body: Record<string, unknown>) =>
    request<SavedMealRecord>(`/meals/${mealId}/components`, { method: "POST", body: JSON.stringify(body) }),
  updateMealComponent: (mealId: string, componentId: string, body: Record<string, unknown>) =>
    request<SavedMealRecord>(`/meals/${mealId}/components/${componentId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  removeMealComponent: (mealId: string, componentId: string) =>
    request<SavedMealRecord>(`/meals/${mealId}/components/${componentId}`, { method: "DELETE" }),
  duplicateMeal: (id: string, name?: string) =>
    request<SavedMealRecord>(`/meals/${id}/duplicate`, { method: "POST", body: JSON.stringify({ name }) }),
  archiveMeal: (id: string) => request<SavedMealRecord>(`/meals/${id}/archive`, { method: "POST" }),
  unarchiveMeal: (id: string) => request<SavedMealRecord>(`/meals/${id}/unarchive`, { method: "POST" }),
  calculateMealCarbohydrate: (id: string, overrides: Record<string, unknown>[] = []) =>
    request<MealCarbohydrateCalculationResult>(`/meals/${id}/calculate-carbohydrate`, {
      method: "POST",
      body: JSON.stringify({ overrides }),
    }),
};
