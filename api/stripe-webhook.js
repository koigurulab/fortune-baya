// /api/stripe-webhook.js
import Stripe from "stripe";
import { kvSet } from "../lib/kv.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// Webhookは「生のボディ」が必要なので自前で読む
async function readRawBody(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method not allowed");

    mustEnv("STRIPE_SECRET_KEY");
    const webhookSecret = mustEnv("STRIPE_WEBHOOK_SECRET");

    const sig = req.headers["stripe-signature"];
    if (!sig) return res.status(400).send("Missing stripe-signature");

    const raw = await readRawBody(req);

    let event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
    } catch (e) {
      console.error("Webhook signature verify failed:", e?.message);
      return res.status(400).send("Invalid signature");
    }

    // 支払い完了イベント
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // metadata からキーを復元
      const plan = session?.metadata?.plan;
      const sessionHash = session?.metadata?.sessionHash;

      // 念のため：支払い済みだけ通す
      const paid = session?.payment_status === "paid";
      if (paid && plan && sessionHash) {
        const payload = {
          plan: String(plan),
          sessionId: session.id,
          paidAt: new Date().toISOString(),
        };

        // 24h 権利（あなたの要件：24h以内に再訪したら再表示できる）
        await kvSet(`paid:ent:${sessionHash}`, JSON.stringify(payload), { ex: 60 * 60 * 24 });

        // セッションID→権利も残しておく（verify用途・遅延対策）
        await kvSet(`paid:sess:${session.id}`, JSON.stringify(payload), { ex: 60 * 60 * 26 });
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send("FUNCTION_INVOCATION_FAILED");
  }
}
