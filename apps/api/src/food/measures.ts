import type Database from "better-sqlite3";
import type { FoodMeasure, SourceDataset } from "@diabetes-companion/food-contracts";

interface MeasureRow {
  measure_id: string;
  measure_description: string;
  quantity: number;
  gram_amount: number | null;
  volume_ml: number | null;
}

/**
 * Household measures are only present for AUSNUT_2023 items in this database
 * (see docs/data-source/application_views_report.md). AFCD items return an
 * empty list; callers should offer gram (or millilitre) entry instead.
 */
export function getMeasures(
  db: InstanceType<typeof Database>,
  sourceDataset: SourceDataset,
  sourceFoodId: string,
): readonly FoodMeasure[] {
  if (sourceDataset !== "AUSNUT_2023") return [];

  const rows = db
    .prepare(
      `SELECT measure_id, measure_description, quantity, gram_amount, volume_ml
       FROM app_ausnut_measures
       WHERE source_food_id = @sourceFoodId
       ORDER BY measure_description`,
    )
    .all({ sourceFoodId }) as MeasureRow[];

  return rows.map((row) => ({
    measureId: row.measure_id,
    measureDescription: row.measure_description,
    quantity: row.quantity,
    gramAmount: row.gram_amount,
    volumeMillilitres: row.volume_ml,
  }));
}
