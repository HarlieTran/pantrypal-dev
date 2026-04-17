import { prisma } from "../../../common/db/prisma.js";
import { bedrockClient, BEDROCK_MODEL, stripCodeFence } from "../../../common/ai/bedrock.js";
import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { ParsedIngredient, MatchedIngredient } from "../../pantry/model/pantry.types.js";

const CATEGORIES = [
  "produce","dairy","meat","seafood","grains",
  "spices","condiments","frozen","beverages","snacks","other",
] as const;

const CATEGORY_PROMPT_LIST = CATEGORIES.join("|");

function normalize(name: string) {
  return name.trim().toLowerCase();
}

async function matchExact(rawName: string) {
  return prisma.ingredient.findFirst({
    where: { canonicalName: { equals: rawName.trim(), mode: "insensitive" }, isActive: true },
  });
}

async function matchAlias(rawName: string) {
  const normalized = normalize(rawName);
  const all = await prisma.ingredient.findMany({
    where: { isActive: true },
    select: { id: true, canonicalName: true, aliases: true, category: true },
  });
  for (const ingredient of all) {
    const aliases = ingredient.aliases as string[];
    if (aliases.map(normalize).includes(normalized)) return ingredient;
  }
  return null;
}

async function matchViaAI(rawName: string) {
  const prompt = [
    "You are a food ingredient normalization assistant.",
    `Given this ingredient name: "${rawName}"`,
    "Return ONLY valid JSON with this exact schema:",
    `{"canonicalName":"string","category":"${CATEGORY_PROMPT_LIST}"}`,
    "Rules:",
    "- canonicalName must be a simple, common English ingredient name.",
    "- Choose the most appropriate category.",
    "- If this is not a food ingredient, return null.",
  ].join("\n");

  try {
    const res = await bedrockClient.send(new ConverseCommand({
      modelId: BEDROCK_MODEL,
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: { temperature: 0.1, maxTokens: 200 },
    }));
    const rawText = res.output?.message?.content?.find((x) => "text" in x)?.text ?? "";
    if (!rawText) return null;
    const parsed = JSON.parse(stripCodeFence(rawText));
    if (!parsed?.canonicalName) return null;
    return parsed as { canonicalName: string; category: string };
  } catch {
    return null;
  }
}

async function saveAlias(ingredientId: string, newAlias: string) {
  const ingredient = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
  if (!ingredient) return;
  const aliases = ingredient.aliases as string[];
  if (!aliases.map(normalize).includes(normalize(newAlias))) {
    await prisma.ingredient.update({
      where: { id: ingredientId },
      data: { aliases: [...aliases, newAlias.trim()] },
    });
  }
}

export async function matchIngredient(raw: ParsedIngredient): Promise<MatchedIngredient> {
  const exact = await matchExact(raw.rawName);
  if (exact) {
    return { ...raw, ingredientId: exact.id, canonicalName: exact.canonicalName,
      category: (exact.category ?? raw.category) as MatchedIngredient["category"], matchConfidence: "exact" };
  }

  const alias = await matchAlias(raw.rawName);
  if (alias) {
    await saveAlias(alias.id, raw.rawName);
    return { ...raw, ingredientId: alias.id, canonicalName: alias.canonicalName,
      category: (alias.category ?? raw.category) as MatchedIngredient["category"], matchConfidence: "alias" };
  }

  const ai = await matchViaAI(raw.rawName);
  if (ai) {
    let ingredient = await prisma.ingredient.findFirst({
      where: { canonicalName: { equals: ai.canonicalName, mode: "insensitive" } },
    });
    if (!ingredient) {
      ingredient = await prisma.ingredient.create({
        data: { canonicalName: ai.canonicalName, aliases: [raw.rawName], category: ai.category as never },
      });
    } else {
      await saveAlias(ingredient.id, raw.rawName);
    }
    return { ...raw, ingredientId: ingredient.id, canonicalName: ingredient.canonicalName,
      category: (ingredient.category ?? raw.category) as MatchedIngredient["category"], matchConfidence: "ai" };
  }

  return { ...raw, canonicalName: raw.rawName.trim(), matchConfidence: "unmatched" };
}
