import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

export const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-2",
});

export const BEDROCK_MODEL = process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";

export function stripCodeFence(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
