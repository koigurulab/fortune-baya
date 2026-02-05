// /api/fortune-generate.js

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const rawKey = process.env.OPENAI_API_KEY;
    if (!rawKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    const apiKey = rawKey.trim();

    // APIキー検査（chat.js踏襲）
    const badPositions = [];
    for (let i = 0; i < apiKey.length; i++) {
      const code = apiKey.charCodeAt(i);
      if (code < 0x20 || code > 0x7e) badPositions.push({ index: i, code });
    }
    if (badPositions.length > 0) {
      return res.status(500).json({
        error: "OPENAI_API_KEY has invalid characters",
        badPositions,
        length: apiKey.length,
      });
    }

    const { mode, intake } = req.body || {};
    if (!mode || !intake) {
      return res.status(400).json({ error: "mode and intake are required" });
    }

    const system = [
      "あなたは『占いばあや』です。上品な敬語（京寄り）で話してください。",
      "未来は断言せず『傾向＋推奨』で表現し、不確実性は丁寧に補足してください。",
      "ミニ鑑定は断定7割+保険3割。形式は『箇条書き3点＋確認1文』。",
      "無料レポートは約800字。必ず『吉』『凶』『一手』を含めてください。",
      "ユーザーを不安にさせる強い断定・攻撃・医療や法的助言は避けてください。"
    ].join("\n");

    const prompt = buildPrompt(mode, intake);

    // 生成パラメータ（chat.jsと揃える）
    const MODEL = "gpt-4.1-mini";
    const MAX_TOKENS = mode === "free_report" ? 1400 : 600; // 800字ならこのくらいで十分
    const TEMPERATURE = 0.7;
    const TIMEOUT_MS = 120_000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!openaiRes.ok) {
      const text = await openaiRes.text();
      return res.status(500).json({
        error: "OpenAI API error",
        status: openaiRes.status,
        body: text.slice(0, 2000),
      });
    }

    const data = await openaiRes.json();
    const content =
      data?.choices?.[0]?.message?.content ??
      "恐れ入ります。少し回線が乱れたようでございます。もう一度お試しくださいませ。";

    // フロントの期待フォーマットに合わせる
    if (mode === "free_report") return res.status(200).json({ html: content });
    return res.status(200).json({ text: content });

  } catch (err) {
    const msg = String(err);
    const isTimeout = msg.includes("AbortError") || msg.includes("aborted");
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? "Upstream timeout" : "Unexpected server error",
      detail: msg,
    });
  }
}

function buildPrompt(mode, intake) {
  const u = intake.user || {};
  const p = intake.partner || {};
  const c = intake.concern || {};
  const d = intake.derived || {};

  if (mode === "mini_user") {
    return [
      "【本人ミニ鑑定】",
      "要件：200〜260字、箇条書き3点＋末尾に『心当たりはございますか？』",
      "※四柱推命は厳密計算が不要。雰囲気と気質の言語化を優先（バーナム効果）。",
      "",
      `生年月日: ${u.birthday ?? "不明"}`,
      `出生時刻: ${u.birth_time ?? "不明"}`,
      `出生地: ${u.birth_prefecture ?? "不明"}`,
      `MBTI: ${u.mbti ?? "不明"}`,
    ].join("\n");
  }

  if (mode === "mini_partner") {
    return [
      "【相手ミニ鑑定】",
      "要件：200〜260字、箇条書き3点＋末尾に『近いでしょうか？』",
      "※相手の生年月日が不明なら年代から推定し、断言しない。",
      "",
      `生年月日: ${p.birthday ?? "不明"}`,
      `年代: ${p.age_range ?? "不明"}`,
      `出生時刻: ${p.birth_time ?? "不明"}`,
      `MBTI: ${p.mbti ?? "不明/推定"}`,
      `関係性: ${p.relation ?? "不明"}`,
      `直近の出来事: ${p.recent_event ?? "不明"}`,
    ].join("\n");
  }

  if (mode === "free_report") {
    return [
      "【無料レポート（HTML）】",
      "要件：",
      "- 約800字",
      "- 構成：①現状占断（短く）②7日以内の流れ（傾向）③吉・凶・一手（必須）④有料版で増える内容（箇条書き）",
      "- 未来は断言せず『傾向＋推奨』で。",
      "- 口調：上品な敬語（占いばあや）",
      "",
      "本人ミニ鑑定（既に出した内容）：",
      d.user_mini_reading ?? "",
      "",
      "相手ミニ鑑定（既に出した内容）：",
      d.partner_mini_reading ?? "",
      "",
      "入力情報：",
      `本人: ${JSON.stringify(u)}`,
      `相手: ${JSON.stringify(p)}`,
      "",
      "悩み（長文）：",
      c.free_text ?? "",
      "",
      "HTMLは <div> <p> <ul><li> を使って読みやすく。"
    ].join("\n");
  }

  return `Unsupported mode: ${mode}`;
}
