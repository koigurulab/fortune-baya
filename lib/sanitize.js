// /lib/sanitize.js
// 画面から送られてくる入力の長さに上限をかける。
// 中間鑑定の文章などは画面側から送り返されるため、巨大な文字列を送られると
// OpenAIの利用料がかさむ（恋愛仙人と同じキーを使っている）。

function clip(v, max) {
  if (v === null || v === undefined) return v;
  if (typeof v !== "string") return v;
  return v.length > max ? v.slice(0, max) : v;
}

function clipFields(obj, limits) {
  if (!obj || typeof obj !== "object") return {};
  const out = {};
  for (const [k, max] of Object.entries(limits)) {
    if (k in obj) out[k] = clip(obj[k], max);
  }
  return out;
}

export function sanitizeIntake(intake) {
  const it = intake && typeof intake === "object" ? intake : {};
  const person = {
    birthday: 20, gender: 20, birth_time: 10, birth_prefecture: 20, mbti: 10,
    age_range: 20, relation: 200, recent_event: 300,
  };
  const derivedIn = it.derived && typeof it.derived === "object" ? it.derived : {};
  const summaryIn = derivedIn.free_summary && typeof derivedIn.free_summary === "object" ? derivedIn.free_summary : null;

  const derived = {
    user_mini_reading: clip(derivedIn.user_mini_reading, 2500),
    partner_mini_reading: clip(derivedIn.partner_mini_reading, 2500),
  };
  if (summaryIn) {
    derived.free_summary = clipFields(summaryIn, { "吉": 40, "凶": 40, "一手": 60 });
  }

  return {
    version: clip(it.version, 10),
    persona: it.persona && typeof it.persona === "object" ? { name: clip(it.persona.name, 20) } : undefined,
    user: clipFields(it.user, person),
    partner: clipFields(it.partner, person),
    concern: { free_text: clip(it.concern?.free_text, 2000) },
    derived,
    meta: clipFields(it.meta, { session_id: 80, stripe_session_id: 200, created_at: 40, updated_at: 40 }),
  };
}
