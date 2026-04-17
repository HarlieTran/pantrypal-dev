import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "../../../common/db/prisma.js";
import { s3 } from "../../../common/storage/s3.js";
import { getPantryItems } from "../../pantry/index.js";
import { getUserProfileIdBySubject } from "../../users/index.js";

const RECIPE_CACHE_BUCKET = process.env.S3_BUCKET_RECIPE_CACHE || "";

async function resolveImage(s3Key: string | null, fallback: string | null): Promise<string | null> {
  if (s3Key && RECIPE_CACHE_BUCKET) {
    try {
      return await getSignedUrl(s3, new GetObjectCommand({ Bucket: RECIPE_CACHE_BUCKET, Key: s3Key }), { expiresIn: 3600 });
    } catch { /* fall through */ }
  }
  return fallback ?? null;
}

export async function searchRecipes(query: string, sub: string) {
  const profileId = await getUserProfileIdBySubject(sub);

  const savedIds = profileId
    ? await prisma.savedRecipe.findMany({ where: { userId: profileId }, select: { recipeId: true } })
        .then((rows) => new Set(rows.map((r) => r.recipeId)))
    : new Set<number>();

  const recipes = await prisma.recipe.findMany({
    where: { title: { contains: query.trim(), mode: "insensitive" } },
    select: { id: true, title: true, image: true, imageSourceUrl: true, cuisine: true, dietTags: true,
      readyMinutes: true, servings: true, ingredients: { select: { canonicalName: true } } },
    take: 10,
    orderBy: { title: "asc" },
  });

  const pantryItems = profileId ? await getPantryItems(sub) : [];
  const pantrySet = new Set(pantryItems.map((i) => i.canonicalName.trim().toLowerCase()));

  const results = await Promise.all(recipes.map(async (r) => {
    const total = r.ingredients.length;
    const matched = r.ingredients.filter((i) => pantrySet.has(i.canonicalName.trim().toLowerCase())).length;
    return {
      id: r.id,
      title: r.title,
      image: await resolveImage(r.image, r.imageSourceUrl),
      cuisine: r.cuisine,
      dietTags: r.dietTags,
      readyMinutes: r.readyMinutes,
      servings: r.servings,
      isSaved: savedIds.has(r.id),
      matchedIngredientCount: matched,
      totalIngredientCount: total,
      isPantryReady: total > 0 ? matched / total >= 0.8 : false,
    };
  }));

  return results.sort((a, b) => {
    if (a.isSaved !== b.isSaved) return a.isSaved ? -1 : 1;
    if (a.isPantryReady !== b.isPantryReady) return a.isPantryReady ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}
