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
        // キャッシュは「成功結果」なので失敗ノーカウント条件も満たす
        return res.status(200).json({ html: cached, format: "html", cached: true });
      }

      // 1日2回（ユーザー識別は sessionHash を主、ipHash を副でもOK）
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

      // 成功扱い：out に内容があること（あなたの normalizeModelOutput に合わせて調整）
      const html = out?.html || (out?.format === "html" ? out?.content : null);
      const text = out?.text || (out?.format !== "html" ? out?.content : null);

      // あなたのフロントは html を期待しているので、ここは既存仕様に合わせる
      const finalHtml = out?.html ?? out?.content ?? "";
      if (!finalHtml) {
        // 失敗：ノーカウント
        return res.status(500).json({ error: "Empty output" });
      }

      // カウント + キャッシュ（例：24hキャッシュ。あなたの要件なら 12h でもOK）
      const newCount = await kvIncr(countKey);
      if (newCount === 1) await kvExpire(countKey, 60 * 60 * 26); // ざっくり「明日まで」保険
      await kvSet(cacheKey, finalHtml, { ex: 60 * 60 * 24 });

      return res.status(200).json({ html: finalHtml, cached: false });
    }

    // ---- 2) mini / paid：ここは今まで通り生成（必要なら別枠の制限も追加） ----
    const out = await generateFortune({ mode, intake, req });

    // あなたの既存返却仕様に合わせる
    if (out.format === "html") return res.status(200).json({ html: out.content });
    return res.status(200).json({ text: out.content });
  } catch (err) {
    console.error(err);
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
