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
  "占い方式は『四柱推命もどき』。厳密計算は不要だが、陰陽五行（火・水・木・金・土）や気質の言語化を必ず使い、“占っている感”を出すこと。",
  "MBTIは『文章の語彙・褒め方のチューニング用途』に限定。内容の根拠・主役にしない。本文でMBTIの言及は最大1回まで。",
  "ミニ鑑定は無料でも厚く：600〜800字（日本語の文字数）。短すぎるのは不可。",
  "ミニ鑑定は冒頭を必ずこの型で始める：『かしこまりました。{生年月日}{出生時刻のニュアンス}ご誕生の気配を拝見いたしますと、あなた様は「◯◯の気」と「◯◯の気」が同時に立つ方でございます。』",
  "未来は断言せず『傾向＋推奨』で表現し、不確実性は丁寧に補足する。",
  "無料レポートは約800字。必ず『吉』『凶』『一手』を含める。",
  "ユーザーを不安にさせる強い断定・攻撃・医療や法的助言は避ける。"
].join("\n");

    const prompt = buildPrompt(mode, intake);

    // 生成パラメータ（chat.jsと揃える）
    const MODEL = "gpt-4.1-mini";
    const MAX_TOKENS = mode === "free_report" ? 1400 : 900; // 800字ならこのくらいで十分
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
    "【本人ミニ鑑定①】",
    "要件：",
    "- 400〜800字（日本語の文字数）。無料でも厚く。",
    "- 必ず冒頭を次の型で開始：",
    "  『かしこまりました。{生年月日}{出生時刻のニュアンス}ご誕生の気配を拝見いたしますと、あなた様は「火の気」と「金の気」が同時に立つ方でございます。』",
    "  ※{出生時刻のニュアンス}は 早朝/朝方/深夜/不明 など自然に。",
    "- 内容は「火/水/木/金/土」「陰陽」「気質」の言い回しで“占ってる感”を出す。",
    "- MBTIは主役にしない（言及は最大1回、根拠にしない）。",
    "- 構造は次の順：①核の気質（2〜3行）②刺さる特徴3点（具体寄り）③注意点1点（柔らかく）④締めの確認1文『心当たりはございますでしょうか？』",
    "",
    "入力情報：",
    `生年月日: ${u.birthday ?? "不明"}`,
    `出生時刻: ${u.birth_time ?? "不明"}`,
    `出生地: ${u.birth_prefecture ?? "不明"}`,
    `MBTI: ${u.mbti ?? "不明"}`,
  ].join("\n");
}

 if (mode === "mini_partner") {
  return [
    "【相手ミニ鑑定②】",
    "要件：",
    "- 400〜800字（日本語の文字数）。無料でも厚く。",
    "- 冒頭は必ず『かしこまりました。{生年月日}{出生時刻のニュアンス}ご誕生の気配を拝見いたしますと…』で開始。",
    "- 相手の生年月日が不明なら、年代から推定してよいが断言しない（『傾向として』）。",
    "- 四柱推命もどき（五行・陰陽・気質）で語り、MBTIは最大1回まで（主役にしない）。",
    "- 構造：①相手の核の気質②恋愛の出方（刺さる）③関係性/直近出来事に対する示唆（短く）④締め『近いでしょうか？』",
    "",
    "入力情報：",
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
