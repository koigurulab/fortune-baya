// /api/stripe-verify.js
import Stripe from "stripe";
import { kvGet, kvSet } from "../lib/kv.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    mustEnv("STRIPE_SECRET_KEY");

    const sessionId = req.query?.session_id;
    if (!sessionId) return res.status(400).json({ error: "session_id is required" });

    // すでにKVにあるなら即返す
    const cached = await kvGet(`paid:sess:${sessionId}`);
    if (cached) {
      const p = JSON.parse(cached);
      return res.status(200).json({ ok: true, plan: p.plan, cached: true });
    }

    const s = await stripe.checkout.sessions.retrieve(String(sessionId));

    if (s?.payment_status !== "paid") {
      return res.status(402).json({ ok: false, error: "NOT_PAID" });
    }

    const plan = s?.metadata?.plan;
    const sessionHash = s?.metadata?.sessionHash;

    if (!plan || !sessionHash) {
      return res.status(400).json({ ok: false, error: "MISSING_METADATA" });
    }

    const payload = {
      plan: String(plan),
      sessionId: s.id,
      paidAt: new Date().toISOString(),
    };

    // entitlement付与（Webhookと同じことをここでもやる＝遅延吸収）
    await kvSet(`paid:ent:${sessionHash}`, JSON.stringify(payload), { ex: 60 * 60 * 24 });
    await kvSet(`paid:sess:${s.id}`, JSON.stringify(payload), { ex: 60 * 60 * 26 });

    return res.status(200).json({ ok: true, plan: String(plan), cached: false });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "FUNCTION_INVOCATION_FAILED" });
  }
}
