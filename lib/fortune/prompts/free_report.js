// /lib/fortune/prompts/free_report.js

export function promptFreeReport(intake) {
  const p = intake.partner || {};
  const c = intake.concern || {};
  const d = intake.derived || {};
  const ue = d.user_elements || { primary: "火", secondary: "金" };
  const pe = d.partner_elements || { primary: "水", secondary: "木" };

  const userPair = `${ue.primary}×${ue.secondary}`;
  const partnerPair = `${pe.primary}×${pe.secondary}`;

  return [
    "【無料レポート（テキスト出力）】",
    "",
    "■文字数",
    "- 日本語で1500〜2000字。",
    "",
    "■構成（固定）",
    "1) はじめに（2段落）",
    "2) 相性の核：縁の動きと重み（見出し＋3〜4段落）",
    "3) 今週の鍵：心の波紋と分岐点（見出し＋3〜4段落＋分岐は箇条書き可）",
    "4) 有料版のご案内（短め）",
    "",
    "■トーン",
    "- 常に敬語、ただし難しい言葉は禁止。やさしい言い切り。",
    "- 五行は説明しすぎない。必要な箇所で“味付け”として入れる（各セクション0〜1回目安）。",
    "- 『気・運・縁・流れ・間・余白』は自然に入れる。",
    "",
    "■濃さ（重要）",
    "- 相性と今週の鍵は“浅い一般論”にしない。",
    "- 心の動きを当てる（バーナム効果）：ユーザー側/相手側ともに“ありがち”を最低3つずつ、自然に散らす。",
    "",
    "■事実反映（一般ルール）",
    "- 入力から固有の事実（関係性/会った回数/期間/連絡状況/直近出来事/感情の揺れ）を最低3点入れる。",
    "- 数値（日数・回数）があれば最低1つ入れる。なければ“数日/しばらく/最近”で補う。",
    "- 返信がない＝脈なしと断言しないが、現実的な見立ては必ず入れる。",
    "",
    "■入力（材料）",
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
