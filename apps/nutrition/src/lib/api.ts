import { supabase } from "./supabase.js";
import type { NutrientPanel, NutritionMealItem, NutritionMealLog, NutritionTargets } from "@diabetes-companion/food-engine";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  const devPatientId = import.meta.env.VITE_DEV_PATIENT_ID;
  if (devPatientId) headers["X-Dev-Patient-Id"] = String(devPatientId);
  return headers;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeader()),
    ...(init.headers as Record<string, string> | undefined),
  };
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("text/csv") ? await response.text() : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } })?.error ?? {};
    throw new ApiError(response.status, error.code ?? "UNKNOWN_ERROR", error.message ?? "Request failed.");
  }
  return body as T;
}

export interface InterpretedMeal {
  originalText: string;
  transcription: string | null;
  parsedMeal: { items: Array<{ foodName: string; quantity: number | null; unit: string | null }>; parseSource: string };
  items: NutritionMealItem[];
  totals: NutrientPanel;
  unresolved: string[];
  warnings: string[];
  inferredMealType: string;
  parseVersion: string;
  promptVersion: string;
  modelVersion: string | null;
  duplicateOf: { id: string; loggedAt: string } | null;
  candidatesByItem: Array<Array<{ label: string; sourceDataset: string | null; sourceFoodId: string | null; confidence: number }>>;
}

export const api = {
  interpret: (body: Record<string, unknown>) => request<InterpretedMeal>("/nutrition/interpret", { method: "POST", body: JSON.stringify(body) }),
  resolveItem: (body: Record<string, unknown>) => request<{ item: NutritionMealItem; candidates: unknown[]; expanded: NutritionMealItem[] }>("/nutrition/resolve-item", { method: "POST", body: JSON.stringify(body) }),
  logMeal: (body: Record<string, unknown>) => request<NutritionMealLog>("/nutrition/meals", { method: "POST", body: JSON.stringify(body) }),
  listMeals: (from?: string, to?: string) =>
    request<{ meals: NutritionMealLog[] }>(`/nutrition/meals${from ? `?from=${from}&to=${to}` : ""}`),
  getMeal: (id: string) => request<NutritionMealLog>(`/nutrition/meals/${id}`),
  updateMeal: (id: string, body: Record<string, unknown>) => request<NutritionMealLog>(`/nutrition/meals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteMeal: (id: string) => request<{ ok: boolean }>(`/nutrition/meals/${id}`, { method: "DELETE" }),
  repeatMeal: (id: string, body: Record<string, unknown> = {}) => request<NutritionMealLog>(`/nutrition/meals/${id}/repeat`, { method: "POST", body: JSON.stringify(body) }),
  getDay: (date: string, timezone: string) => request<{
    date: string;
    meals: NutritionMealLog[];
    totals: NutrientPanel;
    completeness: string;
    insight: { statements: Array<{ text: string; tone: string }>; topSodium: Array<{ label: string; amount: number }> };
    remaining: Record<string, { remaining: number | null; copy: string | null }>;
    targets: NutritionTargets | null;
  }>(`/nutrition/days/${date}?timezone=${encodeURIComponent(timezone)}`),
  setCompleteness: (date: string, completeness: "complete" | "partial") =>
    request(`/nutrition/days/${date}/completeness`, { method: "PUT", body: JSON.stringify({ completeness }) }),
  getTargets: () => request<{ targets: NutritionTargets | null }>("/nutrition/targets"),
  putTargets: (targets: NutritionTargets | null) => request<{ targets: NutritionTargets | null }>("/nutrition/targets", { method: "PUT", body: JSON.stringify({ targets }) }),
  getProfile: () => request<{ profile: { timezone: string; onboardingComplete: boolean; targetsSkipped: boolean } }>("/nutrition/profile"),
  putProfile: (body: Record<string, unknown>) => request("/nutrition/profile", { method: "PUT", body: JSON.stringify(body) }),
  summary: (range: string, timezone: string) => request<Record<string, unknown>>(`/nutrition/summary?range=${range}&timezone=${encodeURIComponent(timezone)}`),
  nutrient: (key: string, range: string, timezone: string) => request<Record<string, unknown>>(`/nutrition/nutrients/${key}?range=${range}&timezone=${encodeURIComponent(timezone)}`),
  recentFoods: () => request<{ foods: NutritionMealItem[] }>("/nutrition/recent-foods"),
  favourites: () => request<{ favourites: Array<{ id: string; foodName: string; foodKey: string }> }>("/nutrition/favourites"),
  addFavourite: (body: Record<string, unknown>) => request("/nutrition/favourites", { method: "POST", body: JSON.stringify(body) }),
  removeFavourite: (id: string) => request(`/nutrition/favourites/${id}`, { method: "DELETE" }),
  savedMeals: () => request<{ meals: Array<{ id: string; name: string; items: NutritionMealItem[]; totals: NutrientPanel }> }>("/nutrition/saved-meals"),
  saveMeal: (body: Record<string, unknown>) => request("/nutrition/saved-meals", { method: "POST", body: JSON.stringify(body) }),
  deleteSavedMeal: (id: string) => request(`/nutrition/saved-meals/${id}`, { method: "DELETE" }),
  recipes: () => request<{ recipes: Array<{ id: string; name: string; servings: number; items: NutritionMealItem[] }> }>("/nutrition/recipes"),
  createRecipe: (body: Record<string, unknown>) => request("/nutrition/recipes", { method: "POST", body: JSON.stringify(body) }),
  customFoods: () => request<{ foods: Array<{ id: string; name: string; brand: string | null }> }>("/nutrition/custom-foods"),
  createCustomFood: (body: Record<string, unknown>) => request("/nutrition/custom-foods", { method: "POST", body: JSON.stringify(body) }),
  searchFoods: (q: string) => request<{ results: Array<{ foodName: string; sourceDataset: string; sourceFoodId: string }> }>(`/nutrition/foods/search?q=${encodeURIComponent(q)}`),
  exportCsv: () => request<string>("/nutrition/export?format=csv"),
  exportJson: () => request<unknown>("/nutrition/export?format=json"),
  track: (name: string) => request("/nutrition/events", { method: "POST", body: JSON.stringify({ name }) }).catch(() => undefined),
  deleteAccountData: () => request("/nutrition/account", { method: "DELETE" }),
};

export const DRAFT_KEY = "nutrition-draft";

export function saveDraft(draft: InterpretedMeal & { mealType: string; timezone: string; loggedAt: string; sourceType: "voice" | "text" }): void {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadDraft(): (InterpretedMeal & { mealType: string; timezone: string; loggedAt: string; sourceType: "voice" | "text" }) | null {
  const raw = sessionStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InterpretedMeal & { mealType: string; timezone: string; loggedAt: string; sourceType: "voice" | "text" };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  sessionStorage.removeItem(DRAFT_KEY);
}

export function userTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Sydney";
}

export function todayLocal(timeZone = userTimezone()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
