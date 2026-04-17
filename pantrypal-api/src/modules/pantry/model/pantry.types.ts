export type ExpiryStatus = "fresh" | "expiring_soon" | "expired" | "no_date";

export interface PantryItem {
  id: string;
  userProfileId: string;
  rawName: string;
  canonicalName: string;
  ingredientId?: string | null;
  category: string;
  quantity: number;
  unit: string;
  notes?: string | null;
  expiryDate?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PantryItemWithStatus extends PantryItem {
  expiryStatus: ExpiryStatus;
  daysUntilExpiry?: number;
}

export interface ParsedIngredient {
  rawName: string;
  quantity: number;
  unit: string;
  category: string;
}

export interface MatchedIngredient extends ParsedIngredient {
  ingredientId?: string;
  canonicalName: string;
  matchConfidence: "exact" | "alias" | "ai" | "unmatched";
}
