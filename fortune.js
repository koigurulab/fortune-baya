const STORAGE_KEY = "fortune_intake_v1_1";

const STATES = {
  ASK_USER_BDAY: "ASK_USER_BDAY",
  ASK_USER_BTIME: "ASK_USER_BTIME",
  ASK_USER_PREF: "ASK_USER_PREF",
  ASK_USER_MBTI: "ASK_USER_MBTI",
  MINI_READ_USER: "MINI_READ_USER",
  ASK_PARTNER_BDAY: "ASK_PARTNER_BDAY",
  ASK_PARTNER_AGE_RANGE: "ASK_PARTNER_AGE_RANGE",
  ASK_PARTNER_BTIME: "ASK_PARTNER_BTIME",
  ASK_PARTNER_MBTI: "ASK_PARTNER_MBTI",
  ASK_RELATION: "ASK_RELATION",
  ASK_RECENT_EVENT: "ASK_RECENT_EVENT",
  MINI_READ_PARTNER: "MINI_READ_PARTNER",
  ASK_CONCERN_LONG: "ASK_CONCERN_LONG",
  FREE_REPORT: "FREE_REPORT",
  DONE: "DONE",
};

function newIntake(){
  return {
    version: "1.1",
    persona: {
      name: "占いばあや",
      tone: "polite_kyoto",
      forecast_style: "tendency_and_recommendation",
      free_report_length_chars: 800,
      must_output: ["吉","凶","一手"]
    },
    user: { birthday:null, birth_time:null, birth_prefecture:null, mbti:null },
    partner: { birthday:null, birth_time:null, mbti:null, age_range:null, relation:null, recent_event:null },
    concern: { free_text:null },
    derived: { user_mini_reading:null, partner_mini_reading:null },
    meta: { session_id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  };
}

let intake = loadIntake();
let state = STATES.ASK_USER_BDAY;

const chatEl = document.getElementById("chat");
const formEl = document.getElementById("form");
const inputEl = document.getElementById("input");
const resetBtn = document.getElementById("reset");

resetBtn.addEventListener("click", ()=>{
  localStorage.removeItem(STORAGE_KEY);
  intake = newIntake();
  state = STATES.ASK_USER_BDAY;
  chatEl.innerHTML = "";
  boot();
});

formEl.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const v = inputEl.value.trim();
  if(!v) return;
  pushUser(v);
  inputEl.value = "";

  const ok = applyAnswer(state, v);
  if(!ok){
    pushBot("恐れ入ります。形式が少し違うようです。もう一度、例に沿って教えてくださいませ。");
    return;
  }

  await advance();
});

function boot(){
  pushBot("こんばんは。占いばあやでございます。ひとつずつ伺いますね。");
  ask(state);
}
boot();

function ask(s){
  const q = questionFor(s);
  if(q) pushBot(q);
}

function questionFor(s){
  switch(s){
    case STATES.ASK_USER_BDAY: return "まず、あなた様の生年月日を西暦でお教えくださいませ。（例：2003/01/07）";
    case STATES.ASK_USER_BTIME: return "出生時刻が分かればお教えくださいませ。不明でも大丈夫でございます。（例：05:15 / 不明）";
    case STATES.ASK_USER_PREF: return "お生まれの都道府県をお伺いしてもよろしいですか。";
    case STATES.ASK_USER_MBTI: return "MBTIは何型でしょう？（例：ENTJ）分からなければ“不明”で結構です。";
    case STATES.ASK_PARTNER_BDAY: return "次にお相手様です。生年月日（西暦）は分かりますか？分からなければ“不明”で大丈夫でございます。";
    case STATES.ASK_PARTNER_AGE_RANGE: return "では差し支えなければ、お相手様の年代だけ。（例：20代前半／20代後半／30代前半）";
    case STATES.ASK_PARTNER_BTIME: return "出生時刻が分かればお教えくださいませ。不明で結構です。";
    case STATES.ASK_PARTNER_MBTI: return "お相手様のMBTIは分かりますか？分からなければ“たぶん〇〇っぽい”でも結構です。";
    case STATES.ASK_RELATION: return "いまの関係性を、ひとことで。（片想い／交際中／曖昧／復縁など、自由で結構です）";
    case STATES.ASK_RECENT_EVENT: return "直近で起きた出来事を、短くで。（例：3日前に既読のまま／先週会った など）";
    case STATES.ASK_CONCERN_LONG: return "最後に、いちばん知りたいことを伺います。何に悩んでおられて、どうなりたいですか？長くて構いません。迷ったら、①直近の事実②不安③理想④期限 の順にお書きくださいませ。";
    default: return null;
  }
}

function applyAnswer(s, v){
  try{
    if(s===STATES.ASK_USER_BDAY){ if(!isDate(v)) return false; intake.user.birthday=normDate(v); }
    if(s===STATES.ASK_USER_BTIME){ if(!isTimeOrUnknown(v)) return false; intake.user.birth_time=normTimeOrNull(v); }
    if(s===STATES.ASK_USER_PREF){ if(v.length<2) return false; intake.user.birth_prefecture=v; }
    if(s===STATES.ASK_USER_MBTI){ if(!isMbtiOrUnknown(v)) return false; intake.user.mbti=normMbtiOrNull(v); }

    if(s===STATES.ASK_PARTNER_BDAY){ intake.partner.birthday=normDateOrNull(v); }
    if(s===STATES.ASK_PARTNER_AGE_RANGE){ if(v.length<3) return false; intake.partner.age_range=v; }
    if(s===STATES.ASK_PARTNER_BTIME){ if(!isTimeOrUnknown(v)) return false; intake.partner.birth_time=normTimeOrNull(v); }
    if(s===STATES.ASK_PARTNER_MBTI){ if(v.length<2) return false; intake.partner.mbti=v; }
    if(s===STATES.ASK_RELATION){ if(v.length<2) return false; intake.partner.relation=v; }
    if(s===STATES.ASK_RECENT_EVENT){ if(v.length<2) return false; intake.partner.recent_event=v; }
    if(s===STATES.ASK_CONCERN_LONG){ if(v.length<30) return false; intake.concern.free_text=v; }

    intake.meta.updated_at=new Date().toISOString();
    saveIntake(intake);
    return true;
  }catch(e){
    return false;
  }
}

async function advance(){
  if(state===STATES.ASK_USER_BDAY){ state=STATES.ASK_USER_BTIME; ask(state); return; }
  if(state===STATES.ASK_USER_BTIME){ state=STATES.ASK_USER_PREF; ask(state); return; }
  if(state===STATES.ASK_USER_PREF){ state=STATES.ASK_USER_MBTI; ask(state); return; }
  if(state===STATES.ASK_USER_MBTI){
    state=STATES.MINI_READ_USER;
    pushBot("少々お待ちくださいませ…");
    const out = await generate("mini_user", intake);
    intake.derived.user_mini_reading = out.text;
    saveIntake(intake);
    pushBot(out.text);
    state=STATES.ASK_PARTNER_BDAY; ask(state); return;
  }

  if(state===STATES.ASK_PARTNER_BDAY){
    state = intake.partner.birthday ? STATES.ASK_PARTNER_BTIME : STATES.ASK_PARTNER_AGE_RANGE;
    ask(state); return;
  }
  if(state===STATES.ASK_PARTNER_AGE_RANGE){ state=STATES.ASK_PARTNER_BTIME; ask(state); return; }
  if(state===STATES.ASK_PARTNER_BTIME){ state=STATES.ASK_PARTNER_MBTI; ask(state); return; }
  if(state===STATES.ASK_PARTNER_MBTI){ state=STATES.ASK_RELATION; ask(state); return; }
  if(state===STATES.ASK_RELATION){ state=STATES.ASK_RECENT_EVENT; ask(state); return; }
  if(state===STATES.ASK_RECENT_EVENT){
    state=STATES.MINI_READ_PARTNER;
    pushBot("ありがとうございます。お相手様の気配を拝見いたしますね…");
    const out = await generate("mini_partner", intake);
    intake.derived.partner_mini_reading = out.text;
    saveIntake(intake);
    pushBot(out.text);
    state=STATES.ASK_CONCERN_LONG; ask(state); return;
  }

  if(state===STATES.ASK_CONCERN_LONG){
    pushBot("承りました。では、無料の鑑定をお渡しします。");
    const out = await generate("free_report", intake);
    pushBotHtml(out.html);
    state=STATES.DONE;
    pushBot("この先は、詳しい鑑定（有料）もお作りできます。まずはここまで、いかがでしたか。");
  }
}

async function generate(mode, intake){
  const res = await fetch("/api/fortune-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, intake })
  });

  // 失敗時：本文をそのまま吐いて原因特定しやすくする
  if (!res.ok) {
    const errText = await res.text();
    console.error("fortune-generate error:", errText);
    throw new Error(errText);
  }

  // 成功時：JSONで返ってくる（mini_user/mini_partner: {text}, free_report: {html}）
  return await res.json();
}

// UI helpers
function pushBot(t){ chatEl.insertAdjacentHTML("beforeend", `<div class="msg bot">${escapeHtml(t)}</div>`); chatEl.scrollTop=chatEl.scrollHeight; }
function pushBotHtml(html){ chatEl.insertAdjacentHTML("beforeend", `<div class="msg bot">${html}</div>`); chatEl.scrollTop=chatEl.scrollHeight; }
function pushUser(t){ chatEl.insertAdjacentHTML("beforeend", `<div class="msg user">${escapeHtml(t)}</div>`); chatEl.scrollTop=chatEl.scrollHeight; }

function saveIntake(itk){ localStorage.setItem(STORAGE_KEY, JSON.stringify(itk)); }
function loadIntake(){ const s=localStorage.getItem(STORAGE_KEY); return s? JSON.parse(s) : newIntake(); }

// validators
function isDate(v){ return /^\d{4}[\/-]\d{2}[\/-]\d{2}$/.test(v.trim()); }
function normDate(v){ return v.trim().replaceAll("/", "-"); }
function normDateOrNull(v){ const t=v.trim(); if(!t||t==="不明") return null; return normDate(t); }
function isTimeOrUnknown(v){ const t=v.trim(); if(t==="不明"||t==="unknown") return true; return /^([01]\d|2[0-3]):[0-5]\d$/.test(t); }
function normTimeOrNull(v){ const t=v.trim(); if(!t||t==="不明"||t==="unknown") return null; return t; }
function isMbtiOrUnknown(v){ const t=v.trim().toUpperCase(); if(t==="不明"||t==="UNKNOWN") return true; return /^[EI][NS][TF][JP]$/.test(t); }
function normMbtiOrNull(v){ const t=v.trim().toUpperCase(); if(t==="不明"||t==="UNKNOWN"||!t) return null; return t; }

function escapeHtml(s){
  return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
