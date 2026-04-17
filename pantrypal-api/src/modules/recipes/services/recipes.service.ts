import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "../../../common/db/prisma.js";
import { s3 } from "../../../common/storage/s3.js";
import { getPantryItems } from "../../pantry/index.js";
import { getSavedRecipeIds } from "./recipe-save.service.js";
import { findRecipesByIngredients, getRecipeInformation } from "./spoonacular.service.js";

const RECIPE_CACHE_BUCKET = process.env.S3_BUCKET_RECIPE_CACHE || "";

async function resolveImage(s3Key: string | null, fallback: string | null): Promise<string> {
  if (s3Key && RECIPE_CACHE_BUCKET) {
    try {
      return await getSignedUrl(s3, new GetObjectCommand({ Bucket: RECIPE_CACHE_BUCKET, Key: s3Key }), { expiresIn: 3600 });
    } catch { /* fall through */ }
  }
  return fallback ?? "";
}

export async function getRecipeSuggestionsForUser(sub: string, limit = 12) {
  const pantryItems = await getPantryItems(sub);

  const ingredientNames = [
    ...new Set(pantryItems.map((i) => (i.canonicalName || i.rawName).trim().toLowerCase()).filter(Boolean)),
  ];

  const pantrySignature = [...ingredientNames].sort().join("|");
  if (ingredientNames.length === 0) return { pantrySignature, recipes: [] };

  const expiringSoonSet = new Set(
    pantryItems
      .filter((i) => i.expiryStatus === "expiring_soon" || i.expiryStatus === "expired")
      .map((i) => (i.canonicalName || i.rawName).toLowerCase()),
  );

  const [savedIds, spoonRecipes] = await Promise.all([
    getSavedRecipeIds(sub),
    findRecipesByIngredients(ingredientNames, limit),
  ]);

  const recipes = spoonRecipes
    .map((r) => {
      const usedNames = (r.usedIngredients ?? []).map((i) => i.name).filter(Boolean);
      const missedNames = (r.missedIngredients ?? []).map((i) => i.name).filter(Boolean);
      const expiringSoonUsedCount = usedNames.filter((n) => expiringSoonSet.has(n.toLowerCase())).length;
      const score = expiringSoonUsedCount * 5 + r.usedIngredientCount * 2 - r.missedIngredientCount * 1.5;
      return {
        id: r.id,
        title: r.title,
        image: r.image,
        usedIngredientCount: r.usedIngredientCount,
        missedIngredientCount: r.missedIngredientCount,
        usedIngredients: usedNames,
        missedIngredients: missedNames,
        expiringSoonUsedCount,
        score,
        isSaved: savedIds.has(r.id),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { pantrySignature, recipes };
}

export async function getRecipeDetails(recipeId: number) {
  const cached = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: { ingredients: true },
  });

  if (cached) {
    const steps = (cached.instructions as string[]) ?? [];
    const ingredients = cached.ingredients.map((i) => i.rawName).filter(Boolean);
    const image = await resolveImage(cached.image, cached.imageSourceUrl);
    return {
      id: cached.id, title: cached.title, image,
      summary: cached.summary ?? "", readyInMinutes: cached.readyMinutes ?? 0,
      servings: cached.servings ?? 0, sourceUrl: cached.sourceUrl ?? "",
      ingredients, steps, source: "database",
    };
  }

  const d = await getRecipeInformation(recipeId);

  await prisma.recipe.upsert({
    where: { id: d.id },
    update: {},
    create: {
      id: d.id, title: d.title, imageSourceUrl: d.image ?? null,
      cuisine: d.cuisines ?? [], dietTags: d.diets ?? [],
      readyMinutes: d.readyInMinutes ?? null, servings: d.servings ?? null,
      sourceUrl: d.sourceUrl ?? null, summary: d.summary ?? null,
      instructions: (d.analyzedInstructions?.[0]?.steps
        ?.map((s) => s.step?.trim())
        .filter((s): s is string => Boolean(s)) ?? []) as string[],
      rawData: d as object,
    },
  });

  const steps = d.analyzedInstructions?.[0]?.steps
    ?.map((s) => s.step?.trim())
    .filter((s): s is string => Boolean(s)) ?? [];
  const ingredients = d.extendedIngredients
    ?.map((i) => i.original?.trim() || i.name?.trim())
    .filter((s): s is string => Boolean(s)) ?? [];

  return {
    id: d.id, title: d.title, image: d.image ?? "",
    summary: d.summary ?? "", readyInMinutes: d.readyInMinutes ?? 0,
    servings: d.servings ?? 0, sourceUrl: d.sourceUrl ?? "",
    ingredients, steps, source: "spoonacular",
  };
}
