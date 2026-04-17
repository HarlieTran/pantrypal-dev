import { z } from "zod";
import { withAuth } from "../../auth/index.js";
import { getRecipeSuggestionsForUser, getRecipeDetails, generateAndSaveRecipe, toggleSaveRecipe, searchRecipes } from "../index.js";
import { handleError, ok, parseBody, type JsonResponse } from "../../../common/routing/helpers.js";

const suggestionsSchema = z.object({ limit: z.number().int().min(1).max(30).optional() });

const fromNameSchema = z.object({
  name: z.string().min(1).max(200),
  targetServings: z.number().int().min(1).max(20).optional(),
});

export async function handleRecipesRoute(
  method: string,
  path: string,
  authHeader?: string,
  rawBody?: string,
): Promise<JsonResponse | null> {
  if (!path.startsWith("/recipes")) return null;

  if (method === "POST" && path === "/recipes/suggestions") {
    return withAuth(authHeader, async (claims) => {
      try {
        const data = parseBody(rawBody, suggestionsSchema);
        const result = await getRecipeSuggestionsForUser(claims.sub, data.limit ?? 12);
        return ok(result as unknown as Record<string, unknown>);
      } catch (err) {
        return handleError(err, "Failed to get recipe suggestions");
      }
    });
  }

  if (method === "GET" && path.startsWith("/recipes/search")) {
    return withAuth(authHeader, async (claims) => {
      try {
        const url = new URL(`http://local${path}`);
        const query = url.searchParams.get("q") ?? "";
        if (!query.trim()) return ok({ recipes: [] });
        const recipes = await searchRecipes(query, claims.sub);
        return ok({ recipes });
      } catch (err) {
        return handleError(err, "Failed to search recipes");
      }
    });
  }

  if (method === "GET" && path.match(/^\/recipes\/\d+$/)) {
    return withAuth(authHeader, async () => {
      try {
        const id = Number(path.split("/")[2]);
        const recipe = await getRecipeDetails(id);
        return ok({ recipe });
      } catch (err) {
        return handleError(err, "Failed to get recipe details");
      }
    });
  }

  if (method === "POST" && path === "/recipes/from-name") {
    return withAuth(authHeader, async () => {
      try {
        const data = parseBody(rawBody, fromNameSchema);
        const recipe = await generateAndSaveRecipe(data.name, data.targetServings ?? 4);
        return ok({ recipe });
      } catch (err) {
        return handleError(err, "Failed to generate recipe");
      }
    });
  }

  if (method === "POST" && path.match(/^\/recipes\/\d+\/save$/)) {
    return withAuth(authHeader, async (claims) => {
      try {
        const recipeId = Number(path.split("/")[2]);
        const result = await toggleSaveRecipe(claims.sub, recipeId);
        return ok(result);
      } catch (err) {
        return handleError(err, "Failed to toggle save");
      }
    });
  }

  return null;
}
