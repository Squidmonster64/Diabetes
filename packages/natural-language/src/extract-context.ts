/**
 * Named glucose/meal window as stated in the utterance.
 * Never infers a meal type from the clock; "current" means none was named.
 */
export function extractStatedContext(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\bbreaky\b/.test(lower) || /\bbreakfast\b/.test(lower)) return "breakfast";
  if (/\blunch\b/.test(lower)) return "lunch";
  if (/\bdinner\b/.test(lower) || /\btea\b/.test(lower) && /\b(before|after|at|for)\s+tea\b/.test(lower)) return "dinner";
  if (/\bbedtime\b/.test(lower) || /\bat bed\b/.test(lower)) return "bedtime";
  if (/\bsnack\b/.test(lower)) return "snack";
  return null;
}
