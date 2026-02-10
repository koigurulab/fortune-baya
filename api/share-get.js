// /api/share-get.js
import { kvGet } from "../lib/kv.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const token = (req.query?.token || "").toString();
    if (!/^[0-9a-f]{32}$/.test(token)) {
      return res.status(400).json({ error: "invalid token" });
    }

    const key = `share:${token}`;
    const raw = await kvGet(key);
    if (!raw) return res.status(404).json({ error: "not found" });

    // rawはJSON文字列
    const data = JSON.parse(raw);
    return res.status(200).json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "FUNCTION_INVOCATION_FAILED" });
  }
}
