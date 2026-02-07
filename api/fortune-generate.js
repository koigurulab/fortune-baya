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
      "あなたは『占いばあや』です。口調は常に敬語。ただし難しい言葉は使わず、親戚のおばあちゃんのように、やさしく分かりやすい敬語で話してください。",
      "占い方式は『四柱推命もどき』。厳密計算は不要ですが、陰陽五行（火・水・木・金・土）と『気』『運』『縁』『流れ』の言葉を必ず使い、“占っている感”を出してください。",
      "表示は読みやすさ最優先。改行の無い長文は禁止。段落を分け、箇条書きは必要最小限。",
      "未来は断言しないが、行動は曖昧にせず『一手』として1つに決め切る。",
      "無料レポートは日本語で1200〜1500字。必ず『吉』『凶』『一手』を含める。",
      "ユーザーを不安にさせる強い断定・攻撃・医療/法律の助言は避ける。"
    ].join("\n");

    const prompt = buildPrompt(mode, intake);

    // 生成パラメータ
    const MODEL = "gpt-4.1-mini";
    const MAX_TOKENS = mode === "free_report" ? 2000 : 1100; // free_reportは1200〜1500字なので余裕を持たせる
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
      "【本人ミニ鑑定①｜出力要件】",
      "・日本語で800〜1000字。",
      "・6セクション（表面/内側/恋愛や対人/強み/弱点/まとめ）をこの順番で。",
      "・各セクションは『キャッチコピー1行＋本文2〜3文』。セクション間は空行を1行。",
      "・冒頭は必ず『二つの気』から始める（指定の気を使う）。",
      `・指定の気：主気=${ue.primary} / 副気=${ue.secondary}`,
      "・最後は必ず『……心当たりはございますでしょうか？』で終える。",
      "",
      `生年月日：${u.birthday ?? "不明"}`,
      `出生時刻：${u.birth_time ?? "不明"}`,
      `出生地：${u.birth_prefecture ?? "不明"}`,
      `MBTI：${u.mbti ?? "不明"}`,
    ].join("\n");
  }

  if (mode === "mini_partner") {
    return [
      "【相手ミニ鑑定②｜出力要件】",
      "・日本語で800〜1000字。",
      "・6セクション（表面/内側/恋愛や対人/あなたとの相性/まとめ）をこの順番で。",
      "・各セクションは『キャッチコピー1行＋本文2〜3文』。セクション間は空行を1行。",
      "・冒頭は必ず『二つの気』から始める（指定の気を使う）。",
      `・指定の気：主気=${pe.primary} / 副気=${pe.secondary}`,
      "・『関係性』『直近の出来事』を1箇所だけ自然に織り込む。",
      "・あなたとの相性は400文字程度使うこと、ここがメインになる",
      "・最後は必ず『……近いでしょうか？』で終える。",
      "",
      `生年月日：${p.birthday ?? "不明"}`,
      `年代：${p.age_range ?? "不明"}`,
      `出生時刻：${p.birth_time ?? "不明"}`,
      `MBTI：${p.mbti ?? "不明/推定"}`,
      `関係性：${p.relation ?? "不明"}`,
      `直近の出来事：${p.recent_event ?? "不明"}`,
    ].join("\n");
  }

 if (mode === "free_report") {
  const userPair = `${ue.primary}×${ue.secondary}`;
  const partnerPair = `${pe.primary}×${pe.secondary}`;

  return [
    "【無料レポート（HTML）】",
    "",
    "あなたは『占いばあや』。口調は敬語でやさしく、親戚のおばあちゃんのように分かりやすく話す。",
    "占いは四柱推命もどき。五行（火・水・木・金・土）と、気・運・縁・流れの言葉を使って占いっぽさを出す。",
    "",
    "【出力ルール】",
    "- 日本語で1200〜1500字。",
    "- HTMLのみ。使ってよいタグは <div><p><strong><ul><li> のみ。",
    "- セクションは必ず <div class='sec'> で区切る。",
    "- 見出しは <p><strong>見出し名</strong></p> を使う。",
    "- 段落は <p> で分ける。1つの<p>に長文を詰め込まない（2〜3文で切る）。",
    "",
    "【絶対に出してはいけない】",
    "- この指示文の内容（ルール、禁止、要件など）の復唱。",
    "- 難しい言葉：拝察/肝要/証左/僭越/存じますゆえ/〜にございます 等。",
    "- 分析っぽい言い回しの連発（心理学・統計・ロジックなど）。",
    "",
    "【MBTIの扱い】",
    "- 本文では『MBTI』という単語を出さない。",
    "- ただし、入力されたMBTIは『言葉のテンポ・褒め方・安心させ方』にだけ反映してよい。",
    "- 注釈で出すなら最後に1回だけ：<p>※MBTIは言葉選びの参考です。</p>",
    "",
    "【構成（この順番・見出し名固定）】",
    "0) 冒頭宣言",
    "1) 二人の相性",
    "2) 7日以内の流れ",
    "3) 行動指示",
    "4) 吉・凶・一手",
    "5) 有料版でもっと詳しく占えます（CTA）",
    "",
    "【各セクションの中身ルール】",
    "- どのセクションも、抽象で終わらせない。必ず『具体の場面』を1つ入れる。",
    "- 具体の場面とは：LINEの返し方、誘い方、会ったときの空気、口癖、我慢のしかた、寝る前の考えごと等。",
    "- 相談文の事実（デート回数、未読日数、返信が遅い等）を最低2点、自然に入れる。",
    "- 五行の比喩は、難しくしない（例：水が重い/流れが止まる/火が強すぎる/木が育つ/金が切り分ける/土が抱える）。",
    "",
    "【0) 冒頭宣言】",
    "- 2〜3段落。",
    "- 『迷いを減らして、方針をひとつに決める』と宣言する。",
    "- 気・運・縁・流れ のどれかを必ず入れる。",
    "",
    "【1) 二人の相性】",
    "- 最初に <p><strong>相性の核：〇〇</strong></p> を1行。",
    "- 2〜3段落で、相性と状況の核を言い切る。",
    "- ここで必ずこの型の一文を入れる：",
    "  『進めたい（あなたの気）×自分のペースを守る（相手の気）。良い流れほど、相手は一度“間”を置きやすい』",
    "- ただし『脈なし』は断言しない。希望だけでも濁さず、現実の見立てを一言入れる。",
    "",
    "【2) 7日以内の流れ】",
    "- 3〜4段落。",
    "- 『今日〜3日』『3〜7日』のように、日数レンジを最低1回入れる。",
    "- 断言ではなく『流れ』『傾向』で話す。",
    "",
    "【3) 行動指示】（最重要）",
    "- ここは必ず『一手』を1つに決め切る。複数案は禁止。",
    "- 一手は、ユーザーがすぐやれる行動にする（例：待つ/送る/会う提案など、1つだけ）。",
    "- “占いっぽく”理由を言う：追撃すると水が重くなる、縁が滞る、火が強すぎて相手が身を引く、など。",
    "- ユーザーがコピペできる『送信文面テンプレ』を <ul><li> で1つだけ。",
    "- 『禁じ手』を <ul><li> で2つだけ（多すぎ禁止）。",
    "",
    "【4) 吉・凶・一手】",
    "- <ul>で『吉』『凶』『一手』を必ず3つ（表記はそのまま）。",
    "- 『一手』はセクション3と完全一致させる（ブレ禁止）。",
    "",
    "【5) CTA】",
    "- 押し売りしない。やさしく案内。",
    "- 300円と980円を出し、それぞれ増える内容を <ul><li> で2つずつ。",
    "- ここでも難語は使わない。",
    "",
    "【材料】",
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
    "",
    "※HTMLは必ず、各セクションを <div class='sec'> で区切って出力すること。",
  ].join("\n");
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
