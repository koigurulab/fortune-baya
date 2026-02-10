// /lib/fortune/prompts/mini_partner.js

export function promptMiniPartner(intake) {
  const p = intake.partner || {};
  const d = intake.derived || {};
  const pe = d.partner_elements || { primary: "不明", secondary: "不明" };
  const partnerPair = `${pe.primary}×${pe.secondary}`;

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
