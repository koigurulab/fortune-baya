// /lib/identify.js
import crypto from "crypto";

const SALT = process.env.RATE_LIMIT_SALT || "change-me";

export function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.length) return real.trim();
  return "0.0.0.0";
}

export function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function clientIds(req, intake) {
  const ip = getClientIp(req);
  const ua = (req.headers["user-agent"] || "").toString();
  const session = intake?.meta?.session_id || "";
  return {
    ipHash: sha256(`ip:${ip}:${SALT}`),
    sessionHash: sha256(`sess:${session}:${SALT}`),
    uaHash: sha256(`ua:${ua}:${SALT}`),
  };
}

// JST日付（YYYY-MM-DD）
export function jstDay() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}
