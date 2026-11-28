// /lib/fortune/format.js

// モデルが指示を無視して書きがちな呼び方を直す（「彼様」「彼女様」は日本語として不自然）
function fixHonorifics(text) {
  return String(text ?? "")
    .replace(/彼女様/g, "お相手様")
    .replace(/彼氏様/g, "お相手様")
    .replace(/彼様/g, "お相手様");
}

export function normalizeModelOutput(mode, content) {
  const fixed = fixHonorifics(content);
  if (mode === "free_report") {
    return { format: "html", content: fixed };
  }
  return { format: "text", content: fixed };
}
