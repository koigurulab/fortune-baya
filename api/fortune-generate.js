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
    "【本人ミニ鑑定①｜出力要件（必ず遵守）】",
    "",
    "あなたは『占いばあや』です。上品な敬語（京寄り）で話してください。",
    "占い方式は四柱推命“もどき”。厳密計算は不要ですが、陰陽五行（火・水・木・金・土）と「気」の言い回しで“占っている感”を必ず出してください。",
    "",
    "【合否判定】以下に違反したら失格：",
    "- 文字数が600〜900字から外れる（短すぎ不可）。",
    "- 冒頭テンプレが指定通りでない。",
    "- セクションが6つ揃っていない、順番が違う、見出し名が違う。",
    "- 各セクションにキャッチコピーがない、または形式が違う。",
    "- 最後の一文が『……心当たりはございますでしょうか？』で終わっていない。",
    "",
    "【文字数】",
    "- 日本語で600〜900字。",
    "",
    "【冒頭（必須・この型で開始）】",
    "- 必ずこの一文から開始：",
    "  「かしこまりました。{生年月日}{出生時刻のニュアンス}ご誕生の気配を拝見いたしますと、あなた様は『火の気』と『金の気』が同時に立つ方でございます。」",
    "- 次の1文で、火＝始める力／金＝切り分ける力、のように二気の意味を短く言い切る（比喩OK）。",
    "- {出生時刻のニュアンス}は 早朝/朝方/深夜/不明 など自然に入れる。",
    "",
    "【本文の構造（必須・この順・見出し名固定）】",
    "以下の6セクションを必ずこの順で出力。欠けたら失格。",
    "1) 表面",
    "2) 内側",
    "3) 恋愛や対人",
    "4) 強み",
    "5) 弱点",
    "6) まとめ",
    "",
    "【各セクションの書き方（厳守）】",
    "- 各セクションは『1行目＝キャッチコピー』『本文＝2〜3文』で構成する。",
    "- 1行目（キャッチコピー）は必ずこの形式：",
    "  「・{セクション名}：{キャッチコピー}」",
    "- キャッチコピーは10〜16字程度。断言気味（例：『強い・迷わない人に見られがち』）。",
    "- 本文2〜3文の内訳：",
    "  - 1文は“理由”（火×金など二気の組み合わせで説明）",
    "  - 1文は“具体場面”（仕事/恋愛/一人の時間など。口癖・行動・思考の癖が浮かぶ描写）",
    "  - 残り1文は“ギャップ/裏側の本音”（強く見えるが実は〜、等）",
    "",
    "【MBTIの扱い（厳守）】",
    "- MBTIを根拠にしない。本文で『MBTI』『ENTJ』などは原則出さない。",
    "- 出す場合は末尾注釈で1回だけ（例：※MBTIは言葉選びの参考程度）に留める。",
    "",
    "【禁止事項（重要）】",
    "- 『①②③』などの番号列挙は禁止（説明臭くなるため）。",
    "- 見出し6つ以外の箇条書きを増やさない（キャッチコピー行以外での箇条書き禁止）。",
    "- 『焦らず』『心の余裕』『おすすめします』など一般論だけで終えない。",
    "- 『〜かもしれません』を連発しない（保険は最後に1回だけ）。",
    "- 火や金の定義を長々と説明しない（観察を優先）。",
    "",
    "【まとめ（必須）】",
    "- まとめは2〜3文で、二面性（例：頭で勝ちに行けるのに、心は意外と一途）で締める。",
    "- 最後の一文は必ず『……心当たりはございますでしょうか？』で終える。",
    "",
    "【入力情報】",
    `生年月日：${u.birthday ?? "不明"}`,
    `出生時刻：${u.birth_time ?? "不明"}`,
    `出生地：${u.birth_prefecture ?? "不明"}`,
    `MBTI：${u.mbti ?? "不明"}`,
  ].join("\\n");
}

if (mode === "mini_partner") {
  return [
    "【相手ミニ鑑定②｜出力要件（必ず遵守）】",
    "",
    "あなたは『占いばあや』です。上品な敬語（京寄り）で話してください。",
    "占い方式は四柱推命“もどき”。厳密計算は不要ですが、陰陽五行（火・水・木・金・土）と「気」の言い回しで“占っている感”を必ず出してください。",
    "",
    "【合否判定】以下に違反したら失格：",
    "- 文字数が600〜900字から外れる（短すぎ不可）。",
    "- 冒頭テンプレが指定通りでない。",
    "- セクションが6つ揃っていない、順番が違う、見出し名が違う。",
    "- 各セクションにキャッチコピーがない、または形式が違う。",
    "- 最後の一文が『……近いでしょうか？』で終わっていない。",
    "",
    "【文字数】",
    "- 日本語で600〜900字。",
    "",
    "【冒頭（必須・この型で開始）】",
    "- 必ずこの型で開始：",
    "  「かしこまりました。{生年月日または年代}{出生時刻のニュアンス}ご誕生の気配を拝見いたしますと、お相手様は『◯◯の気』と『◯◯の気』が同時に立つ方でございます。」",
    "- 生年月日が不明な場合は年代から推定し、『傾向として』の表現を入れて断言し過ぎない。",
    "- {出生時刻のニュアンス}は 早朝/朝方/深夜/不明 など自然に入れる。",
    "",
    "【本文の構造（必須・この順・見出し名固定）】",
    "以下の6セクションを必ずこの順で出力。欠けたら失格。",
    "1) 表面",
    "2) 内側",
    "3) 恋愛や対人",
    "4) 強み",
    "5) 弱点",
    "6) まとめ",
    "",
    "【各セクションの書き方（厳守）】",
    "- 各セクションは『1行目＝キャッチコピー』『本文＝2〜3文』で構成する。",
    "- 1行目（キャッチコピー）は必ずこの形式：",
    "  「・{セクション名}：{キャッチコピー}」",
    "- キャッチコピーは10〜16字程度。断言気味。",
    "- 本文2〜3文の内訳：",
    "  - 1文は“理由”（五行の気質で言語化）",
    "  - 1文は“具体場面”（恋愛での反応、距離感、連絡、会う頻度、決断の癖などが浮かぶ描写）",
    "  - 残り1文は“ギャップ/裏側”",
    "",
    "【今回の状況反映（必須）】",
    "- 『関係性』『直近の出来事』を1箇所だけ自然に織り込む（説明口調ではなく、占断の一部として）。",
    "",
    "【MBTIの扱い（厳守）】",
    "- MBTIを根拠にしない。本文で『MBTI』は原則出さない。",
    "- 出す場合は末尾注釈で1回だけに留める。",
    "",
    "【禁止事項（重要）】",
    "- 『①②③』などの番号列挙は禁止。",
    "- 見出し6つ以外の箇条書きを増やさない（キャッチコピー行以外での箇条書き禁止）。",
    "- 一般論だけで終えない。保険の連発をしない（保険は最後に1回だけ）。",
    "",
    "【まとめ（必須）】",
    "- まとめ2〜3文。相手の二面性＋今回の関係にとっての注意点を1つだけ入れる。",
    "- 最後の一文は必ず『……近いでしょうか？』で終える。",
    "",
    "【入力情報】",
    `生年月日：${p.birthday ?? "不明"}`,
    `年代：${p.age_range ?? "不明"}`,
    `出生時刻：${p.birth_time ?? "不明"}`,
    `MBTI：${p.mbti ?? "不明/推定"}`,
    `関係性：${p.relation ?? "不明"}`,
    `直近の出来事：${p.recent_event ?? "不明"}`,
  ].join("\\n");
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
