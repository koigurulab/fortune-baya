export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    hasKey: !!process.env.OPENAI_API_KEY,
    keyLen: (process.env.OPENAI_API_KEY || "").trim().length
  });
}
