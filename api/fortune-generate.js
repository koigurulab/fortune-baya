// /api/fortune-generate.js
import { generateFortune } from "../lib/fortune/index.js";
import { kvGet, kvSet, kvIncr, kvExpire } from "../lib/kv.js";
import { clientIds, jstDay, sha256 } from "../lib/identify.js";

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

    const { mode, intake } = body || {};
    if (!mode || !intake) {
      return res.status(400).json({ error: "mode and intake are required" });
    }

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
      const cached = await kvGet(cacheKey);
      if (cached) {
        return res.status(200).json({ html: cached, format: "html", cached: true });
      }

      // 1日2回（ユーザー識別は sessionHash を主）
      const countKey = `free:count:${day}:${ids.sessionHash}`;
      const countRaw = await kvGet(countKey);
      const count = countRaw ? Number(countRaw) : 0;

      if (count >= 2) {
        return res.status(429).json({
          error: "Daily limit reached",
          message: "無料鑑定は1日2回までです。明日またお越しくださいませ。",
        });
      }

      // ---- 生成（成功したらだけカウント） ----
      const out = await generateFortune({ mode, intake, req });

      const finalHtml = out?.html ?? out?.content ?? "";
      if (!finalHtml) {
        return res.status(500).json({ error: "Empty output" });
      }

      // カウント + キャッシュ
      const newCount = await kvIncr(countKey);
      if (newCount === 1) await kvExpire(countKey, 60 * 60 * 26);
      await kvSet(cacheKey, finalHtml, { ex: 60 * 60 * 24 });

      return res.status(200).json({ html: finalHtml, cached: false });
    }

    // ---- 2) paid は「支払い権利」チェックを挟む（重要） ----
    if (mode === "paid_480" || mode === "paid_980") {
      const entRaw = await kvGet(`paid:ent:${ids.sessionHash}`);
      if (!entRaw) {
        return res.status(402).json({
          error: "PAYMENT_REQUIRED",
          message: "お支払いが確認できませんでした。決済後にもう一度お試しくださいませ。",
        });
      }

      let ent;
      try { ent = JSON.parse(entRaw); } catch { ent = null; }

      const planNeed = (mode === "paid_480") ? "480" : "980";
      if (!ent || String(ent.plan) !== planNeed) {
        return res.status(403).json({
          error: "PLAN_MISMATCH",
          message: "購入プランと生成内容が一致しませんでした。",
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
      return res.status(429).json({ error: "RATE_LIMITED" });
    }
    return res.status(500).json({ error: "FUNCTION_INVOCATION_FAILED" });
  }
}

async function rateLimitOrThrow(key, windowSec, limit) {
  const n = await kvIncr(key);
  if (n === 1) await kvExpire(key, windowSec);
  if (n > limit) {
    const e = new Error("RATE_LIMITED");
    e.status = 429;
    throw e;
  }
}
