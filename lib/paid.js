// /lib/paid.js
// KVに支払い権利が見つからない（またはKV障害）ときの予備ルート。
// Stripe の Checkout Session を直接確認して権利を判定する。
import Stripe from "stripe";

// KVの権利付与は24時間。セッション作成から決済までの時間を見込んで少し長めにする。
const MAX_AGE_SEC = 60 * 60 * 26;
const SESSION_ID_RE = /^cs_(live|test)_[A-Za-z0-9]+$/;

export async function verifyStripeEntitlement(stripeSessionId, sessionHash) {
  const id = String(stripeSessionId || "");
  if (!SESSION_ID_RE.test(id) || !sessionHash) return null;
  if (!process.env.STRIPE_SECRET_KEY) return null;

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.retrieve(id);

    if (s?.payment_status !== "paid") return null;
    if (!s?.metadata?.plan) return null;
    if (s.metadata.sessionHash !== sessionHash) return null;

    const ageSec = Date.now() / 1000 - Number(s.created || 0);
    if (ageSec > MAX_AGE_SEC) return null;

    return { plan: String(s.metadata.plan), sessionId: s.id };
  } catch (e) {
    console.warn("[paid] stripe verify failed:", e?.message || e);
    return null;
  }
}
