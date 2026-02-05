export default async function handler(req, res){
  if(req.method!=="POST") return res.status(405).json({error:"method"});
  const { mode, intake } = req.body || {};
  if(!mode || !intake) return res.status(400).json({error:"bad request"});

  const system = `
あなたは「占いばあや」。上品な敬語（京寄り）。
未来は断言せず「傾向＋推奨」。不確実性は丁寧に。
ミニ鑑定は断定7割+保険3割。箇条書き3点＋確認1文。
無料レポは約800字。「吉」「凶」「一手」を必ず含める。
`;

  const prompt = buildPrompt(mode, intake);

  // TODO: ここをあなたの既存のOpenAI呼び出しに置換
  const out = await callLLM(system, prompt);

  if(mode==="free_report") return res.status(200).json({ html: out });
  return res.status(200).json({ text: out });
}

function buildPrompt(mode, intake){
  const u=intake.user, p=intake.partner, c=intake.concern, d=intake.derived;
  if(mode==="mini_user"){
    return `本人ミニ鑑定を作成。
形式：箇条書き3点＋最後に「心当たりはございますか？」
200〜260字。
情報：生年月日=${u.birthday}, 時刻=${u.birth_time??"不明"}, 出生地=${u.birth_prefecture}, MBTI=${u.mbti??"不明"}`;
  }
  if(mode==="mini_partner"){
    return `相手ミニ鑑定を作成。
形式：箇条書き3点＋最後に「近いでしょうか？」
200〜260字。
情報：生年月日=${p.birthday??"不明"}, 年代=${p.age_range??"不明"}, 時刻=${p.birth_time??"不明"}, MBTI=${p.mbti??"不明"}, 関係=${p.relation}, 直近=${p.recent_event}`;
  }
  if(mode==="free_report"){
    return `無料鑑定（HTML）を作成。
約800字。構成：現状占断 / 7日以内の流れ / 吉・凶・一手 / 有料版で増える内容（箇条書き）
未来は傾向＋推奨。上品な敬語（占いばあや）。
参照：本人ミニ=${d.user_mini_reading||""} / 相手ミニ=${d.partner_mini_reading||""}
本人=${JSON.stringify(u)} 相手=${JSON.stringify(p)} 悩み=${c.free_text}`;
  }
  return `unsupported mode: ${mode}`;
}
