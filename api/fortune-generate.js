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
  "MBTIは『言葉選びの微調整』に限定。根拠にしない。本文でMBTIの言及は原則しない（するなら末尾に1回だけ注釈）。",
  "表示は読みやすさ最優先。改行の無い長文は禁止。段落を分け、箇条書きは必要最小限。",
  "未来は断言しないが、行動は曖昧にせず『一手』として1つに決め切る。",
  "無料レポートは日本語で1200〜1500字。必ず『吉』『凶』『一手』を含める。",
  "ユーザーを不安にさせる強い断定・攻撃・医療/法律の助言は避ける。"
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
  const userPair = `${ue.primary}×${ue.secondary}`;
  const partnerPair = `${pe.primary}×${pe.secondary}`;

  return [
    "【無料レポート（HTML）｜出力要件（必ず遵守）】",
    "",
    "【文字数】日本語で1200〜1500字（短すぎ不可・長すぎ不可）。",
    "",
    "【出力形式】HTMLのみで出力。使用できるタグは <div><p><strong><ul><li> のみ。",
    "・各セクションは <div class='sec'> で区切る。",
    "・見出しは <p><strong>見出し名</strong></p> を使う。",
    "・段落は <p> で分ける。改行の無い長文は禁止（失格）。",
    "",
    "【重要：この指示文の復唱禁止】",
    "- このプロンプト内の文言をそのまま出力しない。",
    "- 『要件』『出力形式』『失格』など指示っぽい言葉を本文に出さない。",
    "",
    "【構成（固定・順番固定・見出し名固定）】",
    "必ず下記6セクションをこの順番で出す。欠けたら失格。",
    "0) 冒頭宣言",
    "1) 二人の相性",
    "2) 7日以内の流れ",
    "3) 行動指示",
    "4) 吉・凶・一手",
    "5) 有料版でもっと詳しく占えます（CTA）",
    "",
    "【0) 冒頭宣言】",
    "- 2〜3文。",
    "- 今回は『迷いを減らして方針を決める』と宣言する。",
    "- 五行の言葉（気・運・縁・流れのいずれか）を必ず入れる。",
    "",
    "【1) 二人の相性】",
    "- 最初に短いキャッチコピーを1行（<p><strong>相性の核：…</strong></p>）。",
    "- 2〜3段落で、『今の状況の核』を占い言葉で言い切る。",
    "- 五行の比喩を必ず1つ入れる（濁る／滞る／流れる／灯る／鎮まる／育つ など）。",
    "- 『脈なし断定』はしない。ただし希望だけで濁さず、現実の見立ても入れる。",
    "",
    "【2) 7日以内の流れ】",
    "- 3〜4段落で、『数日〜1週間』の運の動きを描写する。",
    "- 断言ではなく『傾向』『流れ』で述べる。",
    "- 日数レンジの表現を最低1回入れる（例という語は書かない）。",
    "",
    "【3) 行動指示】※最重要・欠けたら失格",
    "- ここは必ず『一手』を1つに決め切る（複数案は禁止）。",
    "- その一手の理由を、五行の比喩で説明する（例：水が濁る/縁が滞る/気が重くなる 等の占い言葉）。",
    "- ユーザーがコピペできる『送信文面テンプレ』を <ul><li> で1つだけ提示（短め）。",
    "- やらない方がよい行動（禁じ手）を <ul><li> で2つだけ提示（多すぎ禁止）。",
    "",
    "【4) 吉・凶・一手】",
    "- <ul>で『吉』『凶』『一手』を必ず3つ出す（この表記で）。",
    "- 『一手』はセクション3と完全に一致（ブレ禁止）。",
    "",
    "【5) CTA】",
    "- 押し売りはしない。やさしく案内する。",
    "- 300円と980円について、それぞれ増える内容を <ul><li> で2つずつ。",
    "",
    "【禁止】",
    "- 難しい漢語（拝察/肝要/証左/僭越/〜にございます 等）は使わない。",
    "- ①②③などの番号で長く分析しない。",
    "- 『焦らず』だけで終わらない。具体の動作まで落とす。",
    "- MBTIを根拠にしない（本文で基本出さない）。",
    "",
    "【材料（必ず反映）】",
    "- 本人と相手の『気』を使って語る（相性の核と行動理由に必須）。",
    "- 相談文の事実（デート回数、未読日数、相手の返信傾向など）を最低2点入れる。",
    "",
    "【入力データ】",
    `本人の気：${userPair}`,
    `相手の気：${partnerPair}`,
    "",
    "本人ミニ鑑定（既に出した内容）：",
    d.user_mini_reading ?? "",
    "",
    "相手ミニ鑑定（既に出した内容）：",
    d.partner_mini_reading ?? "",
    "",
    "状況（関係性・直近の出来事）：",
    `関係性：${p.relation ?? "不明"}`,
    `直近の出来事：${p.recent_event ?? "不明"}`,
    "",
    "悩み（長文）：",
    c.free_text ?? ""
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
