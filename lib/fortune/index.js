// /lib/fortune/index.js
import { getApiKeyOrThrow } from "./guards.js";
import { ensureDerivedWithElements } from "./schema.js";
import { buildPrompt } from "./buildPrompt.js";
import { getSystemPrompt } from "./prompts/system.js";
import { callChatCompletions } from "./openaiClient.js";
import { normalizeModelOutput } from "./format.js";

export async function generateFortune({ mode, intake, req }) {
  // 1) API key
  const apiKey = getApiKeyOrThrow();

  // 2) intake normalize + derived
  const normalized = ensureDerivedWithElements(intake);

  // 3) prompts
  const system = getSystemPrompt();
  const prompt = buildPrompt(mode, normalized);

  // 4) OpenAI call
  const MODEL = "gpt-4.1-mini";
  const MAX_TOKENS = mode === "free_report" ? 2600 : 1600; // 2000字運用に備えて少し増やす
  const TEMPERATURE = 0.7;
  const TIMEOUT_MS = 120_000;

  const content = await callChatCompletions({
    apiKey,
    model: MODEL,
    system,
    prompt,
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    timeoutMs: TIMEOUT_MS,
    // 任意：ログに使えるように
    requestId: req?.headers?.["x-vercel-id"] || req?.headers?.["x-request-id"] || "",
  });

  // 5) output shape
  return normalizeModelOutput(mode, content);
}
