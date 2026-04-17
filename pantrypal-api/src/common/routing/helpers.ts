import { z } from "zod";

export type JsonResponse = { statusCode: number; body: Record<string, unknown> };

export function parseBody<T>(rawBody: string | undefined, schema: z.ZodSchema<T>): T {
  const parsed = rawBody ? JSON.parse(rawBody) : {};
  return schema.parse(parsed);
}

export function ok(body: Record<string, unknown>): JsonResponse {
  return { statusCode: 200, body };
}

export function created(body: Record<string, unknown>): JsonResponse {
  return { statusCode: 201, body };
}

export function badRequest(error: string): JsonResponse {
  return { statusCode: 400, body: { error } };
}

export function unauthorized(error = "Unauthorized"): JsonResponse {
  return { statusCode: 401, body: { error } };
}

export function forbidden(error = "Forbidden"): JsonResponse {
  return { statusCode: 403, body: { error } };
}

export function notFound(error = "Not found"): JsonResponse {
  return { statusCode: 404, body: { error } };
}

export function serverError(error = "Server error"): JsonResponse {
  return { statusCode: 500, body: { error } };
}

export function handleError(error: unknown, fallbackMessage = "Server error"): JsonResponse {
  if (error instanceof z.ZodError) {
    return badRequest("Invalid payload");
  }
  if (error instanceof Error) {
    if (error.message === "Forbidden") return forbidden();
    if (error.message.toLowerCase().includes("not found")) return notFound();
    if (error.message.toLowerCase().includes("unauthorized")) return unauthorized();
  }
  console.error(`${fallbackMessage}:`, error);
  return serverError(fallbackMessage);
}

export function normalizePathname(path: string): string {
  try {
    return new URL(path, "http://local").pathname;
  } catch {
    return path.split("?")[0];
  }
}
