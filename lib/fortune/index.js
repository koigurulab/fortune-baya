// /lib/fortune/index.js
import { getApiKeyOrThrow } from "./guards.js";
import { ensureDerivedWithElements } from "./schema.js";
import { buildPrompt } from "./buildPrompt.js";
import { getSystemPrompt } from "./prompts/system.js";
import { callChatCompletions } from "./openaiClient.js";
import { normalizeModelOutput } from "./format.js";
import { deriveElementsFromBirthday } from "./deriveElements.js";

// generateFortune 内の冒頭あたりで
function ensureDerived(intake) {
  const derived = intake.derived || {};

  if (!derived.user_elements) {
    derived.user_elements = deriveElementsFromBirthday(intake?.user?.birthday);
  }
  if (!derived.partner_elements) {
    derived.partner_elements = deriveElementsFromBirthday(intake?.partner?.birthday);
  }

  intake.derived = derived;
}

export async function generateFortune({ mode, intake, req }) {
  ensureDerived(intake);

  // 既存処理…
}
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

  const MAX_TOKENS_BY_MODE = {
    mini_user: 900,
    mini_partner: 900,
    free_report: 2600,
    paid_480: 3800,
    paid_980: 7000,
  };

  const MAX_TOKENS = MAX_TOKENS_BY_MODE[mode] ?? 1600;

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
