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

    // --- ensure derived exists
    intake.derived = intake.derived || {};

    // --- deterministic elements (A: same person => same elements)
    // seed は「入力情報」だけで作る（session_id は使わない）
    const u = intake.user || {};
    const p = intake.partner || {};

    const userSeed = `user|${u.birthday ?? ""}|${u.birth_time ?? ""}|${u.birth_prefecture ?? ""}`;
    const partnerKey = p.birthday ?? p.age_range ?? "";
    const partnerSeed = `partner|${partnerKey}|${p.birth_time ?? ""}`;

    if (!intake.derived.user_elements) {
      intake.derived.user_elements = pickTwoElements(userSeed);
    }
    if (!intake.derived.partner_elements) {
      intake.derived.partner_elements = pickTwoElements(partnerSeed);
    }

    const system = [
      "あなたは『占いばあや』です。上品な敬語（京寄り）で話してください。",
      "占い方式は『四柱推命もどき』。厳密計算は不要だが、陰陽五行（火・水・木・金・土）や気質の言語化を必ず使い、“占っている感”を出すこと。",
      "MBTIは『文章の語彙・褒め方のチューニング用途』に限定。内容の根拠・主役にしない。本文でMBTIの言及は最大1回まで（原則は末尾注釈のみ）。",
      "ミニ鑑定は無料でも厚く：600〜900字（日本語の文字数）。短すぎるのは不可。",
      "ミニ鑑定は必ず『二つの気』から始め、二気の意味→観察→具体描写の順で刺さる言語化にすること。",
      "表示は読みやすさ最優先。各セクションは必ず改行で区切り、セクション間に空行を1行入れること（改行が無いと失格）。",
      "未来は断言せず『傾向＋推奨』で表現し、不確実性は丁寧に補足する。",
      "無料レポートは約800字。必ず『吉』『凶』『一手』を含める。",
      "ユーザーを不安にさせる強い断定・攻撃・医療や法的助言は避ける。"
    ].join("\n");

    const prompt = buildPrompt(mode, intake);

    // 生成パラメータ（chat.jsと揃える）
    const MODEL = "gpt-4.1-mini";
    const MAX_TOKENS = mode === "free_report" ? 1400 : 1100;
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
  const ue = d.user_elements || { primary: "火", secondary: "金" };
  const pe = d.partner_elements || { primary: "水", secondary: "木" };

  if (mode === "mini_user") {
    return [
      "【本人ミニ鑑定①｜出力要件（必ず遵守）】",
      "",
      "【文字数】日本語で600〜900字。",
      "",
      "【冒頭（必須）】",
      "必ずこの型で開始（※気は指定の2つを使うこと）：",
      `「かしこまりました。{生年月日}{出生時刻のニュアンス}ご誕生の気配を拝見いたしますと、あなた様は『${ue.primary}の気』と『${ue.secondary}の気』が同時に立つ方でございます。」`,
      "次の1文で、二気を短く言い切る（例：火＝始める力／金＝切り分ける力 など）。",
      "",
      "【構造（必須・見出し名固定・順番固定）】",
      "以下の6セクションを必ずこの順で出力。各セクションは必ず改行で区切り、セクション間に空行を1行入れる。",
      "1) 表面",
      "2) 内側",
      "3) 恋愛や対人",
      "4) 強み",
      "5) 弱点",
      "6) まとめ",
      "",
      "【各セクションの書き方（厳守）】",
      "- 各セクションは『1行目＝キャッチコピー』『本文＝2〜3文』。",
      "- 1行目（キャッチコピー）は必ずこの形式：",
      "  「・{セクション名}：{キャッチコピー}」",
      "- キャッチコピーは10〜16字程度。断言気味（例：『強い・迷わない人に見られがち』）。",
      "- 本文2〜3文の内訳：理由（五行/二気）＋具体場面（癖が浮かぶ描写）＋ギャップ（強く見えるが実は〜）。",
      "",
      "【MBTIの扱い（厳守）】",
      "- MBTIを根拠にしない。本文で『MBTI』『ENTJ』などは原則出さない。",
      "- 出すなら末尾注釈で1回のみ（例：※MBTIは言葉選びの参考程度）。",
      "",
      "【禁止】",
      "- 『①②③』の番号列挙は禁止。",
      "- キャッチコピー行以外の箇条書きは禁止。",
      "- 一般論だけで終えない。『〜かもしれません』連発禁止（保険は最後に1回だけ）。",
      "",
      "【まとめ（必須）】",
      "- 2〜3文。二面性（例：頭で勝ちに行けるのに、心は意外と一途）で締める。",
      "- 最後の一文は必ず『……心当たりはございますでしょうか？』で終える。",
      "",
      "【入力情報】",
      `生年月日：${u.birthday ?? "不明"}`,
      `出生時刻：${u.birth_time ?? "不明"}`,
      `出生地：${u.birth_prefecture ?? "不明"}`,
      `MBTI：${u.mbti ?? "不明"}`,
      "",
      "【指定の気（必ずこの2つを使用）】",
      `主気：${ue.primary}`,
      `副気：${ue.secondary}`,
    ].join("\n");
  }

  if (mode === "mini_partner") {
    return [
      "【相手ミニ鑑定②｜出力要件（必ず遵守）】",
      "",
      "【文字数】日本語で600〜900字。",
      "",
      "【冒頭（必須）】",
      "必ずこの型で開始（※気は指定の2つを使うこと）：",
      `「かしこまりました。{生年月日または年代}{出生時刻のニュアンス}ご誕生の気配を拝見いたしますと、お相手様は『${pe.primary}の気』と『${pe.secondary}の気』が同時に立つ方でございます。」`,
      "生年月日が不明なら年代から推定し、『傾向として』を入れて断言し過ぎない。",
      "",
      "【構造（必須・見出し名固定・順番固定）】",
      "以下の6セクションを必ずこの順で出力。各セクションは必ず改行で区切り、セクション間に空行を1行入れる。",
      "1) 表面",
      "2) 内側",
      "3) 恋愛や対人",
      "4) 強み",
      "5) 弱点",
      "6) まとめ",
      "",
      "【各セクションの書き方（厳守）】",
      "- 各セクションは『1行目＝キャッチコピー』『本文＝2〜3文』。",
      "- 1行目（キャッチコピー）は必ずこの形式：",
      "  「・{セクション名}：{キャッチコピー}」",
      "- キャッチコピーは10〜16字程度。断言気味。",
      "- 本文2〜3文の内訳：理由（五行/二気）＋具体場面（恋愛の距離感/反応が浮かぶ描写）＋ギャップ（裏側）。",
      "",
      "【今回の状況反映（必須）】",
      "- 『関係性』『直近の出来事』を1箇所だけ自然に織り込む（説明口調は禁止）。",
      "",
      "【MBTIの扱い（厳守）】",
      "- MBTIを根拠にしない。本文で『MBTI』は原則出さない。",
      "- 出すなら末尾注釈で1回のみ。",
      "",
      "【まとめ（必須）】",
      "- 2〜3文。相手の二面性＋今回の関係にとっての注意点を1つだけ。",
      "- 最後の一文は必ず『……近いでしょうか？』で終える。",
      "",
      "【入力情報】",
      `生年月日：${p.birthday ?? "不明"}`,
      `年代：${p.age_range ?? "不明"}`,
      `出生時刻：${p.birth_time ?? "不明"}`,
      `MBTI：${p.mbti ?? "不明/推定"}`,
      `関係性：${p.relation ?? "不明"}`,
      `直近の出来事：${p.recent_event ?? "不明"}`,
      "",
      "【指定の気（必ずこの2つを使用）】",
      `主気：${pe.primary}`,
      `副気：${pe.secondary}`,
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
      "- HTMLは <div> <p> <ul><li> を使って読みやすく。見出しっぽくしたい場合は <p><strong> を使う。",
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
    ].join("\n");
  }

  return `Unsupported mode: ${mode}`;
}

// --- deterministic element picker (stable) ---
function pickTwoElements(seed) {
  const elements = ["火", "水", "木", "金", "土"];
  const h1 = hash32FNV1a(`${seed}|primary`);
  const primary = elements[h1 % elements.length];

  const remaining = elements.filter((e) => e !== primary);
  const h2 = hash32FNV1a(`${seed}|secondary`);
  const secondary = remaining[h2 % remaining.length];

  return { primary, secondary };
}

function hash32FNV1a(str) {
  let h = 0x811c9dc5; // 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // h *= 16777619 (32bit)
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}
