// /lib/fortune/index.js
import { getApiKeyOrThrow } from "./guards.js";
import { ensureDerivedWithElements } from "./schema.js";
import { buildPrompt } from "./buildPrompt.js";
import { getSystemPrompt } from "./prompts/system.js";
import { callChatCompletions } from "./openaiClient.js";
import { normalizeModelOutput } from "./format.js";
import { deriveElementsFromBirthday } from "./deriveElements.js";

function safeDeriveElements(birthday) {
  try {
    // deriveElementsFromBirthday が null/undefined を受けて落ちる可能性に備える
    if (!birthday) return { primary: "不明", secondary: "不明" };
    const out = deriveElementsFromBirthday(birthday);
    return out || { primary: "不明", secondary: "不明" };
  } catch {
    return { primary: "不明", secondary: "不明" };
  }
}

// 五行（user_elements / partner_elements）を「固定」ではなく intake の入力から都度作る
function ensureDerived(intake) {
  const derived = intake.derived || {};

  // user
  if (!derived.user_elements) {
    derived.user_elements = safeDeriveElements(intake?.user?.birthday);
  }

  // partner（不明なら不明でOK）
  if (!derived.partner_elements) {
    derived.partner_elements = safeDeriveElements(intake?.partner?.birthday);
  }

  intake.derived = derived;
  return intake;
}

export async function generateFortune({ mode, intake, req }) {
  // 1) API key
  const apiKey = getApiKeyOrThrow();

  // 2) derived を先に埋める（五行固定化の根本対策）
  const withDerived = ensureDerived(intake);

  // 3) schema normalize（ここで必要ならさらに整形）
  const normalized = ensureDerivedWithElements(withDerived);

  // 4) prompts
  const system = getSystemPrompt();
  const prompt = buildPrompt(mode, normalized);

  // 5) OpenAI call
  const MODEL = "gpt-4.1-mini";

  const MAX_TOKENS_BY_MODE = {
    mini_user: 900,
    mini_partner: 900,
    free_report: 2600,
    paid_480: 3800,
    paid_980: 7000,
    paid_1980: 10000,
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
    requestId:
      req?.headers?.["x-vercel-id"] ||
      req?.headers?.["x-request-id"] ||
      "",
  });

  // 6) output shape
  return normalizeModelOutput(mode, content);
}
