
import crypto from "crypto";
import { kvSet } from "../lib/kv.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);

    const { format, content } = body || {};
    if (!format || !content) return res.status(400).json({ error: "format and content are required" });

    // サイズ上限（悪用防止・必要なら調整）
    if (String(content).length > 80_000) {
      return res.status(413).json({ error: "content too large" });
    }
    if (format !== "html" && format !== "text") {
      return res.status(400).json({ error: "invalid format" });
    }

    const token = crypto.randomBytes(16).toString("hex");
    const key = `share:${token}`;

    const payload = JSON.stringify({
      format,
      content,
      createdAt: new Date().toISOString(),
    });

    // 共有リンクのTTL（例：7日）
    await kvSet(key, payload, { ex: 60 * 60 * 24 * 7 });

    return res.status(200).json({ token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "FUNCTION_INVOCATION_FAILED" });
  }
}
