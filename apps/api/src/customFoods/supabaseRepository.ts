import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomFoodRecord } from "@diabetes-companion/food-contracts";
import type { CustomFoodsRepository } from "./repository.js";
import type { NormalizedCustomFoodInput } from "./validation.js";

function rowToCustomFoodRecord(row: Record<string, unknown>): CustomFoodRecord {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    foodType: row.food_type as CustomFoodRecord["foodType"],
    name: row.name as string,
    brand: (row.brand as string) ?? null,
    servingDescription: (row.serving_description as string) ?? null,
    servingGrams: (row.serving_grams as string) ?? null,
    carbohydratePerServingGrams: (row.carbohydrate_per_serving_grams as string) ?? null,
    carbohydratePer100gGrams: (row.carbohydrate_per_100g_grams as string) ?? null,
    sourceName: (row.source_name as string) ?? null,
    sourceReference: (row.source_reference as string) ?? null,
    sourceRetrievedAt: (row.source_retrieved_at as string) ?? null,
    archivedAt: (row.archived_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class SupabaseCustomFoodsRepository implements CustomFoodsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(patientId: string, input: NormalizedCustomFoodInput): Promise<CustomFoodRecord> {
    const { data, error } = await this.client
      .from("custom_foods")
      .insert({
        patient_id: patientId,
        food_type: input.foodType,
        name: input.name,
        brand: input.brand,
        serving_description: input.servingDescription,
        serving_grams: input.servingGrams,
        carbohydrate_per_serving_grams: input.carbohydratePerServingGrams,
        carbohydrate_per_100g_grams: input.carbohydratePer100gGrams,
        source_name: input.sourceName,
        source_reference: input.sourceReference,
        source_retrieved_at: input.sourceRetrievedAt,
      })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to create custom food: ${error.message}`);
    return rowToCustomFoodRecord(data);
  }

  async list(patientId: string, includeArchived: boolean): Promise<readonly CustomFoodRecord[]> {
    let query = this.client.from("custom_foods").select("*").eq("patient_id", patientId);
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query.order("name", { ascending: true });
    if (error) throw new Error(`Failed to list custom foods: ${error.message}`);
    return (data ?? []).map(rowToCustomFoodRecord);
  }

  async getById(id: string): Promise<CustomFoodRecord | undefined> {
    const { data, error } = await this.client.from("custom_foods").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`Failed to load custom food: ${error.message}`);
    return data ? rowToCustomFoodRecord(data) : undefined;
  }

  async update(id: string, patch: Partial<NormalizedCustomFoodInput>): Promise<CustomFoodRecord> {
    const updatePayload: Record<string, unknown> = {};
    if (patch.name !== undefined) updatePayload.name = patch.name;
    if (patch.brand !== undefined) updatePayload.brand = patch.brand;
    if (patch.servingDescription !== undefined) updatePayload.serving_description = patch.servingDescription;
    if (patch.servingGrams !== undefined) updatePayload.serving_grams = patch.servingGrams;
    if (patch.carbohydratePerServingGrams !== undefined) {
      updatePayload.carbohydrate_per_serving_grams = patch.carbohydratePerServingGrams;
    }
    if (patch.carbohydratePer100gGrams !== undefined) {
      updatePayload.carbohydrate_per_100g_grams = patch.carbohydratePer100gGrams;
    }
    if (patch.sourceName !== undefined) updatePayload.source_name = patch.sourceName;
    if (patch.sourceReference !== undefined) updatePayload.source_reference = patch.sourceReference;
    if (patch.sourceRetrievedAt !== undefined) updatePayload.source_retrieved_at = patch.sourceRetrievedAt;
    const { data, error } = await this.client
      .from("custom_foods")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to update custom food: ${error.message}`);
    return rowToCustomFoodRecord(data);
  }

  async setArchived(id: string, archived: boolean): Promise<CustomFoodRecord> {
    const { data, error } = await this.client
      .from("custom_foods")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to update custom food archive state: ${error.message}`);
    return rowToCustomFoodRecord(data);
  }
}
