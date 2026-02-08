// /lib/fortune/openaiClient.js

export async function callChatCompletions({
  apiKey,
  model,
  system,
  prompt,
  maxTokens,
  temperature,
  timeoutMs = 120000,
  requestId = "",
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });

    if (!openaiRes.ok) {
      const text = await openaiRes.text();
      const err = new Error(`OpenAI API error (status ${openaiRes.status})`);
      err.statusCode = 500;
      err.openaiStatus = openaiRes.status;
      err.openaiBody = text.slice(0, 2000);
      err.requestId = requestId;
      throw err;
    }

    const data = await openaiRes.json();
    const content =
      data?.choices?.[0]?.message?.content ||
      "すみませんね。ちょっと電波が乱れたみたいです。もう一回だけお願いできますか？";

    return content;
  } catch (err) {
    // AbortController timeout
    const msg = String(err?.stack || err);
    if (msg.includes("AbortError") || msg.includes("aborted")) {
      const e = new Error("Upstream timeout");
      e.statusCode = 504;
      e.detail = msg.slice(0, 2000);
      e.requestId = requestId;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
