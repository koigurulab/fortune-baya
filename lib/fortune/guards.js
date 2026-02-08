// /lib/fortune/guards.js

export function getApiKeyOrThrow() {
  const rawKey = process.env.OPENAI_API_KEY;
  if (!rawKey) {
    const err = new Error("Missing OPENAI_API_KEY");
    err.statusCode = 500;
    throw err;
  }
  const apiKey = rawKey.trim();

  // printable ASCII only (your original guard)
  const badPositions = [];
  for (let i = 0; i < apiKey.length; i++) {
    const code = apiKey.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) badPositions.push({ index: i, code });
  }
  if (badPositions.length > 0) {
    const err = new Error("OPENAI_API_KEY has invalid characters");
    err.statusCode = 500;
    err.badPositions = badPositions;
    err.length = apiKey.length;
    throw err;
  }

  return apiKey;
}
