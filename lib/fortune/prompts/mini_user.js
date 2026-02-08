// /lib/fortune/prompts/mini_user.js

export function promptMiniUser(intake) {
  const u = intake.user || {};
  const d = intake.derived || {};
  const ue = d.user_elements || { primary: "火", secondary: "金" };
  const userPair = `${ue.primary}×${ue.secondary}`;

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
    "・抽象だけにせず、口癖や行動のクセが浮かぶ具体例を入れる。",
    "・最後は必ず『……心当たりはございますでしょうか？』で終える。",
    "",
    `入力：生年月日=${u.birthday ?? "不明"} / 出生時刻=${u.birth_time ?? "不明"} / 出生地=${u.birth_prefecture ?? "不明"} / MBTI=${u.mbti ?? "不明"}`,
    `指定の気：${userPair}`,
  ].join("\n");
}
