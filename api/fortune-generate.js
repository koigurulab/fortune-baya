// /api/fortune-generate.js
import { generateFortune } from "../lib/fortune/index.js";
import { kvGet, kvSet, kvIncr, kvExpire, kvTry } from "../lib/kv.js";
import { verifyStripeEntitlement } from "../lib/paid.js";
import { clientIds, jstDay, sha256 } from "../lib/identify.js";
import { sanitizeIntake } from "../lib/sanitize.js";

const MODES = new Set(["mini_user", "mini_partner", "free_report", "paid_480", "paid_980", "paid_1980"]);
const KV_DOWN = Symbol("kv_down");

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // body parse（環境で req.body が string のことがある）
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); }
      catch { return res.status(400).json({ error: "Invalid JSON body" }); }
    }

    const { mode } = body || {};
    if (!mode || !body?.intake) {
      return res.status(400).json({ error: "mode and intake are required" });
    }
    // 知らないモードでもOpenAIを呼んでしまっていたので弾く
    if (!MODES.has(mode)) {
      return res.status(400).json({ error: "unknown mode" });
    }
    // 長すぎる入力を切り詰める（利用料の使いすぎ防止）
    const intake = sanitizeIntake(body.intake);

    // ---- 0) まずレート制限（DoS一次防御） ----
    const day = jstDay();
    const ids = clientIds(req, intake);

    // 例：IP 1分 30回、セッション 1分 20回（必要なら調整）
    await rateLimitOrThrow(`rl:ip:${ids.ipHash}`, 60, 30);
    await rateLimitOrThrow(`rl:sess:${ids.sessionHash}`, 60, 20);

    // ---- 1) 無料レポート：同一入力キャッシュ + 1日2回（成功のみ） ----
    if (mode === "free_report") {
      // キャッシュキー：入力（intake）の要点だけをハッシュ
      const cacheSig = sha256(JSON.stringify({
        v: intake?.version,
        user: intake?.user,
        partner: intake?.partner,
        concern: intake?.concern,
        persona: intake?.persona,
      }));
      const cacheKey = `free:cache:${cacheSig}`;
      const cached = await kvTry(() => kvGet(cacheKey));
      if (cached) {
        return res.status(200).json({ html: cached, format: "html", cached: true });
      }

      // 1日2回（ユーザー識別は sessionHash を主）
      const countKey = `free:count:${day}:${ids.sessionHash}`;
      const countRaw = await kvTry(() => kvGet(countKey), KV_DOWN);
      const kvDown = countRaw === KV_DOWN;
      // KVが使えない間は、IPごとの回数をこの関数インスタンスのメモリで数える（ゆるめに4回）
      const memDailyKey = `free:${day}:${ids.ipHash}`;
      const count = kvDown ? memCount(memDailyKey) : (countRaw ? Number(countRaw) : 0);
      const limit = kvDown ? 4 : 2;

      if (count >= limit) {
        return res.status(429).json({
          error: "Daily limit reached",
          message: "無料の鑑定は、今日はここまでですわ。また明日いらしてくださいね。ばあやは待っていますわよ。",
        });
      }

      // ---- 生成（成功したらだけカウント） ----
      const out = await generateFortune({ mode, intake, req });

      const finalHtml = out?.html ?? out?.content ?? "";
      if (!finalHtml) {
        return res.status(500).json({ error: "Empty output" });
      }

      // カウント + キャッシュ
      if (kvDown) memIncr(memDailyKey, 60 * 60 * 26);
      await kvTry(async () => {
        const newCount = await kvIncr(countKey);
        if (newCount === 1) await kvExpire(countKey, 60 * 60 * 26);
        await kvSet(cacheKey, finalHtml, { ex: 60 * 60 * 24 });
      });

      return res.status(200).json({ html: finalHtml, cached: false });
    }

    // ---- 2) paid は「支払い権利」チェックを挟む（重要） ----
    if (mode === "paid_480" || mode === "paid_980" || mode === "paid_1980") {
      let ent = null;
      const entRaw = await kvTry(() => kvGet(`paid:ent:${ids.sessionHash}`));
      if (entRaw) {
        try { ent = JSON.parse(entRaw); } catch { ent = null; }
      }
      // KVに無い（またはKV障害）ときは Stripe を直接確認する
      if (!ent) {
        ent = await verifyStripeEntitlement(intake?.meta?.stripe_session_id, ids.sessionHash);
      }
      if (!ent) {
        return res.status(402).json({
          error: "PAYMENT_REQUIRED",
          message: "お支払いが確認できませんでしたわ。お支払いが済んでいるのに出る時は、このページを開き直してくださいね。",
        });
      }

      const planNeed = (mode === "paid_480") ? "480" : (mode === "paid_980") ? "980" : "1980";
      if (String(ent.plan) !== planNeed) {
        return res.status(403).json({
          error: "PLAN_MISMATCH",
          message: "お支払いのプランと、作ろうとした鑑定が合いませんでしたわ。お手数ですが koigurulab@gmail.com へご連絡くださいね。",
        });
      }
    }

    // ---- 3) mini / paid：生成 ----
    const out = await generateFortune({ mode, intake, req });

    // あなたの既存返却仕様に合わせる
    if (out?.format === "html") return res.status(200).json({ html: out.content });
    if (out?.html) return res.status(200).json({ html: out.html });
    if (out?.text) return res.status(200).json({ text: out.text });

    return res.status(200).json({ text: String(out?.content ?? "") });
  } catch (err) {
    console.error(err);
    // RATE_LIMITED を 429 に
    if (err?.status === 429) {
      return res.status(429).json({ error: "RATE_LIMITED", message: "少し急ぎすぎですわ。1分ほど置いてから、もう一度試してくださいね。" });
    }
    return res.status(500).json({ error: "FUNCTION_INVOCATION_FAILED" });
  }
}

async function rateLimitOrThrow(key, windowSec, limit) {
  let n;
  try {
    n = await kvIncr(key);
    if (n === 1) await kvExpire(key, windowSec);
  } catch (e) {
    // KV障害時は、この関数インスタンスのメモリで数える（完全ではないが、無制限よりまし）
    console.warn("[kv] rate limit fallback to memory:", e?.message || e);
    n = memIncr(key, windowSec);
  }
  if (n > limit) {
    const e = new Error("RATE_LIMITED");
    e.status = 429;
    throw e;
  }
}

// ---- KVが使えない時のための、メモリ上の簡易カウンタ ----
const memHits = new Map(); // key -> { n, resetAt }

function memSweep(now) {
  if (memHits.size < 5000) return;
  for (const [k, v] of memHits) if (v.resetAt <= now) memHits.delete(k);
}

function memCount(key) {
  const e = memHits.get(key);
  if (!e || e.resetAt <= Date.now()) return 0;
  return e.n;
}

function memIncr(key, windowSec) {
  const now = Date.now();
  memSweep(now);
  const e = memHits.get(key);
  if (!e || e.resetAt <= now) {
    memHits.set(key, { n: 1, resetAt: now + windowSec * 1000 });
    return 1;
  }
  e.n += 1;
  return e.n;
}
