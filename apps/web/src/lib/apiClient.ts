import { supabase } from "./supabase.js";

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
    request<{ results: unknown[]; totalMatches: number }>(
      `/foods/search?q=${encodeURIComponent(query)}${sourceDataset ? `&sourceDataset=${sourceDataset}` : ""}`,
    ),

  getMeasures: (sourceDataset: string, sourceFoodId: string) =>
    request<{ measures: unknown[] }>(`/foods/${sourceDataset}/${encodeURIComponent(sourceFoodId)}/measures`),

  calculateCarbohydrate: (body: Record<string, unknown>) =>
    request("/foods/calculate-carbohydrate", { method: "POST", body: JSON.stringify(body) }),

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

  getHistory: () => request<{ events: unknown[] }>("/history"),
  getHistoryEvent: (eventId: string) => request(`/history/${eventId}`),
};
