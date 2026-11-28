// /lib/fortune/prompts/mini_user.js
import { isUnknownElements, FACT_RULES } from "./common.js";

export function promptMiniUser(intake) {
  const u = intake.user || {};
  const d = intake.derived || {};
  const ue = d.user_elements || { primary: "不明", secondary: "不明" };
  const known = !isUnknownElements(ue);

  const opening = known
    ? `かしこまりました。{生年月日}{出生時刻のニュアンス}ご誕生の気配を拝見いたしますと、あなた様は${ue.primary === ue.secondary ? `『${ue.primary}の気』が二重に重なる方` : `『${ue.primary}の気』と『${ue.secondary}の気』が同時に立つ方`}でございます。`
    : "かしこまりました。あなた様の今のご様子から、気配を拝見いたしますね。";

  return [
    "本人のミニ鑑定を書いてください。",
    "文字数：日本語で500〜700字（スマホで読み切れる長さ）。",
    "形式：次の順で6つ。各セクションは『キャッチコピー1行＋本文1〜2文』。セクションの間は空行を1行。",
    "表面 / 内側 / 恋愛や対人 / 強み / 弱点 / まとめ",
    "",
    "冒頭は必ずこの形：",
    opening,
    known ? "次の1文で、二つの気を短く説明（例：火＝始める、金＝分ける、など）。" : "",
    "",
    "書き方のコツ：",
    "・抽象だけにせず、口癖や行動のクセが浮かぶ具体例を入れる。",
    "・ほめるだけにしない。本人が人に言っていない本音を1つ、やさしく言い当てる（例：本当は〇〇なのに、〇〇なふりをしてしまう）。",
    "・最後は問いかけで終えない（この後すぐ次の質問に進むため）。『……ばあやには、そう見えておりますよ。』のような言い切りで終える。",
    "",
    ...FACT_RULES,
    "",
    `入力：生年月日=${u.birthday ?? "不明"} / 出生時刻=${u.birth_time ?? "不明"} / 出生地=${u.birth_prefecture ?? "不明"} / MBTI=${u.mbti ?? "不明"}`,
    known ? `指定の気：${ue.primary}×${ue.secondary}` : "指定の気：不明（五行名は書かない）",
  ].filter((l) => l !== null).join("\n");
}
