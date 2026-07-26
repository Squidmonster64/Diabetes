import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedMealComponentRecord, SavedMealRecord } from "@diabetes-companion/food-contracts";
import type { SavedMealsRepository } from "./repository.js";
import type { NormalizedMealComponentInput } from "./validation.js";

function rowToComponentRecord(row: Record<string, unknown>): SavedMealComponentRecord {
  return {
    id: row.id as string,
    mealId: row.meal_id as string,
    position: row.position as number,
    componentSource: row.component_source as SavedMealComponentRecord["componentSource"],
    sourceDataset: (row.source_dataset as SavedMealComponentRecord["sourceDataset"]) ?? null,
    sourceFoodId: (row.source_food_id as string) ?? null,
    customFoodId: (row.custom_food_id as string) ?? null,
    label: row.label as string,
    quantityKind: row.quantity_kind as SavedMealComponentRecord["quantityKind"],
    quantityGrams: (row.quantity_grams as string) ?? null,
    quantityMillilitres: (row.quantity_millilitres as string) ?? null,
    measureId: (row.measure_id as string) ?? null,
    measureMultiplier: (row.measure_multiplier as string) ?? null,
  };
}

function componentInsertPayload(
  mealId: string,
  patientId: string,
  position: number,
  component: NormalizedMealComponentInput,
): Record<string, unknown> {
  return {
    meal_id: mealId,
    patient_id: patientId,
    position,
    component_source: component.componentSource,
    source_dataset: component.sourceDataset,
    source_food_id: component.sourceFoodId,
    custom_food_id: component.customFoodId,
    label: component.label,
    quantity_kind: component.quantityKind,
    quantity_grams: component.quantityGrams,
    quantity_millilitres: component.quantityMillilitres,
    measure_id: component.measureId,
    measure_multiplier: component.measureMultiplier,
  };
}

export class SupabaseSavedMealsRepository implements SavedMealsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(
    patientId: string,
    name: string,
    components: readonly NormalizedMealComponentInput[],
  ): Promise<SavedMealRecord> {
    const { data: mealRow, error: mealError } = await this.client
      .from("saved_meals")
      .insert({ patient_id: patientId, name })
      .select("*")
      .single();
    if (mealError) throw new Error(`Failed to create meal: ${mealError.message}`);

    const componentRows = await this.insertComponents(mealRow.id, patientId, components);
    return this.toMealRecord(mealRow, componentRows);
  }

  async list(patientId: string, includeArchived: boolean): Promise<readonly SavedMealRecord[]> {
    let query = this.client.from("saved_meals").select("*").eq("patient_id", patientId);
    if (!includeArchived) query = query.is("archived_at", null);
    const { data: mealRows, error } = await query.order("name", { ascending: true });
    if (error) throw new Error(`Failed to list meals: ${error.message}`);
    if (!mealRows || mealRows.length === 0) return [];

    const mealIds = mealRows.map((row) => row.id as string);
    const { data: componentRows, error: componentError } = await this.client
      .from("saved_meal_components")
      .select("*")
      .in("meal_id", mealIds)
      .order("position", { ascending: true });
    if (componentError) throw new Error(`Failed to list meal components: ${componentError.message}`);

    return mealRows.map((mealRow) =>
      this.toMealRecord(
        mealRow,
        (componentRows ?? []).filter((component) => component.meal_id === mealRow.id),
      ),
    );
  }

  async getById(id: string): Promise<SavedMealRecord | undefined> {
    const { data: mealRow, error } = await this.client.from("saved_meals").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`Failed to load meal: ${error.message}`);
    if (!mealRow) return undefined;
    const { data: componentRows, error: componentError } = await this.client
      .from("saved_meal_components")
      .select("*")
      .eq("meal_id", id)
      .order("position", { ascending: true });
    if (componentError) throw new Error(`Failed to load meal components: ${componentError.message}`);
    return this.toMealRecord(mealRow, componentRows ?? []);
  }

  async rename(id: string, name: string): Promise<SavedMealRecord> {
    const { error } = await this.client.from("saved_meals").update({ name }).eq("id", id);
    if (error) throw new Error(`Failed to rename meal: ${error.message}`);
    const meal = await this.getById(id);
    if (!meal) throw new Error("Meal not found after rename");
    return meal;
  }

  async addComponent(
    mealId: string,
    patientId: string,
    component: NormalizedMealComponentInput,
  ): Promise<SavedMealRecord> {
    const { count } = await this.client
      .from("saved_meal_components")
      .select("*", { count: "exact", head: true })
      .eq("meal_id", mealId);
    const { error } = await this.client
      .from("saved_meal_components")
      .insert(componentInsertPayload(mealId, patientId, count ?? 0, component));
    if (error) throw new Error(`Failed to add meal component: ${error.message}`);
    await this.touchMeal(mealId);
    const meal = await this.getById(mealId);
    if (!meal) throw new Error("Meal not found after adding component");
    return meal;
  }

  async updateComponent(
    mealId: string,
    componentId: string,
    patch: Partial<NormalizedMealComponentInput>,
  ): Promise<SavedMealRecord> {
    const updatePayload: Record<string, unknown> = {};
    if (patch.label !== undefined) updatePayload.label = patch.label;
    if (patch.quantityKind !== undefined) updatePayload.quantity_kind = patch.quantityKind;
    if (patch.quantityGrams !== undefined) updatePayload.quantity_grams = patch.quantityGrams;
    if (patch.quantityMillilitres !== undefined) updatePayload.quantity_millilitres = patch.quantityMillilitres;
    if (patch.measureId !== undefined) updatePayload.measure_id = patch.measureId;
    if (patch.measureMultiplier !== undefined) updatePayload.measure_multiplier = patch.measureMultiplier;

    const { error } = await this.client
      .from("saved_meal_components")
      .update(updatePayload)
      .eq("id", componentId)
      .eq("meal_id", mealId);
    if (error) throw new Error(`Failed to update meal component: ${error.message}`);
    await this.touchMeal(mealId);
    const meal = await this.getById(mealId);
    if (!meal) throw new Error("Meal not found after updating component");
    return meal;
  }

  async removeComponent(mealId: string, componentId: string): Promise<SavedMealRecord> {
    const { error } = await this.client
      .from("saved_meal_components")
      .delete()
      .eq("id", componentId)
      .eq("meal_id", mealId);
    if (error) throw new Error(`Failed to remove meal component: ${error.message}`);
    await this.touchMeal(mealId);
    const meal = await this.getById(mealId);
    if (!meal) throw new Error("Meal not found after removing component");
    return meal;
  }

  async duplicate(mealId: string, patientId: string, newName: string): Promise<SavedMealRecord> {
    const source = await this.getById(mealId);
    if (!source) throw new Error("Meal not found");

    const { data: mealRow, error: mealError } = await this.client
      .from("saved_meals")
      .insert({ patient_id: patientId, name: newName, duplicated_from_meal_id: mealId })
      .select("*")
      .single();
    if (mealError) throw new Error(`Failed to duplicate meal: ${mealError.message}`);

    const componentRows = await this.insertComponents(
      mealRow.id,
      patientId,
      source.components.map((component) => ({
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
      })),
    );
    return this.toMealRecord(mealRow, componentRows);
  }

  async setArchived(id: string, archived: boolean): Promise<SavedMealRecord> {
    const { error } = await this.client
      .from("saved_meals")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) throw new Error(`Failed to update meal archive state: ${error.message}`);
    const meal = await this.getById(id);
    if (!meal) throw new Error("Meal not found after archive update");
    return meal;
  }

  private async insertComponents(
    mealId: string,
    patientId: string,
    components: readonly NormalizedMealComponentInput[],
  ): Promise<Record<string, unknown>[]> {
    if (components.length === 0) return [];
    const payload = components.map((component, index) => componentInsertPayload(mealId, patientId, index, component));
    const { data, error } = await this.client.from("saved_meal_components").insert(payload).select("*");
    if (error) throw new Error(`Failed to create meal components: ${error.message}`);
    return data ?? [];
  }

  private async touchMeal(mealId: string): Promise<void> {
    await this.client.from("saved_meals").update({ updated_at: new Date().toISOString() }).eq("id", mealId);
  }

  private toMealRecord(mealRow: Record<string, unknown>, componentRows: Record<string, unknown>[]): SavedMealRecord {
    return {
      id: mealRow.id as string,
      patientId: mealRow.patient_id as string,
      name: mealRow.name as string,
      duplicatedFromMealId: (mealRow.duplicated_from_meal_id as string) ?? null,
      archivedAt: (mealRow.archived_at as string) ?? null,
      createdAt: mealRow.created_at as string,
      updatedAt: mealRow.updated_at as string,
      components: componentRows
        .map(rowToComponentRecord)
        .sort((a, b) => a.position - b.position),
    };
  }
}
