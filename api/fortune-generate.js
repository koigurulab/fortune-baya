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
      "【無料レポート（HTML）｜出力要件】",
      "",
      "■目的",
      "- ユーザーの迷いを減らし、気持ちが楽になる言葉を渡しつつ、行動を1つに決める。",
      "",
      "■文字数",
      "- 日本語で1200〜1500字。",
      "",
      "■出力形式（重要）",
      "- HTMLのみで出力する。",
      "- 使ってよいタグは <div><p><strong><ul><li> のみ。",
      "- 各セクションは <div class='sec'> で区切る。",
      "- 各セクション冒頭は必ず <p><strong>見出し名</strong></p> にする。",
      "- 長い1段落は禁止。必ず段落を分ける（3〜6行で改段落する感覚）。",
      "",
      "■この指示文の復唱は禁止",
      "- 『出力要件』『目的』『形式』などの指示っぽい言葉を本文に出さない。",
      "",
      "■構成（固定・見出し名固定・順番固定）",
      "必ず下記6セクションをこの順で出す：",
      "0) 冒頭宣言",
      "1) 二人の相性",
      "2) 7日以内の流れ",
      "3) 行動指示",
      "4) 吉・凶・一手",
      "5) 有料版でもっと詳しく占えます（CTA）",
      "",
      "■トーン（重要）",
      "- 口調は常に敬語。ただし難しい言葉は禁止（拝察/肝要/証左/僭越/〜にございます 等）。",
      "- 親戚のおばあちゃんが“やさしく言い切る”感じ。短い文を多めに。",
      "- 占いっぽさは『運・縁・流れ・間・気持ちが重い/軽い』の言葉で出す。五行は使ってよいが、連発しない（1セクションに0〜1回が目安）。",
      "",
      "■バーナム効果の必須要件（最重要）",
      "- ユーザーの心の動きを“当てる”言い回しを必ず入れる：",
      "  ・強がって平気なふりをしつつ、スマホを何回も見てしまう/答え合わせをしたくなる/自分だけが前のめりに見えるのが怖い 等。",
      "- 相手側にも“ありそう”を入れる：",
      "  ・返す気はあるのに、返すほど重く感じて止まる/気分と余白で返信速度が変わる/好き嫌いより疲れ具合が出る 等。",
      "",
      "■事実の反映（必須）",
      "- 相談文の事実を最低3点入れる（デート回数、未読日数、元カノ、相手は既読が遅い、など）。",
      "- 返信がない＝脈なし、と断言しない。ただし希望だけで濁さず、現実の見立ても必ず入れる。",
      "",
      "■セクション別の要件",
      "",
      "0) 冒頭宣言",
      "- 2〜3段落。",
      "- 『今いちばん揺れる時期』を当てる。迷いを減らす宣言をする。",
      "",
      "1) 二人の相性",
      "- 冒頭にキャッチコピーを1行入れる：<p><strong>相性の核：◯◯</strong></p>",
      "- “押したくなる人”と“間が必要な人”のように、相性を一言で分かる形に翻訳する。",
      "- 『2回会えている＝縁が動いている』を言い切る。",
      "- ただし『良い流れほど相手は一度間を置く』も言い切る。",
      "",
      "2) 7日以内の流れ",
      "- 3〜4段落。",
      "- 日数レンジ（3日〜7日、など）を必ず1回入れる。",
      "- 返事が来る/来ないを断言しない代わりに、“起きやすい変化”を描写する（気持ちが落ち着く/重みが抜ける/返信しやすくなる 等）。",
      "",
      "3) 行動指示（最重要）",
      "- 『一手』を1つに決め切る（複数案は禁止）。",
      "- その一手が“なぜ効くか”を、占いっぽい言葉で説明する（縁の流れ/重み/余白/間 など）。",
      "- ユーザーがコピペできる送信文面テンプレを <ul><li> で1つだけ（短め）。",
      "- 禁じ手を <ul><li> で2つだけ（責める文、追撃、連投など）。",
      "- ユーザーの感情に寄り添う1文を必ず入れる（不安で当然、など）。",
      "",
      "4) 吉・凶・一手",
      "- <ul>で『吉』『凶』『一手』を必ず3つ出す（この表記で）。",
      "- 『一手』はセクション3と完全一致（内容ブレ禁止）。",
      "",
      "5) CTA",
      "- 押し売り禁止。やさしく案内する。",
      "- 300円と980円について、それぞれ増える内容を <ul><li> で2つずつ。",
      "",
      "■MBTIの扱い",
      "- MBTIは“性格の言い換え補助”として使ってよい。",
      "- ただし本文での言及は最大1回。根拠として断言しない（『〜っぽい』程度）。",
      "",
      "■入力データ（これを材料にする）",
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
