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

export function normalizeModelOutput(mode, content) {
  const fixed = fixHonorifics(content);
  if (mode === "free_report") {
    return { format: "html", content: fixed };
  }
  return { format: "text", content: fixed };
}
