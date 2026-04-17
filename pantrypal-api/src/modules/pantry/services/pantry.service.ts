import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { prisma } from "../../../common/db/prisma.js";
import { s3 } from "../../../common/storage/s3.js";
import { bedrockClient, BEDROCK_MODEL, stripCodeFence } from "../../../common/ai/bedrock.js";
import { matchIngredient } from "../../ingredients/index.js";
import { randomUUID } from "node:crypto";
import type { PantryItemWithStatus, ParsedIngredient } from "../model/pantry.types.js";

const PANTRY_IMAGES_BUCKET = process.env.PANTRY_IMAGES_BUCKET || "pantrypal-pantry-images";
const CATEGORIES = ["produce","dairy","meat","seafood","grains","spices","condiments","frozen","beverages","snacks","other"];

function computeExpiryStatus(expiryDate?: string | null) {
  if (!expiryDate) return { status: "no_date" as const };
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate); expiry.setHours(0, 0, 0, 0);
  const diffDays = Math.round((expiry.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return { status: "expired" as const, daysUntilExpiry: diffDays };
  if (diffDays <= 3) return { status: "expiring_soon" as const, daysUntilExpiry: diffDays };
  return { status: "fresh" as const, daysUntilExpiry: diffDays };
}

function withStatus(item: PantryItemWithStatus): PantryItemWithStatus {
  const { status, daysUntilExpiry } = computeExpiryStatus(item.expiryDate);
  return { ...item, expiryStatus: status, daysUntilExpiry };
}

const EXPIRY_ORDER = { expired: 0, expiring_soon: 1, fresh: 2, no_date: 3 };

async function getUserProfileId(sub: string): Promise<string | null> {
  const user = await prisma.userProfile.findUnique({
    where: { authProvider_authSubject: { authProvider: "cognito", authSubject: sub } },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function getPantryItems(sub: string): Promise<PantryItemWithStatus[]> {
  const profileId = await getUserProfileId(sub);
  if (!profileId) return [];

  const items = await prisma.pantryItem.findMany({ where: { userProfileId: profileId } });

  return items
    .map((item) => withStatus(item as unknown as PantryItemWithStatus))
    .sort((a, b) => {
      const diff = EXPIRY_ORDER[a.expiryStatus] - EXPIRY_ORDER[b.expiryStatus];
      if (diff !== 0) return diff;
      if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate);
      return 0;
    });
}

export async function addPantryItem(
  sub: string,
  data: { rawName: string; quantity: number; unit: string; expiryDate?: string; notes?: string },
): Promise<PantryItemWithStatus> {
  const profileId = await getUserProfileId(sub);
  if (!profileId) throw new Error("User not found");

  const matched = await matchIngredient({
    rawName: data.rawName, quantity: data.quantity, unit: data.unit, category: "other",
  });

  const item = await prisma.pantryItem.create({
    data: {
      userProfileId: profileId,
      rawName: data.rawName,
      canonicalName: matched.canonicalName,
      ingredientId: matched.ingredientId ?? null,
      category: matched.category,
      quantity: data.quantity,
      unit: data.unit,
      expiryDate: data.expiryDate ?? null,
      notes: data.notes ?? null,
    },
  });

  return withStatus(item as unknown as PantryItemWithStatus);
}

export async function addPantryItemsBulk(
  sub: string,
  items: Array<{ rawName: string; quantity: number; unit: string; expiryDate?: string; notes?: string }>,
): Promise<PantryItemWithStatus[]> {
  return Promise.all(items.map((item) => addPantryItem(sub, item)));
}

export async function updatePantryItem(
  sub: string,
  itemId: string,
  updates: Partial<{ quantity: number; unit: string; expiryDate: string; notes: string }>,
): Promise<PantryItemWithStatus> {
  const profileId = await getUserProfileId(sub);
  if (!profileId) throw new Error("User not found");

  const existing = await prisma.pantryItem.findFirst({
    where: { id: itemId, userProfileId: profileId },
  });
  if (!existing) throw new Error("Not found");

  const item = await prisma.pantryItem.update({
    where: { id: itemId },
    data: updates,
  });

  return withStatus(item as unknown as PantryItemWithStatus);
}

export async function deletePantryItem(sub: string, itemId: string): Promise<void> {
  const profileId = await getUserProfileId(sub);
  if (!profileId) throw new Error("User not found");

  const existing = await prisma.pantryItem.findFirst({
    where: { id: itemId, userProfileId: profileId },
  });
  if (!existing) throw new Error("Not found");

  await prisma.pantryItem.delete({ where: { id: itemId } });
}

export async function getPantryImageUploadUrl(
  sub: string,
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; imageKey: string }> {
  const ext = filename.split(".").pop() ?? "jpg";
  const imageKey = `pantry-uploads/${sub}/${randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: PANTRY_IMAGES_BUCKET, Key: imageKey, ContentType: contentType }),
    { expiresIn: 300 },
  );
  return { uploadUrl, imageKey };
}

export async function parseImageForIngredients(imageKey: string): Promise<ParsedIngredient[]> {
  const s3Res = await s3.send(new GetObjectCommand({ Bucket: PANTRY_IMAGES_BUCKET, Key: imageKey }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of s3Res.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
  const imageBytes = Buffer.concat(chunks);
  const contentType = s3Res.ContentType ?? "image/jpeg";
  const imageFormat = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpeg";

  const prompt = [
    "# Grocery List Extraction Expert",
    "Analyze this image and extract a normalized grocery list as JSON.",
    "Return ONLY valid JSON, no markdown.",
    `Schema: {"items":[{"name":"string","quantity":1,"unit":"string","category":"${CATEGORIES.join("|")}"}]}`,
    "Rules:",
    "1) Include only food/grocery items.",
    "2) Clean and normalize item names.",
    "3) Extract accurate quantities as numbers. Use 1 if unclear.",
    "4) Use common units: pcs, g, kg, oz, lb, ml, L, cup, tbsp, tsp.",
    "5) Merge duplicate items by summing quantities.",
  ].join("\n");

  const res = await bedrockClient.send(new ConverseCommand({
    modelId: BEDROCK_MODEL,
    messages: [{
      role: "user",
      content: [
        { text: prompt },
        { image: { format: imageFormat as "jpeg" | "png" | "webp", source: { bytes: imageBytes } } },
      ],
    }],
    inferenceConfig: { temperature: 0.1, maxTokens: 1200 },
  }));

  const rawText = res.output?.message?.content?.find((x) => "text" in x)?.text ?? "";
  if (!rawText) return [];

  const parsed = JSON.parse(stripCodeFence(rawText)) as {
    items?: Array<{ name?: string; quantity?: unknown; unit?: string; category?: string }>;
  };

  return (parsed.items ?? [])
    .map((item) => ({
      rawName: typeof item.name === "string" ? item.name.trim() : "",
      quantity: typeof item.quantity === "number" ? item.quantity : 1,
      unit: typeof item.unit === "string" ? item.unit.trim() : "pcs",
      category: item.category ?? "other",
    }))
    .filter((item) => item.rawName.length > 0);
}
