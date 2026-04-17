import { z } from "zod";
import { withAuth } from "../../auth/index.js";
import { upsertUserProfileFromClaims, getUserProfile, updateUserProfile } from "../index.js";
import { handleError, ok, parseBody, type JsonResponse } from "../../../common/routing/helpers.js";

const updateProfileSchema = z.object({
  displayName: z.string().max(120).optional(),
  likes: z.string().max(500).optional(),
  dietType: z.array(z.string().min(1)).optional(),
  allergies: z.array(z.string().min(1)).optional(),
  disliked: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
});

export async function handleUsersRoute(
  method: string,
  path: string,
  authHeader?: string,
  rawBody?: string,
): Promise<JsonResponse | null> {
  if (method === "POST" && path === "/me/bootstrap") {
    return withAuth(authHeader, async (claims) => {
      const profile = await upsertUserProfileFromClaims(claims);
      return ok({ profile });
    });
  }

  if (method === "GET" && path === "/me/profile") {
    return withAuth(authHeader, async (claims) => {
      try {
        const profile = await getUserProfile(claims.sub);
        return ok({ profile });
      } catch (err) {
        return handleError(err, "Failed to load profile");
      }
    });
  }

  if (method === "PATCH" && path === "/me/profile") {
    return withAuth(authHeader, async (claims) => {
      try {
        const data = parseBody(rawBody, updateProfileSchema);
        const profile = await updateUserProfile(claims.sub, data);
        return ok({ profile });
      } catch (err) {
        return handleError(err, "Failed to update profile");
      }
    });
  }

  return null;
}
