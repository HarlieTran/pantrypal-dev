import { normalizePathname, type JsonResponse } from "../../../common/routing/helpers.js";
import { handleUsersRoute } from "../../users/routes/users.router.js";
import { handleOnboardingRoute } from "../../onboarding/routes/onboarding.router.js";
import { handlePantryRoute } from "../../pantry/routes/pantry.router.js";
import { handleRecipesRoute } from "../../recipes/routes/recipes.router.js";

export async function dispatchApiRoute(
  method: string,
  path: string,
  authHeader?: string,
  rawBody?: string,
): Promise<JsonResponse> {
  try {
    const pathname = normalizePathname(path);

    if (method === "GET" && pathname === "/health") {
      return { statusCode: 200, body: { ok: true } };
    }

    if (pathname.startsWith("/recipes")) {
      const res = await handleRecipesRoute(method, pathname, authHeader, rawBody);
      if (res) return res;
    }

    if (["/me/bootstrap", "/me/profile"].includes(pathname)) {
      const res = await handleUsersRoute(method, pathname, authHeader, rawBody);
      if (res) return res;
    }

    if (pathname.startsWith("/onboarding") || pathname === "/me/answers" || pathname.startsWith("/me/onboarding")) {
      const res = await handleOnboardingRoute(method, path, authHeader, rawBody);
      if (res) return res;
    }

    if (pathname.startsWith("/me/pantry") || pathname === "/pantry/items/bulk") {
      const res = await handlePantryRoute(method, pathname, authHeader, rawBody);
      if (res) return res;
    }

    return { statusCode: 404, body: { error: "Not found" } };
  } catch (error) {
    console.error("dispatch error:", error);
    return { statusCode: 500, body: { error: "Server error" } };
  }
}
