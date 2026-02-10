// /lib/kv.js
const URL = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

function mustEnv() {
  if (!URL || !TOKEN) throw new Error("Missing KV_REST_API_URL or KV_REST_API_TOKEN");
}

async function kvPipeline(commands) {
  mustEnv();
  const res = await fetch(`${URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`KV error ${res.status}: ${t}`);
  }
  return res.json(); // [{result:...}, ...]
}

async function kvRun(cmd) {
  const out = await kvPipeline([cmd]);
  return out?.[0]?.result ?? null;
}

export async function kvGet(key) {
  return kvRun(["GET", key]);
}

export async function kvSet(key, value, { ex } = {}) {
  if (ex) return kvRun(["SET", key, value, "EX", String(ex)]);
  return kvRun(["SET", key, value]);
}

export async function kvIncr(key) {
  const r = await kvRun(["INCR", key]);
  return Number(r);
}

export async function kvExpire(key, seconds) {
  const r = await kvRun(["EXPIRE", key, String(seconds)]);
  return Number(r);
}

export async function kvDel(key) {
  const r = await kvRun(["DEL", key]);
  return Number(r);
}
