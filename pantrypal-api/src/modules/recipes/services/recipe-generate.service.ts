import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { prisma } from "../../../common/db/prisma.js";
import { bedrockClient, BEDROCK_MODEL, stripCodeFence } from "../../../common/ai/bedrock.js";

const RECIPE_CACHE_BUCKET = process.env.S3_BUCKET_RECIPE_CACHE || "";
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || "";
const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-2" });

function generateAiRecipeId(): number {
  return 1_500_000_000 + Math.floor(Math.random() * 600_000_000);
}

type GeneratedRecipe = {
  title: string;
  cuisine: string[];
  dietTags: string[];
  readyMinutes: number;
  servings: number;
  summary: string;
  instructions: string[];
  ingredients: Array<{ canonicalName: string; rawName: string; amount: number; unit: string }>;
};

async function generateWithBedrock(name: string, targetServings: number): Promise<GeneratedRecipe> {
  const prompt = `Generate a recipe for "${name}" for ${targetServings} servings.
Return ONLY valid JSON with no markdown, no code fences, no explanation.
Required schema:
{
  "title": "string",
  "cuisine": ["string"],
  "dietTags": ["string"],
  "readyMinutes": number,
  "servings": ${targetServings},
  "summary": "string",
  "instructions": ["string"],
  "ingredients": [{"canonicalName":"string","rawName":"string","amount":number,"unit":"string"}]
}
Rules:
- canonicalName must be lowercase simple English
- Scale all amounts for exactly ${targetServings} servings
- Return only the JSON object`;

  const res = await bedrockClient.send(new ConverseCommand({
    modelId: BEDROCK_MODEL,
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inferenceConfig: { temperature: 0.3, maxTokens: 1500 },
  }));

  const text = (res.output?.message?.content ?? [])
    .map((b) => ("text" in b ? b.text : "")).join("").trim();
  if (!text) throw new Error("Bedrock returned empty response");

  const parsed = JSON.parse(stripCodeFence(text)) as GeneratedRecipe;
  if (!parsed.title) throw new Error("Bedrock response missing title");
  return parsed;
}

async function fetchUnsplashImage(title: string, cuisine: string[]): Promise<string | null> {
  if (!UNSPLASH_KEY) return null;
  const queries = [`${title} food dish`, cuisine[0] ? `${cuisine[0]} food` : null].filter(Boolean) as string[];
  for (const q of queries) {
    try {
      const res = await fetch(
        `https://api.unsplash.com/photos/random?query=${encodeURIComponent(q)}&orientation=landscape&content_filter=high`,
        { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } },
      );
      if (!res.ok) continue;
      const data = await res.json() as { urls?: { regular?: string } };
      if (data.urls?.regular) return data.urls.regular;
    } catch { continue; }
  }
  return null;
}

async function uploadToS3(imageUrl: string, recipeId: number): Promise<string | null> {
  if (!RECIPE_CACHE_BUCKET) return null;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const bytes = Buffer.from(await res.arrayBuffer());
    const key = `recipe-images/${recipeId}.jpg`;
    await s3.send(new PutObjectCommand({ Bucket: RECIPE_CACHE_BUCKET, Key: key, Body: bytes, ContentType: contentType }));
    return key;
  } catch { return null; }
}

export async function generateAndSaveRecipe(name: string, targetServings = 4) {
  const existing = await prisma.recipe.findFirst({
    where: { title: { equals: name.trim(), mode: "insensitive" } },
    select: { id: true, title: true, image: true, imageSourceUrl: true, cuisine: true, dietTags: true, readyMinutes: true, servings: true },
  });
  if (existing) return { ...existing, isNew: false };

  const generated = await generateWithBedrock(name, targetServings);
  const unsplashUrl = await fetchUnsplashImage(generated.title, generated.cuisine);

  const saved = await prisma.recipe.create({
    data: {
      id: generateAiRecipeId(),
      title: generated.title,
      cuisine: generated.cuisine,
      dietTags: generated.dietTags,
      readyMinutes: generated.readyMinutes,
      servings: generated.servings,
      summary: generated.summary,
      instructions: generated.instructions,
      imageSourceUrl: unsplashUrl,
      image: null,
      rawData: generated as object,
    },
  });

  let imageS3Key: string | null = null;
  if (unsplashUrl) {
    imageS3Key = await uploadToS3(unsplashUrl, saved.id);
    if (imageS3Key) await prisma.recipe.update({ where: { id: saved.id }, data: { image: imageS3Key } });
  }

  if (generated.ingredients.length > 0) {
    await prisma.recipeIngredient.createMany({
      data: generated.ingredients.map((ing) => ({
        recipeId: saved.id,
        canonicalName: ing.canonicalName.trim().toLowerCase(),
        rawName: ing.rawName,
        amount: ing.amount,
        unit: ing.unit,
      })),
    });
  }

  let resolvedImage: string | null = unsplashUrl;
  if (imageS3Key && RECIPE_CACHE_BUCKET) {
    try {
      resolvedImage = await getSignedUrl(s3, new GetObjectCommand({ Bucket: RECIPE_CACHE_BUCKET, Key: imageS3Key }), { expiresIn: 3600 });
    } catch { resolvedImage = unsplashUrl; }
  }

  return { id: saved.id, title: saved.title, image: resolvedImage, imageSourceUrl: unsplashUrl,
    cuisine: saved.cuisine, dietTags: saved.dietTags, readyMinutes: saved.readyMinutes, servings: saved.servings, isNew: true };
}
