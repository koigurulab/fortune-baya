// /lib/fortune/format.js

export function normalizeModelOutput(mode, content) {
  if (mode === "free_report") {
    return { format: "html", content };
  }
  return { format: "text", content };
}
