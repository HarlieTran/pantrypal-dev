import { z } from "zod";
import { withAuth } from "../../auth/index.js";
import {
  addPantryItem,
  addPantryItemsBulk,
  deletePantryItem,
  getPantryImageUploadUrl,
  getPantryItems,
  parseImageForIngredients,
  updatePantryItem,
} from "../index.js";
import { created, forbidden, handleError, ok, parseBody, type JsonResponse } from "../../../common/routing/helpers.js";

const addItemSchema = z.object({
  rawName: z.string().min(1).max(200),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(50),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
});

const updateItemSchema = z.object({
  quantity: z.number().positive().optional(),
  unit: z.string().min(1).max(50).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
});

const bulkAddSchema = z.object({
  items: z.array(addItemSchema).min(1).max(50),
});

const uploadUrlSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

const parseImageSchema = z.object({
  imageKey: z.string().min(1),
});

export async function handlePantryRoute(
  method: string,
  path: string,
  authHeader?: string,
  rawBody?: string,
): Promise<JsonResponse | null> {
  if (!path.startsWith("/me/pantry") && path !== "/pantry/items/bulk") return null;

  if (method === "GET" && path === "/me/pantry") {
    return withAuth(authHeader, async (claims) => {
      const items = await getPantryItems(claims.sub);
      return ok({ items });
    });
  }

  if (method === "POST" && path === "/me/pantry") {
    return withAuth(authHeader, async (claims) => {
      try {
        const data = parseBody(rawBody, addItemSchema);
        const item = await addPantryItem(claims.sub, data);
        return created({ item });
      } catch (err) {
        return handleError(err, "Failed to add pantry item");
      }
    });
  }

  if (method === "PATCH" && path.match(/^\/me\/pantry\/[^/]+$/)) {
    return withAuth(authHeader, async (claims) => {
      try {
        const id = path.split("/")[3];
        const data = parseBody(rawBody, updateItemSchema);
        const item = await updatePantryItem(claims.sub, id, data);
        return ok({ item });
      } catch (err) {
        return handleError(err, "Failed to update pantry item");
      }
    });
  }

  if (method === "DELETE" && path.match(/^\/me\/pantry\/[^/]+$/)) {
    return withAuth(authHeader, async (claims) => {
      try {
        const id = path.split("/")[3];
        await deletePantryItem(claims.sub, id);
        return ok({ deleted: true });
      } catch (err) {
        return handleError(err, "Failed to delete pantry item");
      }
    });
  }

  if (method === "POST" && path === "/me/pantry/upload-url") {
    return withAuth(authHeader, async (claims) => {
      try {
        const data = parseBody(rawBody, uploadUrlSchema);
        const result = await getPantryImageUploadUrl(claims.sub, data.filename, data.contentType);
        return ok(result);
      } catch (err) {
        return handleError(err, "Failed to create upload URL");
      }
    });
  }

  if (method === "POST" && path === "/me/pantry/parse-image") {
    return withAuth(authHeader, async (claims) => {
      try {
        const data = parseBody(rawBody, parseImageSchema);
        if (!data.imageKey.startsWith(`pantry-uploads/${claims.sub}/`)) {
          return forbidden("Access denied");
        }
        const ingredients = await parseImageForIngredients(data.imageKey);
        return ok({ ingredients });
      } catch (err) {
        return handleError(err, "Failed to parse image");
      }
    });
  }

  if (method === "POST" && (path === "/me/pantry/items/bulk" || path === "/pantry/items/bulk")) {
    return withAuth(authHeader, async (claims) => {
      try {
        const data = parseBody(rawBody, bulkAddSchema);
        const items = await addPantryItemsBulk(claims.sub, data.items);
        return created({ items });
      } catch (err) {
        return handleError(err, "Failed to bulk add pantry items");
      }
    });
  }

  return null;
}
