// /lib/fortune/prompts/mini_partner.js
import { isUnknownElements, FACT_RULES } from "./common.js";

export function promptMiniPartner(intake) {
  const p = intake.partner || {};
  const d = intake.derived || {};
  const pe = d.partner_elements || { primary: "不明", secondary: "不明" };
  const known = !isUnknownElements(pe);

  const opening = known
    ? `かしこまりました。{生年月日}{出生時刻のニュアンス}ご誕生の気配を拝見いたしますと、お相手様は${pe.primary === pe.secondary ? `『${pe.primary}の気』が二重に重なる方` : `『${pe.primary}の気』と『${pe.secondary}の気』が同時に立つ方`}でございます。`
    : `かしこまりました。お相手様の生年月日は分からないとのことですので、${p.age_range ? "{年代}という年頃と、" : ""}今のご様子から気配を読ませていただきますね。`;

  return [
    "相手のミニ鑑定を書いてください。",
    "文字数：日本語で500〜700字（スマホで読み切れる長さ）。",
    "形式：次の順で6つ。各セクションは『キャッチコピー1行＋本文1〜2文』。セクションの間は空行を1行。",
    "表面 / 内側 / 恋愛や対人 / あなた様への向き合い方 / 弱点 / まとめ",
    "",
    "冒頭は必ずこの形：",
    opening,
    known ? "" : "・生年月日が分からないので、五行名（〇〇の気）は書かない。言い切りすぎず『そんな傾向が出やすい』くらいにする。",
    "",
    "書き方のコツ：",
    "・関係性と直近の出来事を、説明くさくならないように1回だけ自然に入れる。",
    "・『あなた様への向き合い方』では、お相手様があなた様をどう感じていそうかを、ほのめかす程度に書く（答えを言い切らない。続きは無料鑑定で読む）。",
    "・最後は問いかけで終えない（この後すぐ次の質問に進むため）。『……ばあやには、そう見えておりますよ。』のような言い切りで終える。",
    "",
    ...FACT_RULES,
    "",
    `入力：生年月日=${p.birthday ?? "不明"} / 年代=${p.age_range ?? "不明"} / 出生時刻=${p.birth_time ?? "不明"} / MBTI=${p.mbti ?? "不明"} / 関係性=${p.relation ?? "不明"} / 直近=${p.recent_event ?? "不明"}`,
    known ? `指定の気：${pe.primary}×${pe.secondary}` : "指定の気：不明（五行名は書かない）",
  ].join("\n");
}
