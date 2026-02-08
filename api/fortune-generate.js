// /api/fortune-generate.js

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // --- body parse（環境差で req.body が string のことがあるので保険）
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
      }
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

    const { mode, intake } = body || {};
    if (!mode || !intake) {
      return res.status(400).json({ error: "mode and intake are required" });
    }

    // --- ensure derived exists
    intake.derived = intake.derived || {};

    // --- deterministic elements (A: same person => same elements)
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
      "あなたは『占いばあや』です。口調は敬語。ただし難しい言葉は使いません。親戚のおばあちゃんが、やさしく分かりやすく言う感じです。",
      "占いは『四柱推命』。厳密計算は不要ですが、五行（火・水・木・金・土）と『気』『運』『縁』『流れ』の言葉を必ず入れて、占いっぽさを出してください。",
      "MBTIは“ちょい足し”で使ってOKです。ただしMBTIだけを根拠にしないでください（性格の言い方や褒め方の調整に使う）。本文でのMBTI言及は最大1回まで。",
      "読みやすさ最優先。段落を分けます。改行なしの長文は禁止です。",
      "未来は断言しません。ただし行動は曖昧にしません。『一手』は1つに決め切ってください。",
      "医療/法律の助言、強い決めつけ、相手を攻撃する言い方はしません。",
      "ユーザー向けの本文だけを書きます。ルール説明や作業メモは書きません。",
    ].join("\n");

    const prompt = buildPrompt(mode, intake);
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Failed to build prompt" });
    }

    const MODEL = "gpt-4.1-mini";
    const MAX_TOKENS = mode === "free_report" ? 3600 : 1400; // free_reportは1200〜1500字想定で余裕
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
      "すみませんね。ちょっと電波が乱れたみたいです。もう一回だけお願いできますか？";

    if (mode === "free_report") return res.status(200).json({ html: content });
    return res.status(200).json({ text: content });
  } catch (err) {
    const msg = String(err?.stack || err);
    const isTimeout = msg.includes("AbortError") || msg.includes("aborted");
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? "Upstream timeout" : "Unexpected server error",
      detail: msg.slice(0, 2000),
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

  const userPair = `${ue.primary}×${ue.secondary}`;
  const partnerPair = `${pe.primary}×${pe.secondary}`;

  if (mode === "mini_user") {
    return [
      "本人のミニ鑑定を書いてください。",
      "文字数：日本語で800〜1000字。",
      "形式：次の順で6つ。各セクションは『キャッチコピー1行＋本文2〜3文』。セクションの間は空行を1行。",
      "表面 / 内側 / 恋愛や対人 / 強み / 弱点 / まとめ",
      "",
      "冒頭は必ずこの形：",
      `かしこまりました。{生年月日}{出生時刻のニュアンス}ご誕生の気配を拝見いたしますと、あなた様は『${ue.primary}の気』と『${ue.secondary}の気』が同時に立つ方でございます。`,
      "次の1文で、二つの気を短く説明（例：火＝始める、金＝分ける、など）。",
      "",
      "書き方のコツ：",
      "・五行の言葉（気/運/縁/流れ）を自然に入れる。",
      "・抽象だけにせず、口癖や行動のクセが浮かぶ具体例を入れる。",
      "・最後は必ず『……心当たりはございますでしょうか？』で終える。",
      "",
      `入力：生年月日=${u.birthday ?? "不明"} / 出生時刻=${u.birth_time ?? "不明"} / 出生地=${u.birth_prefecture ?? "不明"} / MBTI=${u.mbti ?? "不明"}`,
      `指定の気：${userPair}`,
    ].join("\n");
  }

  if (mode === "mini_partner") {
    return [
      "相手のミニ鑑定を書いてください。",
      "文字数：日本語で800〜1000字。",
      "形式：次の順で6つ。各セクションは『キャッチコピー1行＋本文2〜3文』。セクションの間は空行を1行。",
      "表面 / 内側 / 恋愛や対人 / 強み / 弱点 / まとめ",
      "",
      "冒頭は必ずこの形：",
      `かしこまりました。{生年月日または年代}{出生時刻のニュアンス}ご誕生の気配を拝見いたしますと、お相手様は『${pe.primary}の気』と『${pe.secondary}の気』が同時に立つ方でございます。`,
      "生年月日が不明なら年代でOK。その場合は言い切りすぎない（『そんな傾向が出やすい』くらい）。",
      "",
      "注意：関係性と直近の出来事を、説明くさくならないように1回だけ自然に入れる。",
      "最後は必ず『……近いでしょうか？』で終える。",
      "",
      `入力：生年月日=${p.birthday ?? "不明"} / 年代=${p.age_range ?? "不明"} / 出生時刻=${p.birth_time ?? "不明"} / MBTI=${p.mbti ?? "不明/推定"} / 関係性=${p.relation ?? "不明"} / 直近=${p.recent_event ?? "不明"}`,
      `指定の気：${partnerPair}`,
    ].join("\n");
  }

if (mode === "free_report") {
  return [
"【無料レポート（HTML）｜出力要件】",
"",
"■文字数",
"- 日本語で1900〜2200字（目安：冒頭350〜450字、相性800〜900字、7日以内800〜900字、CTA200〜250字）。",
"",
"■出力形式",
"- HTMLのみ。使用できるタグは <div><p><strong><ul><li> のみ。",
"- 各セクションは <div class='sec'> で区切る。",
"- 見出しは必ず <p><strong>見出し名</strong></p>。",
"- 空行は禁止。<p>の連続は最大3つまで（1文ごとに<p>を分けない）。",
"",
"■構成（固定）",
"0) はじめに",
"1) 二人の相性（深掘り）",
"2) 7日以内の流れ（深掘り）",
"3) 有料版のご案内（CTA）",
"",
"■トーン",
"- 敬語。難しい言葉は禁止。やさしく、でも言い切る。",
"- 五行は味付け。各セクション0〜1回まで。『縁・運・流れ・間・余白・重み』を中心にする。",
"",
"■最重要：中身の“部品”を必ず入れる（順番も守る）",
"",
"【0) はじめに：必須部品】",
"- (a) いま揺れている理由を1つに絞って言い切る（例：『進む直前の沈黙』）。",
"- (b) ユーザーの心の動きを2つ当てる（不安⇄期待、意味づけ、自己評価の揺れ等）。",
"- (c) このレポートで分かることを1文で宣言（状況の読み方）。",
"",
"【1) 二人の相性（深掘り）：必須部品】",
"- (a) 冒頭に <p><strong>相性の核：◯◯</strong></p> を入れる（短い言葉）。",
"- (b) 『会えている（会話が続いた等）＝縁が動いている』を根拠つきで言い切る。",
"- (c) “止まり方の理由”を2パターン出す：①相手の現実要因（忙しさ/疲れ/生活の波）②相手の心理要因（返事＝関係が進む重み/慎重になる）。",
"- (d) ユーザー側の反応を2つ当てる（意味づけ、答え合わせ、強がりと本音のズレ等）。",
"- (e) この組み合わせの典型的な落とし穴を1つ提示（良い時ほど一度止まる等）。",
"",
"【2) 7日以内の流れ（深掘り）：必須部品】",
"- (a) 冒頭に <p><strong>今週の鍵：◯◯</strong></p> を入れる（短い言葉）。",
"- (b) 2〜3日で起きやすい心の変化を2パターン（相手側）で描く。",
"- (c) 4〜7日で起きやすい分岐を3つ（薄い返事/軽い返事/沈黙継続）。",
"- (d) 各分岐の“意味”を1文で（脈なし断言は禁止。ただし現実的な見立ては言う）。",
"- (e) 線引きを1つ言う（例：ここまで反応が薄いと次の段階に移りにくい等）。",
"",
"【3) CTA：必須部品】",
"- 無料版では“結論（具体的な一手）”を出さない、と1文で明言。",
"- 300円：『今週の一手（文面テンプレ付き）＋禁じ手＋心の癖の直し方』",
"- 980円：『次の1ヶ月の流れ＋本音が出やすいタイミング＋分岐点と落とし穴』",
"- 押し売り禁止。短く。",
"",
"■事実の反映（必須・一般化）",
"- 入力から“固有の事実”を最低3点拾って本文に散らす（関係性/会った回数や期間/連絡状況/直近出来事/相手の連絡ペース等）。",
"- 数字があれば最低1つは本文に入れる。なければ『数日/しばらく』等で補う。",
"",
"■バーナム効果（必須・一般化）",
"- ユーザー側の心理描写を最低3つ、相手側を最低3つ、自然に散らす（断言しない）。",
"",
"■入力データ（これを材料にする）",
"（この下に intake の内容を貼る）",
    `本人の気：${userPair}`,
    `相手の気：${partnerPair}`,
    "",
    "本人ミニ鑑定：",
    d.user_mini_reading ?? "",
    "",
    "相手ミニ鑑定：",
    d.partner_mini_reading ?? "",
    "",
    `関係性：${p.relation ?? "不明"}`,
    `直近の出来事：${p.recent_event ?? "不明"}`,
    "",
    "悩み（長文）：",
    c.free_text ?? "",
  ].join("\n");
}
  return `Unsupported mode: ${mode}`;
} // ★ buildPrompt をここで必ず閉じる（これが欠けていて落ちていました）

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
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}
