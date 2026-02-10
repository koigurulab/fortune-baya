// /lib/kv.js
const URL = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

function mustEnv() {
  if (!URL || !TOKEN) throw new Error("Missing KV_REST_API_URL or KV_REST_API_TOKEN");
}

async function kvFetch(path) {
  mustEnv();
  const res = await fetch(`${URL}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`KV error ${res.status}: ${t}`);
  }
  return res.json(); // { result: ... }
}

// Upstash REST: /get/<key>, /set/<key>/<value>?ex=.. , /incr/<key> , /expire/<key>/<sec> , /ttl/<key>
export async function kvGet(key) {
  const j = await kvFetch(`/get/${encodeURIComponent(key)}`);
  return j.result ?? null;
}
export async function kvSet(key, value, { ex } = {}) {
  const q = ex ? `?ex=${ex}` : "";
  const j = await kvFetch(`/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}${q}`);
  return j.result;
}
export async function kvIncr(key) {
  const j = await kvFetch(`/incr/${encodeURIComponent(key)}`);
  return j.result; // number
}
export async function kvExpire(key, seconds) {
  const j = await kvFetch(`/expire/${encodeURIComponent(key)}/${seconds}`);
  return j.result; // 1/0
}
