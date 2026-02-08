// /api/fortune-generate.js
import { generateFortune } from "../lib/fortune/index.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // body parse（環境差で req.body が string のことがあるので保険）
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
      }
    }

    const { mode, intake } = body || {};
    if (!mode || !intake) {
      return res.status(400).json({ error: "mode and intake are required" });
    }

    const out = await generateFortune({ mode, intake, req });

    if (out.format === "html") return res.status(200).json({ html: out.content });
    return res.status(200).json({ text: out.content });
  } catch (err) {
    const msg = String(err?.stack || err);
    const isTimeout = msg.includes("AbortError") || msg.includes("aborted");
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? "Upstream timeout" : "Unexpected server error",
      detail: msg.slice(0, 2000),
    });
  }
}
