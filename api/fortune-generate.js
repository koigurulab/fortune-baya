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
    "【無料レポート（HTML）】",
    "",
    "あなたは『占いばあや』として、恋愛相談の無料レポートを出します。",
    "ユーザーに寄り添いながらも、言葉は具体的で、読後に『状況が整理された』と思える内容にしてください。",
    "",
    "【出力形式】",
    "- HTMLのみで出力。",
    "- 使用できるタグは <div><p><strong><ul><li> のみ。",
    "- セクションは必ず <div class='sec'> で区切る。",
    "- 見出しは必ず <p><strong>見出し名</strong></p>。",
    "",
    "【改行ルール（重要）】",
    "- 各セクションは <p> を2つまで（= 段落は最大2段落）。",
    "- 1段落は2〜4文にまとめる。1文ごとに改行しない。",
    "- 空の <p>（中身なし）や、やたら長い空行は禁止。",
    "",
    "【構成（固定）】必ずこの4セクションのみ、順番固定：",
    "0) はじめに",
    "1) 二人の相性",
    "2) 7日以内の流れ",
    "3) 有料版のご案内",
    "",
    "【分量目安（重要）】",
    "- 合計 1800〜2200字くらい。",
    "- 0) はじめに：300〜450字",
    "- 1) 二人の相性：700〜900字（深掘り）",
    "- 2) 7日以内の流れ：700〜900字（深掘り）",
    "- 3) CTA：200〜350字（短く刺す）",
    "",
    "【トーン】",
    "- 口調は常に敬語。難しい言葉は禁止（拝察/肝要/証左/僭越/〜にございます 等）。",
    "- 親戚のおばあちゃんが、やさしくハッキリ言う感じ。",
    "- 占いっぽさは『運・縁・流れ・間・余白・重い/軽い』で出す。",
    "- 五行（火・水・木・金・土）は“味付け”だけ：各セクションで0〜1回まで。連発禁止。",
    "",
    "【絶対に守ること】",
    "- 無料版では『行動指示（何をするか）』を出さない（具体的な一手・送信文面・吉凶は有料版に回す）。",
    "- 返信の有無を断言しない。ただし現実の見立ては濁さない（希望だけで終わらせない）。",
    "- ルール説明や作業メモを書かない。ユーザー向け本文だけ。",
    "",
   "【バーナム効果（最重要：必須描写）】",
"※具体例は入力に合わせて作ること。下記は“心理の型”として守る。",
"",
"A) ユーザー側（最低3つ）",
"- 相手の反応が薄いほど、不安と期待が交互に出る（揺れ）",
"- 自分の温度が高い/低いのどちらでも、後から自己評価がブレる（反省・納得探し）",
"- 相手の行動を『意味づけ』して理由を探したくなる（答え合わせ欲）",
"- 体裁は落ち着いて見せたいが、内側は焦りや寂しさが出る（強がりと本音のズレ）",
"",
"B) 相手側（最低3つ）",
"- 気持ちが無いというより、心の余裕やタイミングで動きが遅くなることがある（余白）",
"- 返すほど“期待に応える責任”を感じて、慎重になりやすい（重み）",
"- 好意があっても、関係が進むことの現実感で一度立ち止まることがある（躊躇）",
"- 連絡が薄いのは、気持ちより優先順位/生活事情が表に出ている場合もある（現実要因）",
"",
"【書き方の条件】",
"- 上の心理の型は“断言しない”。『〜になりやすい』『〜のことが多い』で書く。",
"- ただし読み手が『それ私だ』と思うように、入力の事実に沿った具体例を1〜2個だけ添える。",
    "【事実の反映（必須）】",
    "- 入力（関係性・直近出来事・悩み文・ミニ鑑定）から『固有の事実』を最低3点抜き出して本文に入れる。",
    "- 数字があるなら最低1つは使う（回数、日数、期間など）。数字が無ければ『数日/しばらく/最近』などで補う。",
    "- 例：会った回数、連絡が止まっている期間、関係性（元恋人/曖昧/片想い等）、相手の返信傾向、直近の出来事、など。",
    "",
    "【セクション別の必須要件】",
    "",
    "0) はじめに（2段落まで）",
    "- いまが『いちばん揺れる時期』だと当てる。",
    "- ユーザーの気持ちを肯定しつつ、『この無料版で分かること』を短く宣言する（結論の行動は出さない）。",
    "",
    "1) 二人の相性（深掘り：2段落まで）",
    "- 1行目に必ず核の翻訳を入れる：<p><strong>相性の核：◯◯</strong></p>（例：進めたい人×間が必要な人）",
    "- 『会えている＝縁が動いている』を言い切る（ただし押し売りの断言は禁止）。",
    "- 未読/既読が遅い等が起きる“典型パターン”を最低3つ、具体例つきで描写する。",
    "- ユーザー側の心の揺れ（強がり→確認→反省→期待）を必ず入れる。",
    "- 五行ワードは最大1回。使うなら“比喩”として短く。",
    "",
    "2) 7日以内の流れ（深掘り：2段落まで）",
    "- 日数レンジを必ず入れる（例：最初の2〜3日／4日目以降／3〜7日）。",
    "- 返信が来る来ないは断言しない代わりに、『起きやすい心の変化』を描く。",
    "- 相手側の変化を2パターンで描く：",
    "  (i) 好意はあるが重くて止まる",
    "  (ii) 優先度が低くて棚上げになる",
    "- さらに、起きやすい展開を3分岐で短く示す（各1文）：",
    "  ①短い返信が来る／②薄い返信が来る／③動かない",
    "- 現実的な線引きを1回入れる（例：『1週間たっても動きが薄いなら〜の可能性が上がる』のように、断言は避けつつ現実も言う）。",
    "- 五行ワードは最大1回。",
    "",
    "3) 有料版のご案内（2段落まで）",
    "- 無料版では“あえて出していないもの”を明言し、課金理由を作る。",
    "- 300円/980円で増える内容を <ul><li> で2つずつ。",
    "- 300円：今週の『一手（送る文面テンプレ含む）』＋『禁じ手』＋『心の癖の直し方』",
    "- 980円：『次の1ヶ月の流れ』＋『相手の本音が出やすいタイミング』＋『復縁の分岐点と避ける落とし穴』",
    "- 押し売り禁止。やさしく案内する。",
    "",
    "【材料】（ここから事実を抜き出して使う）",
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
