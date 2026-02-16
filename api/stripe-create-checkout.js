// /api/stripe-create-checkout.js
import Stripe from "stripe";
import { clientIds, sha256 } from "../lib/identify.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    mustEnv("STRIPE_SECRET_KEY");
    const appUrl = mustEnv("PUBLIC_APP_URL");

    // body parse（環境で req.body が string のことがある）
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); }
      catch { return res.status(400).json({ error: "Invalid JSON body" }); }
    }

    const { plan, intake } = body || {};
    if (!plan || !["480", "980", "1980"].includes(String(plan))) {
      return res.status(400).json({ error: "plan must be 480, 980, or 1980" });
    }

    // priceId はサーバー側で選ぶ（フロントに渡す必要なし）
    const PRICE_ENV = { "480": "STRIPE_PRICE_480", "980": "STRIPE_PRICE_980", "1980": "STRIPE_PRICE_1980" };
    const priceId = mustEnv(PRICE_ENV[String(plan)]);

    // ユーザー識別（あなたの仕組みに合わせる）
    const ids = clientIds(req, intake || {});
    const sessionHash = ids.sessionHash;
    const ipHash = ids.ipHash;

    // intake の要点を署名（任意：あとで突合に使える）
    const intakeSig = sha256(JSON.stringify({
      v: intake?.version,
      user: intake?.user,
      partner: intake?.partner,
      concern: intake?.concern,
      persona: intake?.persona,
    }));

    const successUrl = `${appUrl}/fortune.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/fortune.html?canceled=1`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // ここ重要：Webhook側で KV に権利付与するための情報
      metadata: {
        plan: String(plan),
        sessionHash: String(sessionHash || ""),
        ipHash: String(ipHash || ""),
        intakeSig: String(intakeSig || ""),
      },
    });

    return res.status(200).json({
      url: session.url,
      id: session.id,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "FUNCTION_INVOCATION_FAILED" });
  }
}
