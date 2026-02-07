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
      "占いは『四柱推命もどき』。厳密計算は不要ですが、五行（火・水・木・金・土）と『気』『運』『縁』『流れ』の言葉を必ず入れて、占いっぽさを出してください。",
      "MBTIは“ちょい足し”で使ってOKです。ただしMBTIだけを根拠にしないでください（性格の言い方や褒め方の調整に使う）。本文でのMBTI言及は最大1回まで。",
      "読みやすさ最優先。段落を分けます。改行なしの長文は禁止です。",
      "未来は断言しません。ただし行動は曖昧にしません。『一手』は1つに決め切ってください。",
      "医療/法律の助言、強い決めつけ、相手を攻撃する言い方はしません。",
      "ユーザー向けの本文だけを書きます。ルール説明や作業メモは書きません。"
    ].join("\n");

    const prompt = buildPrompt(mode, intake);

    const MODEL = "gpt-4.1-mini";
    const MAX_TOKENS = mode === "free_report" ? 2400 : 1400; // free_reportは1200〜1500字想定で余裕
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
      "無料レポートをHTMLで書いてください。",
      "文字数：日本語で1200〜1500字。",
      "タグ：<div><p><strong><ul><li> だけ。ほかのタグは使わない。",
      "各セクションは <div class='sec'> で区切る。",
      "見出しは <p><strong>見出し名</strong></p> を使う。",
      "段落は <p> で分ける。長い1段落で押し切らない。",
      "",
      "構成（この順番・見出し名もこのまま）：",
      "0) 冒頭宣言",
      "1) 二人の相性",
      "2) 7日以内の流れ",
      "3) 行動指示",
      "4) 吉・凶・一手",
      "5) 有料版でもっと詳しく占えます（CTA）",
      "",
      "書き方：",
      "・占いっぽい言葉（気/運/縁/流れ）を入れるが、むずかしい言葉は使わない。",
      "・抽象だけにしない。相談文の事実を最低2つ入れる（回数、未読日数、返信の遅さ、など）。",
      "・相性は『進めたい気』と『相手のペースの気』みたいに、五行で分かりやすく言う。",
      "",
      "3) 行動指示（ここが一番大事）：",
      "・『一手』は1つに決め切る（複数案は禁止）。",
      "・送る文面テンプレを1つだけ <ul><li> で出す（短め）。",
      "・やらない方がいいこと（禁じ手）を2つだけ <ul><li> で出す。",
      "",
      "4) 吉・凶・一手：",
      "・<ul>で 吉 / 凶 / 一手 を必ず3つ。",
      "・一手は 3) の内容と同じにする。",
      "",
      "CTA：",
      "・押し売りしない。300円と980円、それぞれ『増える内容』を2つずつ <ul><li> で。",
      "",
      `材料：本人の気=${userPair} / 相手の気=${partnerPair}`,
      `関係性=${p.relation ?? "不明"} / 直近=${p.recent_event ?? "不明"}`,
      "",
      "本人ミニ鑑定：",
      d.user_mini_reading ?? "",
      "",
      "相手ミニ鑑定：",
      d.partner_mini_reading ?? "",
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
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}
