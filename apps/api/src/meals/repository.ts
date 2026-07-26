import { randomUUID } from "node:crypto";
import type { SavedMealComponentRecord, SavedMealRecord } from "@diabetes-companion/food-contracts";
import type { NormalizedMealComponentInput } from "./validation.js";

export interface SavedMealsRepository {
  create(patientId: string, name: string, components: readonly NormalizedMealComponentInput[]): Promise<SavedMealRecord>;
  list(patientId: string, includeArchived: boolean): Promise<readonly SavedMealRecord[]>;
  getById(id: string): Promise<SavedMealRecord | undefined>;
  rename(id: string, name: string): Promise<SavedMealRecord>;
  addComponent(mealId: string, patientId: string, component: NormalizedMealComponentInput): Promise<SavedMealRecord>;
  updateComponent(
    mealId: string,
    componentId: string,
    patch: Partial<NormalizedMealComponentInput>,
  ): Promise<SavedMealRecord>;
  removeComponent(mealId: string, componentId: string): Promise<SavedMealRecord>;
  duplicate(mealId: string, patientId: string, newName: string): Promise<SavedMealRecord>;
  setArchived(id: string, archived: boolean): Promise<SavedMealRecord>;
}

/** In-memory reference implementation for local development only. */
export class MemorySavedMealsRepository implements SavedMealsRepository {
  private readonly meals = new Map<string, SavedMealRecord>();

  async create(
    patientId: string,
    name: string,
    components: readonly NormalizedMealComponentInput[],
  ): Promise<SavedMealRecord> {
    const now = new Date().toISOString();
    const mealId = randomUUID();
    const record: SavedMealRecord = {
      id: mealId,
      patientId,
      name,
      duplicatedFromMealId: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      components: components.map((component, index) => toComponentRecord(mealId, index, component)),
    };
    this.meals.set(mealId, record);
    return record;
  }

  async list(patientId: string, includeArchived: boolean): Promise<readonly SavedMealRecord[]> {
    return [...this.meals.values()]
      .filter((meal) => meal.patientId === patientId && (includeArchived || !meal.archivedAt))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(id: string): Promise<SavedMealRecord | undefined> {
    return this.meals.get(id);
  }

  async rename(id: string, name: string): Promise<SavedMealRecord> {
    const meal = this.require(id);
    const updated = { ...meal, name, updatedAt: new Date().toISOString() };
    this.meals.set(id, updated);
    return updated;
  }

  async addComponent(mealId: string, _patientId: string, component: NormalizedMealComponentInput): Promise<SavedMealRecord> {
    const meal = this.require(mealId);
    const position = meal.components.length;
    const updated: SavedMealRecord = {
      ...meal,
      components: [...meal.components, toComponentRecord(mealId, position, component)],
      updatedAt: new Date().toISOString(),
    };
    this.meals.set(mealId, updated);
    return updated;
  }

  async updateComponent(
    mealId: string,
    componentId: string,
    patch: Partial<NormalizedMealComponentInput>,
  ): Promise<SavedMealRecord> {
    const meal = this.require(mealId);
    let found = false;
    const components = meal.components.map((component) => {
      if (component.id !== componentId) return component;
      found = true;
      return { ...component, ...patch } as SavedMealComponentRecord;
    });
    if (!found) throw new Error("Meal component not found");
    const updated = { ...meal, components, updatedAt: new Date().toISOString() };
    this.meals.set(mealId, updated);
    return updated;
  }

  async removeComponent(mealId: string, componentId: string): Promise<SavedMealRecord> {
    const meal = this.require(mealId);
    const components = meal.components.filter((component) => component.id !== componentId);
    const updated = { ...meal, components, updatedAt: new Date().toISOString() };
    this.meals.set(mealId, updated);
    return updated;
  }

  async duplicate(mealId: string, patientId: string, newName: string): Promise<SavedMealRecord> {
    const meal = this.require(mealId);
    const now = new Date().toISOString();
    const newMealId = randomUUID();
    const duplicate: SavedMealRecord = {
      id: newMealId,
      patientId,
      name: newName,
      duplicatedFromMealId: meal.id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      components: meal.components.map((component, index) =>
        toComponentRecord(newMealId, index, {
          componentSource: component.componentSource,
          sourceDataset: component.sourceDataset,
          sourceFoodId: component.sourceFoodId,
          customFoodId: component.customFoodId,
          label: component.label,
          quantityKind: component.quantityKind,
          quantityGrams: component.quantityGrams,
          quantityMillilitres: component.quantityMillilitres,
          measureId: component.measureId,
          measureMultiplier: component.measureMultiplier,
        }),
      ),
    };
    this.meals.set(newMealId, duplicate);
    return duplicate;
  }

  async setArchived(id: string, archived: boolean): Promise<SavedMealRecord> {
    const meal = this.require(id);
    const updated = { ...meal, archivedAt: archived ? new Date().toISOString() : null, updatedAt: new Date().toISOString() };
    this.meals.set(id, updated);
    return updated;
  }

  private require(id: string): SavedMealRecord {
    const meal = this.meals.get(id);
    if (!meal) throw new Error("Meal not found");
    return meal;
  }
}

function toComponentRecord(
  mealId: string,
  position: number,
  component: NormalizedMealComponentInput,
): SavedMealComponentRecord {
  return {
    id: randomUUID(),
    mealId,
    position,
    componentSource: component.componentSource,
    sourceDataset: component.sourceDataset as SavedMealComponentRecord["sourceDataset"],
    sourceFoodId: component.sourceFoodId,
    customFoodId: component.customFoodId,
    label: component.label,
    quantityKind: component.quantityKind,
    quantityGrams: component.quantityGrams,
    quantityMillilitres: component.quantityMillilitres,
    measureId: component.measureId,
    measureMultiplier: component.measureMultiplier,
  };
}
