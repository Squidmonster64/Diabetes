import { randomUUID } from "node:crypto";
import type { CustomFoodRecord } from "@diabetes-companion/food-contracts";
import type { NormalizedCustomFoodInput } from "./validation.js";

export interface CustomFoodsRepository {
  create(patientId: string, input: NormalizedCustomFoodInput): Promise<CustomFoodRecord>;
  list(patientId: string, includeArchived: boolean): Promise<readonly CustomFoodRecord[]>;
  getById(id: string): Promise<CustomFoodRecord | undefined>;
  update(id: string, patch: Partial<NormalizedCustomFoodInput>): Promise<CustomFoodRecord>;
  setArchived(id: string, archived: boolean): Promise<CustomFoodRecord>;
}

/** In-memory reference implementation for local development only. */
export class MemoryCustomFoodsRepository implements CustomFoodsRepository {
  private readonly byId = new Map<string, CustomFoodRecord>();

  async create(patientId: string, input: NormalizedCustomFoodInput): Promise<CustomFoodRecord> {
    const now = new Date().toISOString();
    const record: CustomFoodRecord = {
      id: randomUUID(),
      patientId,
      foodType: input.foodType,
      name: input.name,
      brand: input.brand,
      servingDescription: input.servingDescription,
      servingGrams: input.servingGrams,
      carbohydratePerServingGrams: input.carbohydratePerServingGrams,
      carbohydratePer100gGrams: input.carbohydratePer100gGrams,
      sourceName: input.sourceName,
      sourceReference: input.sourceReference,
      sourceRetrievedAt: input.sourceRetrievedAt,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(record.id, record);
    return record;
  }

  async list(patientId: string, includeArchived: boolean): Promise<readonly CustomFoodRecord[]> {
    return [...this.byId.values()]
      .filter((food) => food.patientId === patientId && (includeArchived || !food.archivedAt))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(id: string): Promise<CustomFoodRecord | undefined> {
    return this.byId.get(id);
  }

  async update(id: string, patch: Partial<NormalizedCustomFoodInput>): Promise<CustomFoodRecord> {
    const existing = this.byId.get(id);
    if (!existing) throw new Error("Custom food not found");
    const updated: CustomFoodRecord = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.byId.set(id, updated);
    return updated;
  }

  async setArchived(id: string, archived: boolean): Promise<CustomFoodRecord> {
    const existing = this.byId.get(id);
    if (!existing) throw new Error("Custom food not found");
    const updated: CustomFoodRecord = {
      ...existing,
      archivedAt: archived ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    };
    this.byId.set(id, updated);
    return updated;
  }
}
