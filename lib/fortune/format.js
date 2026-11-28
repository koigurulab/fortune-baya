// /lib/fortune/format.js

// モデルが指示を無視して書きがちな呼び方を直す（「彼様」は不自然、「あなた様」「お相手様」は旧口調）
function fixHonorifics(text) {
  return String(text ?? "")
    .replace(/彼女様/g, "お相手")
    .replace(/彼氏様/g, "お相手")
    .replace(/彼様/g, "お相手")
    .replace(/お相手様/g, "お相手")
    .replace(/あなた様/g, "貴方");
}

// 旧口調（でございます・くださいませ等）が混ざるので、ばあやの口調に寄せる。
// 「ありがとうございます」は残す。
function fixVoice(text) {
  return String(text ?? "")
    .replace(/でございますわ/g, "ですわ")
    .replace(/でございます/g, "です")
    .replace(/ございません/g, "ありません")
    .replace(/くださいませ/g, "くださいね")
    .replace(/(拝見|お祈り|お伝え|お渡し|ご案内)いたします/g, "$1します")
    .replace(/いたしますと/g, "しますと")
    .replace(/ております/g, "ています")
    .replace(/ておりました/g, "ていました");
}

export function normalizeModelOutput(mode, content) {
  const fixed = fixVoice(fixHonorifics(content));
  if (mode === "free_report") {
    return { format: "html", content: fixed };
  }
  return { format: "text", content: fixed };
}
