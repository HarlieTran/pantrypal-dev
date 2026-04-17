import { prisma } from "../../../common/db/prisma.js";
import { getUserProfileIdBySubject } from "../../users/index.js";

export async function toggleSaveRecipe(sub: string, recipeId: number): Promise<{ saved: boolean }> {
  const profileId = await getUserProfileIdBySubject(sub);
  if (!profileId) throw new Error("User not found");

  const existing = await prisma.savedRecipe.findUnique({
    where: { userId_recipeId: { userId: profileId, recipeId } },
  });

  if (existing) {
    await prisma.savedRecipe.delete({ where: { userId_recipeId: { userId: profileId, recipeId } } });
    return { saved: false };
  }

  await prisma.savedRecipe.create({ data: { userId: profileId, recipeId } });
  return { saved: true };
}

export async function getSavedRecipeIds(sub: string): Promise<Set<number>> {
  const profileId = await getUserProfileIdBySubject(sub);
  if (!profileId) return new Set();
  const saved = await prisma.savedRecipe.findMany({ where: { userId: profileId }, select: { recipeId: true } });
  return new Set(saved.map((s) => s.recipeId));
}
