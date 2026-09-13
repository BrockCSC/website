import { ACCESS_CARD_ID_PATTERN } from "./validation";

/**
 * "" clears the field. Patches merge into the stored jsonb, so clearing has
 * to write "" rather than omit the key, or the old value would stick.
 */
export const cleanAccessCardId = (
  value: unknown,
): { error: string } | { value: string } => {
  if (value !== undefined && typeof value !== "string") {
    return { error: "Expected text." };
  }
  const trimmed = (value ?? "").trim();
  if (trimmed && !ACCESS_CARD_ID_PATTERN.test(trimmed)) {
    return { error: "Access card ID must be exactly 5 digits." };
  }
  return { value: trimmed };
};
