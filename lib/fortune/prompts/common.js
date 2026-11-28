// /lib/fortune/prompts/common.js
// 全モード共通で使う指示。入力に無いことを作らない／相手の生年月日が不明な時の扱い など。

export function isUnknownElements(e) {
  return !e || !e.primary || e.primary === "不明";
}

// 「相手の気」の行。生年月日が不明なら五行名を出させない（『不明の気』と書かれる事故を防ぐ）
export function partnerElementLine(pe) {
  if (isUnknownElements(pe)) {
    return "相手の気：生年月日が分からないため不明。年代と今のご様子から見立てる。相手の五行・命式・十神は作らない（『不明の気』とも書かない）。";
  }
  return `相手の気：${pe.primary}×${pe.secondary}`;
}

export function userElementLine(ue) {
  if (isUnknownElements(ue)) {
    return "本人の気：不明。五行・命式は作らず、入力と今のご様子から見立てる。";
  }
  return `本人の気：${ue.primary}×${ue.secondary}`;
}

// 事実の扱い（捏造防止）と呼び方
export const FACT_RULES = [
  "■事実の扱い（最重要）",
  "・入力に書かれていない出来事・回数・日数・相手の言動は作らない。数字は入力にある時だけ使う。",
  "・入力に無い困りごと（返信が遅い、未読、既読無視など）を足さない。占いの見立ては「〜しやすい」「〜かもしれません」の形で書く。",
  "・MBTIが不明な人の性格タイプには触れない。",
  "・相手の呼び方は「お相手」。「お相手様」「彼様」「彼女様」は使わない（文中で「彼」「彼女」と書くのはよい）。",
];

// 無料鑑定で出した吉・凶・一手（有料版と食い違わないように渡す）
export function freeSummaryLines(d) {
  const s = d?.free_summary;
  if (!s) return [];
  return [
    "",
    "■無料鑑定で伝えた内容（矛盾させない）",
    `・今週の吉：${s["吉"] ?? "不明"}`,
    `・今週の凶：${s["凶"] ?? "不明"}`,
    `・今週の一手（無料版では伏せたもの）：${s["一手"] ?? "不明"}`,
  ];
}
