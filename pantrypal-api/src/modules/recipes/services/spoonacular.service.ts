const SPOON_BASE = "https://api.spoonacular.com";

const SPOON_KEYS = (process.env.SPOONACULAR_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

if (SPOON_KEYS.length === 0) console.warn("SPOONACULAR_API_KEY is missing");

export type SpoonIngredient = {
  id: number;
  name: string;
  amount?: number;
  unit?: string;
};

export type SpoonFindByIngredientsRecipe = {
  id: number;
  title: string;
  image: string;
  usedIngredientCount: number;
  missedIngredientCount: number;
  usedIngredients: SpoonIngredient[];
  missedIngredients: SpoonIngredient[];
};

export type SpoonRecipeDetails = {
  id: number;
  title: string;
  image?: string;
  summary?: string;
  readyInMinutes?: number;
  servings?: number;
  sourceUrl?: string;
  cuisines?: string[];
  diets?: string[];
  extendedIngredients?: Array<{ name?: string; original?: string; amount?: number; unit?: string }>;
  analyzedInstructions?: Array<{ steps?: Array<{ step?: string }> }>;
};

async function fetchWithKeyFailover(buildUrl: (key: string) => string): Promise<Response> {
  if (SPOON_KEYS.length === 0) throw new Error("SPOONACULAR_API_KEY is not configured");
  let lastError = "";
  for (const key of SPOON_KEYS) {
    const res = await fetch(buildUrl(key));
    if (res.ok) return res;
    const txt = await res.text();
    lastError = `(${res.status}) ${txt}`;
    if (res.status !== 402 && res.status !== 429) throw new Error(`Spoonacular request failed ${lastError}`);
  }
  throw new Error(`All Spoonacular keys failed ${lastError}`);
}

export async function findRecipesByIngredients(
  ingredientNames: string[],
  number = 12,
): Promise<SpoonFindByIngredientsRecipe[]> {
  const unique = [...new Set(ingredientNames.map((x) => x.trim().toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return [];
  const csv = encodeURIComponent(unique.join(","));
  const res = await fetchWithKeyFailover(
    (key) => `${SPOON_BASE}/recipes/findByIngredients?ingredients=${csv}&number=${number}&ranking=1&ignorePantry=true&apiKey=${key}`,
  );
  return (await res.json()) as SpoonFindByIngredientsRecipe[];
}

export async function getRecipeInformation(recipeId: number): Promise<SpoonRecipeDetails> {
  const res = await fetchWithKeyFailover(
    (key) => `${SPOON_BASE}/recipes/${recipeId}/information?includeNutrition=false&apiKey=${key}`,
  );
  return (await res.json()) as SpoonRecipeDetails;
}
