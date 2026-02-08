// /lib/fortune/prompts/paid_980.js

export function promptPaid980(intake) {
  const p = intake.partner || {};
  const c = intake.concern || {};
  const d = intake.derived || {};
  const ue = d.user_elements || { primary: "火", secondary: "金" };
  const pe = d.partner_elements || { primary: "水", secondary: "木" };

  const userPair = `${ue.primary}×${ue.secondary}`;
  const partnerPair = `${pe.primary}×${pe.secondary}`;

  return [
    "【980円版（テキスト）】",
    "",
    "■文字数",
    "- 日本語で3500〜4500字。",
    "",
    "■狙い",
    "- 1ヶ月スパンの流れを“占いとして”語りつつ、分岐点・相手の本音が出やすいタイミング・落とし穴を具体化する。",
    "",
    "■構成（固定）",
    "1) 相性の深掘り（1000字前後）",
    "2) 1ヶ月の運勢（週ごと：第1週〜第4週）",
    "3) 相手の本音が出やすいタイミング（3パターン）",
    "4) 分岐点（2つ）と、その見極めサイン",
    "5) 具体的な一手（1つだけ）＋送信文テンプレ（1つ）",
    "6) 避けるべき落とし穴（3つ）",
    "7) 吉・凶・一手",
    "",
    "■占いの出し方",
    "- 五行は“説明”しない。比喩として軽く。",
    "- バーナム効果：ユーザー側/相手側ともに最低5つずつ散らす。",
    "- 断言は避けるが、現実的な見立ては必ず出す（期待だけで濁さない）。",
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
