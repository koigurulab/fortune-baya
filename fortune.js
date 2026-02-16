// fortune.js (FULL) — 2026-02 (fixed + paid 24h reshow-only boot)
// Requirements
// 1) Before free report: show NO action buttons
// 2) After free: show ONLY 480/980 buttons (NO share)
// 3) After paid: show Copy/PDF/Show buttons (+ 480/980 can stay) (NO share)
// 4) If concern text is short: do NOT reject; ask follow-up, then generate
// 5) If duplicate ids exist: adopt ONLY the last paidActions; hide others
// 6) NEW: If user generated paid report within 24h and revisits, show ONLY "再表示" at boot.
//    After free report completes again, show 480/980 as usual.

/** GA4 tracking helper — safe no-op when gtag is blocked or not loaded */
function track(event, params){
  if(typeof window.gtag === "function") window.gtag("event", event, params);
}

const STORAGE_KEY = "fortune_intake_v1_3";
const FREE_LAST_KEY = "fortune_free_last_v1";
const PAID_LAST_KEY = "fortune_paid_last_v1";
const PAID_PENDING_KEY = "fortune_paid_pending_v1"; // for recovery

const TTL_PAID_MS = 24 * 60 * 60 * 1000; // 24h

function nowIso(){ return new Date().toISOString(); }
function isExpired(createdAtIso, ttlMs){
  if(!createdAtIso) return true;
  const t = Date.parse(createdAtIso);
  if(Number.isNaN(t)) return true;
  return (Date.now() - t) > ttlMs;
}

/** ====== DOM helper (duplicate id tolerant) ====== */
function qsAllById(id){
  try{
    return Array.from(document.querySelectorAll(`#${CSS.escape(id)}`));
  }catch{
    return Array.from(document.querySelectorAll(`#${id}`));
  }
}
function lastById(id){
  const arr = qsAllById(id);
  return arr.length ? arr[arr.length - 1] : null;
}
function hideAllButLastById(id){
  const arr = qsAllById(id);
  if(arr.length <= 1) return;
  for(let i=0;i<arr.length-1;i++){
    const el = arr[i];
    if(!el) continue;
    el.classList.add("is-hidden");
    el.hidden = true;
    el.style.display = "none";
  }
}
function setVisibleEl(el, visible){
  if(!el) return;
  if(visible) el.classList.remove("is-hidden");
  else el.classList.add("is-hidden");
  el.hidden = !visible;
  el.style.display = visible ? "" : "none";
}
function setVisibleAllById(id, visible){
  qsAllById(id).forEach(el => setVisibleEl(el, visible));
}
function setEnabledEl(el, enabled){
  if(!el) return;
  el.disabled = !enabled;
}
function bindClickEl(el, handler){
  if(!el) return;
  el.onclick = handler;
}

/** ====== Intake signature / storage ====== */
function intakeSig(it){
  return JSON.stringify({
    v: it?.version,
    user: it?.user,
    partner: it?.partner,
    concern: it?.concern,
  });
}
function normalizeOut(out){
  if(out?.html) return { format:"html", content: out.html };
  if(out?.text) return { format:"text", content: out.text };
  return { format:"text", content: String(out ?? "") };
}

function saveLastFree({ intake, outNorm }){
  const payload = {
    sig: intakeSig(intake),
    format: outNorm.format,
    content: outNorm.content,
    createdAt: nowIso(),
  };
  localStorage.setItem(FREE_LAST_KEY, JSON.stringify(payload));
  return payload;
}
function loadLastFree(){
  const s = localStorage.getItem(FREE_LAST_KEY);
  if(!s) return null;
  try{ return JSON.parse(s); }catch{ return null; }
}

function saveLastPaid({ mode, intake, outNorm }){
  const payload = {
    mode,
    sig: intakeSig(intake),
    format: outNorm.format,
    content: outNorm.content,
    createdAt: nowIso(),
  };
  localStorage.setItem(PAID_LAST_KEY, JSON.stringify(payload));
  return payload;
}
function loadLastPaid(){
  const s = localStorage.getItem(PAID_LAST_KEY);
  if(!s) return null;
  try{
    const p = JSON.parse(s);
    // paid TTL (24h)
    if(isExpired(p?.createdAt, TTL_PAID_MS)){
      localStorage.removeItem(PAID_LAST_KEY);
      return null;
    }
    return p;
  }catch{
    return null;
  }
}

function savePaidPending({ mode, intake }){
  const payload = { mode, intake, createdAt: nowIso() };
  localStorage.setItem(PAID_PENDING_KEY, JSON.stringify(payload));
  return payload;
}
function loadPaidPending(){
  const s = localStorage.getItem(PAID_PENDING_KEY);
  if(!s) return null;
  try{ return JSON.parse(s); }catch{ return null; }
}
function clearPaidPending(){
  localStorage.removeItem(PAID_PENDING_KEY);
}

function htmlToText(html){
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body?.innerText || "").trim();
}

async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch{
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  }
}

function printAsPdf({ title, html, text }){
  const w = window.open("", "_blank");
  if(!w) return;

  const contentHtml = html
    ? html
    : `<pre style="white-space:pre-wrap; font-family:inherit;">${escapeHtml(text || "")}</pre>`;

  w.document.open();
  w.document.write(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>${escapeHtml(title || "占いばあや｜鑑定")}</title>
<style>
  body{ font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Yu Gothic UI","Meiryo",sans-serif; margin:24px; }
  h1{ font-size:18px; margin:0 0 12px; }
  .meta{ font-size:12px; color:#555; margin-bottom:16px; }
</style>
</head>
<body>
  <h1>${escapeHtml(title || "占いばあや｜鑑定")}</h1>
  <div class="meta">生成日時: ${escapeHtml(nowIso())}</div>
  <div>${contentHtml}</div>
  <script>window.onload=()=>{ window.print(); };</script>
</body></html>`);
  w.document.close();
}

/** ====== UI show/hide policy ====== */
const DEV_PAID = new URLSearchParams(location.search).get("dev_paid") === "1";

function initActionBlocks(){
  // Use only last paidActions, hide others
  hideAllButLastById("paidActions");
  // freeActions is not used (share removed)
  setVisibleAllById("freeActions", false);

  const paidBox = lastById("paidActions");

  const btn480 = (paidBox && paidBox.querySelector("#btnPaid480")) || lastById("btnPaid480");
  const btn980 = (paidBox && paidBox.querySelector("#btnPaid980")) || lastById("btnPaid980");
  const btnCopy = (paidBox && paidBox.querySelector("#btnPaidCopy")) || lastById("btnPaidCopy");
  const btnPdf  = (paidBox && paidBox.querySelector("#btnPaidPdf"))  || lastById("btnPaidPdf");
  const btnShow = (paidBox && paidBox.querySelector("#btnPaidShow")) || lastById("btnPaidShow");
  const btnShare= (paidBox && paidBox.querySelector("#btnPaidShare"))|| lastById("btnPaidShare");
  const note    = (paidBox && paidBox.querySelector("#paidActionsNote")) || lastById("paidActionsNote");

  // Hide everything initially
  setVisibleEl(paidBox, false);
  setVisibleEl(btn480, false);
  setVisibleEl(btn980, false);
  setVisibleEl(btnCopy, false);
  setVisibleEl(btnPdf,  false);
  setVisibleEl(btnShow, false);
  setVisibleEl(btnShare,false);
  setVisibleEl(note,    false);

  // Label
  if(btnCopy) btnCopy.textContent = "占い結果を文章としてコピー";
  if(btnPdf)  btnPdf.textContent  = "占い結果をPDF保存";
  if(btnShow) btnShow.textContent = "占い結果を再表示（内容は変わりません）";

  // Share must never appear
  if(btnShare){
    btnShare.onclick = null;
    setVisibleEl(btnShare, false);
  }

  return { paidBox, btn480, btn980, btn1980: null, btnCopy, btnPdf, btnShow, btnShare, note };
}

// Dev-only: 1980ボタンを必要な瞬間に生成して挿入する（initActionBlocks多重呼び出し問題を回避）
function ensureDevBtn1980(ui){
  if(!DEV_PAID) return;
  // 既に存在していれば何もしない
  const existing = document.getElementById("btnPaid1980");
  if(existing){ ui.btn1980 = existing; return; }
  // 挿入先（480/980と同じrow）
  const row = ui.btn980 && ui.btn980.parentNode;
  if(!row) return;
  const btn = document.createElement("button");
  btn.id = "btnPaid1980";
  btn.className = "paid-actions__btn";
  btn.style.border = "2px dashed rgba(124,110,230,.6)";
  btn.style.background = "rgba(124,110,230,.12)";
  btn.textContent = "1980円版テスト（dev）";
  row.appendChild(btn);
  ui.btn1980 = btn;
}

function showAfterFree(ui){
  // After free: show only 480/980
  setVisibleEl(ui.paidBox, true);
  setVisibleEl(ui.btn480, true);
  setVisibleEl(ui.btn980, true);

  setVisibleEl(ui.btnCopy, false);
  setVisibleEl(ui.btnPdf,  false);
  setVisibleEl(ui.btnShow, false);

  setVisibleEl(ui.btnShare, false);
  setVisibleEl(ui.note, DEV_PAID);

  // Dev-only: 1980円版ボタン（この瞬間に生成・挿入）
  ensureDevBtn1980(ui);
}

function showAfterPaid(ui){
  // After paid: keep 480/980 + show utilities
  setVisibleEl(ui.paidBox, true);
  setVisibleEl(ui.btn480, true);
  setVisibleEl(ui.btn980, true);

  setVisibleEl(ui.btnCopy, true);
  setVisibleEl(ui.btnPdf,  true);
  setVisibleEl(ui.btnShow, true);

  setVisibleEl(ui.btnShare, false);
  setVisibleEl(ui.note, DEV_PAID);

  // Dev-only: 1980円版ボタン維持
  ensureDevBtn1980(ui);
}

// NEW: paid revisit mode → show ONLY "再表示"
function showReshowOnly(ui){
  setVisibleEl(ui.paidBox, true);

  setVisibleEl(ui.btnShow, true);

  setVisibleEl(ui.btn480, false);
  setVisibleEl(ui.btn980, false);
  setVisibleEl(ui.btnCopy, false);
  setVisibleEl(ui.btnPdf,  false);

  setVisibleEl(ui.btnShare, false);
  setVisibleEl(ui.note, false);
}

// Determine action UI from storage at boot/reset
function syncActionUIFromStorage(ui){
  const hasPaid = !!loadLastPaid();

  // ★有料が24h以内に残っている → “再表示だけ”を初期表示
  if(hasPaid){
    showReshowOnly(ui);
    bindPaidUtilityActions({ allowUpgradeButtons:false });
    return;
  }

  // それ以外は通常どおり。無料も有料も無い想定ではボタン無し。
  initActionBlocks();
}

/** ====== BOT avatar ====== */
const BOT_AVATAR_URL = "/baya.png";

/** ====== State machine ====== */
const STATES = {
  ASK_USER_BDAY: "ASK_USER_BDAY",
  ASK_USER_GENDER: "ASK_USER_GENDER",
  ASK_USER_BTIME: "ASK_USER_BTIME",
  ASK_USER_PREF: "ASK_USER_PREF",
  ASK_USER_MBTI: "ASK_USER_MBTI",

  ASK_PARTNER_BDAY: "ASK_PARTNER_BDAY",
  ASK_PARTNER_GENDER: "ASK_PARTNER_GENDER",
  ASK_PARTNER_PREF: "ASK_PARTNER_PREF",
  ASK_PARTNER_AGE_RANGE: "ASK_PARTNER_AGE_RANGE",
  ASK_PARTNER_BTIME: "ASK_PARTNER_BTIME",
  ASK_PARTNER_MBTI: "ASK_PARTNER_MBTI",

  ASK_RELATION: "ASK_RELATION",
  ASK_RECENT_EVENT: "ASK_RECENT_EVENT",
  ASK_CONCERN_LONG: "ASK_CONCERN_LONG",

  DONE: "DONE",
};

function newIntake(){
  return {
    version:"1.3",
    persona:{
      name:"占いばあや",
      tone:"polite_kyoto",
      forecast_style:"tendency_and_recommendation",
      free_report_length_chars:1500,
      must_output:["吉","凶","一手"]
    },
    user:{ birthday:null, gender:null, birth_time:null, birth_prefecture:null, mbti:null },
    partner:{ birthday:null, gender:null, birth_prefecture:null, birth_time:null, mbti:null, age_range:null, relation:null, recent_event:null },
    concern:{ free_text:null },
    derived:{ user_mini_reading:null, partner_mini_reading:null },
    meta:{ session_id:crypto.randomUUID(), created_at:new Date().toISOString(), updated_at:new Date().toISOString() }
  };
}

let intake = loadIntake();
let state = STATES.ASK_USER_BDAY;

// Concern follow-up
let concernNeedsMore = false;
let concernFollowupCount = 0;

// DOM
const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const resetBtn = document.getElementById("reset");
const choicesEl = document.getElementById("choices");
const choicesBodyEl = document.getElementById("choicesBody");

// UI
const UI = initActionBlocks();

/** ====== composer ====== */
sendBtn?.addEventListener("click", async () => {
  const v = (inputEl?.value || "").trim();
  if(!v) return;
  await handleAnswer(v);
});
inputEl?.addEventListener("keydown", (e) => {
  if(e.key === "Enter"){
    // textarea: keep newline behavior (no submit)
  }
});
inputEl?.addEventListener("input", () => {
  if(!inputEl) return;
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
});

resetBtn?.addEventListener("click", ()=>{
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(FREE_LAST_KEY);
  localStorage.removeItem(PAID_LAST_KEY);
  localStorage.removeItem(PAID_PENDING_KEY);

  intake = newIntake();
  state = STATES.ASK_USER_BDAY;
  concernNeedsMore = false;
  concernFollowupCount = 0;

  if(chatEl) chatEl.innerHTML = "";
  hideChoices();

  initActionBlocks();
  boot();
});

async function handleStripeReturnIfAny(){
  const sp = new URLSearchParams(location.search);
  const sessionId = sp.get("session_id");
  if(!sessionId) return;

  // session_id がある = Stripe成功戻り
  pushBot("お支払いを確認しております…");

  // 権利付与（サーバ側でKVに paid:ent を入れる）
  const vr = await fetch(`/api/stripe-verify?session_id=${encodeURIComponent(sessionId)}`);
  const vj = await vr.json().catch(()=> ({}));
  if(!vr.ok || !vj.ok){
    pushBot("申し訳ございません。決済確認に失敗しました。少し時間をおいて再度お試しくださいませ。");
    return;
  }

  // 戻り後に自動生成するため、pending を使う（クリック前に保存してある想定）
  const pending = loadPaidPending();
  if(!pending){
    pushBot("決済は確認できましたが、生成内容が特定できませんでした。480円／980円ボタンからもう一度お進みくださいませ。");
    return;
  }

  try{
    pushBot("承りました。鑑定を仕上げております…");
    const out = await generateWithProgress(pending.mode, pending.intake);

    const outNorm = normalizeOut(out);
    saveLastPaid({ mode: pending.mode, intake: pending.intake, outNorm });
    clearPaidPending();

    if(outNorm.format==="html") pushBotHtml(outNorm.content);
    else pushBot(outNorm.content);

    track("view_result_paid", { plan: pending.mode });

    showAfterPaid(UI);
    bindPaidUtilityActions({ allowUpgradeButtons:true });

    // URLの session_id を消す（リロードで再実行しないため）
    history.replaceState({}, "", location.pathname);

  }catch(e){
    pushBot("申し訳ございません。有料レポートの生成に失敗しました。");
    track("error_generate", { mode: pending?.mode || "paid", error_type: "paid_generate_failed" });
    console.error(e);
  }
}

/** ====== boot ====== */
async function boot(){
  // Hide action blocks ASAP
  initActionBlocks();
  // Restore action state if user already has paid report within 24h
  syncActionUIFromStorage(UI);

  pushBot("こんばんは。占いばあやでございます。ひとつずつ伺いますね。");

  // ★Stripeから戻ってきた場合は、ここで verify → 自動生成
  await handleStripeReturnIfAny();

  ask(state);
}
boot();

function ask(s){
  const q = questionFor(s);
  if(q) pushBot(q);
  renderChoicesFor(s);
}

function questionFor(s){
  switch(s){
    case STATES.ASK_USER_BDAY: return "まず、あなた様の生年月日を西暦でお教えくださいませ。";
    case STATES.ASK_USER_GENDER: return "差し支えなければ、あなた様の性別をお伺いしてもよろしいですか。";
    case STATES.ASK_USER_BTIME: return "出生時刻が分かればお教えくださいませ。不明であれば大体の時間帯でも大丈夫でございます。（例：昼頃ならば12:00）";
    case STATES.ASK_USER_PREF: return "お生まれの都道府県をお伺いしてもよろしいですか。";
    case STATES.ASK_USER_MBTI: return "MBTIは何型でしょう？分からなければ“不明”で結構です。";

    case STATES.ASK_PARTNER_BDAY: return "次にお相手様です。生年月日（西暦）は分かりますか？分からなければ“不明”とご入力くださいませ。";
    case STATES.ASK_PARTNER_GENDER: return "差し支えなければ、お相手様の性別も伺ってよろしいですか。";
    case STATES.ASK_PARTNER_PREF: return "お相手様の出身地（都道府県）を伺ってもよろしいですか。分からなければ“不明”で結構です。";
    case STATES.ASK_PARTNER_AGE_RANGE: return "では差し支えなければ、お相手様の年代だけ。（例：20代前半／20代後半／30代前半）";
    case STATES.ASK_PARTNER_BTIME: return "お相手様の出生時刻が分かればお教えくださいませ。不明で結構です。";
    case STATES.ASK_PARTNER_MBTI: return "お相手様のMBTIは分かりますか？分からなければ“不明”で結構です。";

    case STATES.ASK_RELATION: return "いまの関係性を、ひとことでお教えください。（片想い中／交際中／曖昧な関係／復縁したなど、自由で結構です）";
    case STATES.ASK_RECENT_EVENT: return "直近で起きた出来事を、短くお教えください。（例：3日前に既読のまま／先週会った など）";
    case STATES.ASK_CONCERN_LONG: return "最後に、いちばん知りたいことを伺います。何に悩んでおられて、どうなりたいですか？長くて構いません。迷ったら、①直近の事実②不安③理想 の順にお書きくださいませ。";
    default: return null;
  }
}

/** ====== choices ====== */
function hideChoices(){
  choicesEl?.classList.add("is-hidden");
  if(choicesBodyEl) choicesBodyEl.innerHTML = "";
}
function showChoices(){
  choicesEl?.classList.remove("is-hidden");
}
function chip(label, value, extraClass=""){
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `chip ${extraClass}`.trim();
  btn.textContent = label;
  btn.onclick = () => handleAnswer(value);
  return btn;
}

function renderChoicesFor(s){
  if(s===STATES.DONE){
    hideChoices();
    return;
  }
  if(choicesBodyEl) choicesBodyEl.innerHTML = "";

  if(s===STATES.ASK_USER_BDAY){
    showChoices();
    const box = document.createElement("div");
    box.className = "picker";
    const input = document.createElement("input");
    input.type = "date";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "btn";
    ok.textContent = "決定";
    ok.onclick = () => { if(!input.value) return; handleAnswer(input.value); };
    box.appendChild(input);
    box.appendChild(ok);
    choicesBodyEl?.appendChild(box);
    return;
  }

  if(s===STATES.ASK_PARTNER_BDAY){
    showChoices();
    const box = document.createElement("div");
    box.className = "picker";
    const input = document.createElement("input");
    input.type = "date";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "btn";
    ok.textContent = "決定";
    ok.onclick = () => { if(!input.value) return; handleAnswer(input.value); };
    box.appendChild(input);
    box.appendChild(ok);
    choicesBodyEl?.appendChild(box);
    return;
  }

  if(s===STATES.ASK_USER_GENDER || s===STATES.ASK_PARTNER_GENDER){
    showChoices();
    const row = document.createElement("div");
    row.className = "choice-row";
    row.appendChild(chip("女性","女性","primary"));
    row.appendChild(chip("男性","男性","primary"));
    row.appendChild(chip("その他/答えたくない","その他/答えたくない"));
    choicesBodyEl?.appendChild(row);
    return;
  }

  if(s===STATES.ASK_USER_BTIME || s===STATES.ASK_PARTNER_BTIME){
    showChoices();

    const picker = document.createElement("div");
    picker.className = "picker";

    const t = document.createElement("input");
    t.type = "time";
    t.step = "60";

    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "btn";
    ok.textContent = "決定";
    ok.onclick = () => { if(!t.value) return; handleAnswer(t.value); };

    picker.appendChild(t);
    picker.appendChild(ok);
    choicesBodyEl?.appendChild(picker);

    const row = document.createElement("div");
    row.className = "choice-row";
    row.appendChild(chip("00:00","00:00","primary"));
    row.appendChild(chip("06:00","06:00","primary"));
    row.appendChild(chip("12:00","12:00","primary"));
    row.appendChild(chip("18:00","18:00","primary"));
    row.appendChild(chip("不明","不明"));
    choicesBodyEl?.appendChild(row);
    return;
  }

  if(s===STATES.ASK_USER_MBTI || s===STATES.ASK_PARTNER_MBTI){
    showChoices();
    const mbtis = [
      "INTJ","INTP","ENTJ","ENTP",
      "INFJ","INFP","ENFJ","ENFP",
      "ISTJ","ISFJ","ESTJ","ESFJ",
      "ISTP","ISFP","ESTP","ESFP"
    ];
    const row = document.createElement("div");
    row.className = "choice-row";
    mbtis.forEach(m => row.appendChild(chip(m,m,"primary")));
    row.appendChild(chip("不明","不明"));
    choicesBodyEl?.appendChild(row);
    return;
  }

  hideChoices();
}

/** ====== main answer handler ====== */
async function handleAnswer(v){
  pushUser(v);
  if(inputEl){
    inputEl.value = "";
    inputEl.style.height = "auto";
  }

  const ok = applyAnswer(state, v);
  if(!ok){
    pushBot("恐れ入ります。形式が少し違うようです。もう一度、例に沿って教えてくださいませ。");
    return;
  }
  await advance();
}

function applyAnswer(s, v){
  try{
    // user
    if(s===STATES.ASK_USER_BDAY){ if(!isDate(v)) return false; intake.user.birthday = normDate(v); }
    if(s===STATES.ASK_USER_GENDER){ intake.user.gender = v; }
    if(s===STATES.ASK_USER_BTIME){ if(!isTimeOrUnknown(v)) return false; intake.user.birth_time = normTimeOrNull(v); }
    if(s===STATES.ASK_USER_PREF){ if(v.length<2) return false; intake.user.birth_prefecture = v; }
    if(s===STATES.ASK_USER_MBTI){ if(!isMbtiOrUnknown(v)) return false; intake.user.mbti = normMbtiOrNull(v); }

    // partner
    if(s===STATES.ASK_PARTNER_BDAY){ intake.partner.birthday = normDateOrNull(v); }
    if(s===STATES.ASK_PARTNER_GENDER){ intake.partner.gender = v; }
    if(s===STATES.ASK_PARTNER_PREF){
      const t = v.trim();
      intake.partner.birth_prefecture = (t==="" ? null : t);
    }
    if(s===STATES.ASK_PARTNER_AGE_RANGE){ if(v.length<3) return false; intake.partner.age_range = v; }
    if(s===STATES.ASK_PARTNER_BTIME){ if(!isTimeOrUnknown(v)) return false; intake.partner.birth_time = normTimeOrNull(v); }
    if(s===STATES.ASK_PARTNER_MBTI){ if(!isMbtiOrUnknown(v)) return false; intake.partner.mbti = normMbtiOrNull(v); }

    if(s===STATES.ASK_RELATION){ if(v.length<2) return false; intake.partner.relation = v; }
    if(s===STATES.ASK_RECENT_EVENT){ if(v.length<2) return false; intake.partner.recent_event = v; }

    // concern: accept even 1 character (only reject empty)
    if(s===STATES.ASK_CONCERN_LONG){
      const t = v.trim();
      if(t.length === 0) return false;

      const prev = (intake.concern.free_text || "").trim();
      intake.concern.free_text = prev ? `${prev}\n\n【追記】\n${t}` : t;

      concernNeedsMore = intake.concern.free_text.replace(/\s/g,"").length < 30;
    }

    intake.meta.updated_at = new Date().toISOString();
    saveIntake(intake);
    return true;
  }catch(e){
    console.error(e);
    return false;
  }
}

/** ====== progress lines (5 lines) ====== */
function progressLinesFor(mode){
  switch(mode){
    case "mini_user":
      return [
        "命式の骨組みを立てております…",
        "五行の偏りを静かに見ております…",
        "強みの出どころ（木火土金水）を整えています…",
        "あなたの恋の癖が出やすい場面を照らしております…",
        "言葉にしてお返しする準備が整ってまいりました…"
      ];
    case "mini_partner":
      return [
        "お相手様の気配を辿っております…",
        "五行の相性（生み・剋し）を見ています…",
        "距離の取り方の癖を読み解いております…",
        "反応が揺れる理由を整理しています…",
        "関係の扱い方が見えてまいりました…"
      ];
    case "free_report":
      return [
        "まず、相性の軸を立てております…",
        "今の運勢の波（強い日・弱い日）を見ています…",
        "木火土金水のバランスから、衝突点を拾っています…",
        "いま何をすると良いか、筋を整えております…",
        "迷いが減る形に、最終仕立てをしております…"
      ];
    case "paid_480":
      return [
        "相性を一段深く覗いております…",
        "五行の噛み合い方を、具体場面に当てています…",
        "今週の「攻め時／引き時」を割り出しています…",
        "文面・会い方・間の取り方まで整えています…",
        "迷いが減る形に、最終仕立てをしております…"
      ];
    case "paid_980":
      return [
        "ご縁の深いところから読み直しております…",
        "ふたりの命式の相克ポイントを丁寧に見ています…",
        "今後１ヶ月の流れを時系列で組み立てています…",
        "破綻を避ける線引きと、攻め筋を同時に整えています…",
        "決断に使えるレベルまで、鑑定を仕上げますね…"
      ];
    case "paid_1980":
      return [
        "ご縁の全体像を、場面ごとに読み解いております…",
        "あなた様の恋愛パターンを命式から辿っています…",
        "お相手様の深層心理を丁寧に見立てております…",
        "3つの道（動く・待つ・離れる）のシナリオを組み立てています…",
        "1ヶ月の流れと禁じ手を整えております…",
        "LINEテンプレと処方箋を最終仕上げしております…",
        "全解読版、まもなくお渡しいたします…"
      ];
    default:
      return [
        "少々お待ちくださいませ…",
        "読みを進めております…",
        "最終調整中でございます…",
        "もう少しだけお時間くださいませ…",
        "整いました。お渡しいたします…"
      ];
  }
}

function typingDotsHtml(){
  return `<span class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>`;
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function generateWithProgress(mode, intakeObj){
  const lines = progressLinesFor(mode);
  const ids = [];
  for(let i=0;i<lines.length;i++){
    const id = pushBot(lines[i] + " " + typingDotsHtml(), { html: true });
    ids.push(id);
    await sleep(7000);
  }

  try{
    const out = await generate(mode, intakeObj);
    ids.forEach(removeMsgById);
    return out;
  }catch(e){
    ids.forEach(removeMsgById);
    throw e;
  }
}

/** ====== state advance ====== */
async function advance(){
  // user flow
  if(state===STATES.ASK_USER_BDAY){ state=STATES.ASK_USER_GENDER; ask(state); return; }
  if(state===STATES.ASK_USER_GENDER){ state=STATES.ASK_USER_BTIME; ask(state); return; }
  if(state===STATES.ASK_USER_BTIME){ state=STATES.ASK_USER_PREF; ask(state); return; }
  if(state===STATES.ASK_USER_PREF){ state=STATES.ASK_USER_MBTI; ask(state); return; }

  if(state===STATES.ASK_USER_MBTI){
    hideChoices();
    pushBot("少々お待ちくださいませ。あなた様の気質を拝見いたしますね。");
    const out = await generateWithProgress("mini_user", intake);
    intake.derived.user_mini_reading = out.text;
    saveIntake(intake);
    pushBot(out.text);
    state=STATES.ASK_PARTNER_BDAY; ask(state); return;
  }

  // partner flow
  if(state===STATES.ASK_PARTNER_BDAY){ state=STATES.ASK_PARTNER_GENDER; ask(state); return; }
  if(state===STATES.ASK_PARTNER_GENDER){ state=STATES.ASK_PARTNER_PREF; ask(state); return; }

  if(state===STATES.ASK_PARTNER_PREF){
    state = intake.partner.birthday ? STATES.ASK_PARTNER_BTIME : STATES.ASK_PARTNER_AGE_RANGE;
    ask(state); return;
  }

  if(state===STATES.ASK_PARTNER_AGE_RANGE){ state=STATES.ASK_PARTNER_BTIME; ask(state); return; }
  if(state===STATES.ASK_PARTNER_BTIME){ state=STATES.ASK_PARTNER_MBTI; ask(state); return; }
  if(state===STATES.ASK_PARTNER_MBTI){ state=STATES.ASK_RELATION; ask(state); return; }
  if(state===STATES.ASK_RELATION){ state=STATES.ASK_RECENT_EVENT; ask(state); return; }

  if(state===STATES.ASK_RECENT_EVENT){
    hideChoices();
    pushBot("ありがとうございます。お相手様の気配を拝見いたしますね。");
    const out = await generateWithProgress("mini_partner", intake);
    intake.derived.partner_mini_reading = out.text;
    saveIntake(intake);
    pushBot(out.text);
    state=STATES.ASK_CONCERN_LONG; ask(state); return;
  }

  // concern flow
  if(state===STATES.ASK_CONCERN_LONG){
    hideChoices();

    // If short: ask follow-up instead of generating
    if(concernNeedsMore){
      concernFollowupCount += 1;
      concernNeedsMore = false;

      if(concernFollowupCount === 1){
        pushBot("承りました。もう少しだけ状況が分かると精度が上がります。次の3点を短くで結構ですので追記くださいませ。");
        pushBot("①直近の事実（いつ／何があった） ②いちばんの不安 ③理想（どうなりたい）");
      }else{
        pushBot("ありがとうございます。最後に一点だけ。相手との接点（会う頻度／連絡頻度）を短く追記くださいませ。");
      }
      return;
    }

    // Generate free report
    track("submit_form");
    pushBot("承りました。では、無料の鑑定をお渡しします。");
    const out = await generateWithProgress("free_report", intake);

    const outNorm = normalizeOut(out);
    saveLastFree({ intake, outNorm });

    if(outNorm.format==="html") pushBotHtml(outNorm.content);
    else pushBot(outNorm.content);

    track("view_result_free");

    // After free: show 480/980 only
    state = STATES.DONE;
    showAfterFree(UI);
    bindPaidEntryActions(() => intake);

    pushBot("この先は、詳しい鑑定（有料）もお作りできます。まずはここまで、いかがでしたか。");
    return;
  }
}
async function goCheckout(plan, intakeObj){
  track("begin_checkout", { plan: plan });
  const r = await fetch("/api/stripe-create-checkout", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ plan, intake: intakeObj }),
  });
  const j = await r.json().catch(()=> ({}));
  if(!r.ok || !j.url) throw new Error(j?.error || "CHECKOUT_CREATE_FAILED");
  location.href = j.url;
}

/** ====== API ====== */
async function generate(mode, intakeObj){
  const res = await fetch("/api/fortune-generate", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ mode, intake: intakeObj })
  });

  if(!res.ok){
    const errText = await res.text();
    console.error("fortune-generate error:", errText);
    throw new Error(errText);
  }
  return await res.json();
}

/** ====== paid actions binding ====== */
function setPaidButtonsEnabled(enabled){
  setEnabledEl(UI.btn480, enabled);
  setEnabledEl(UI.btn980, enabled);
  if(UI.btn1980) setEnabledEl(UI.btn1980, enabled);
}

function bindPaidEntryActions(intakeRefGetter){
  // 480 → Stripeへ
  bindClickEl(UI.btn480, async ()=>{
    try{
      track("click_upgrade", { plan: "paid_480" });
      setPaidButtonsEnabled(false);
      pushBot("承知しました。480円版の決済画面へご案内いたします…");

      const it = intakeRefGetter();
      savePaidPending({ mode:"paid_480", intake: it }); // 戻ってきた後に自動生成するため
      await goCheckout("480", it);

    }catch(e){
      pushBot("申し訳ございません。決済画面の作成に失敗しました。");
      console.error(e);
    }finally{
      setPaidButtonsEnabled(true);
    }
  });

  // 980 → Stripeへ
  bindClickEl(UI.btn980, async ()=>{
    try{
      track("click_upgrade", { plan: "paid_980" });
      setPaidButtonsEnabled(false);
      pushBot("承知しました。980円版の決済画面へご案内いたします…");

      const it = intakeRefGetter();
      savePaidPending({ mode:"paid_980", intake: it });
      await goCheckout("980", it);

    }catch(e){
      pushBot("申し訳ございません。決済画面の作成に失敗しました。");
      console.error(e);
    }finally{
      setPaidButtonsEnabled(true);
    }
  });

  // 1980 → dev_paid=1 のときのみ（Stripeスキップ・直接生成）
  if(UI.btn1980){
    bindClickEl(UI.btn1980, async ()=>{
      try{
        setPaidButtonsEnabled(false);
        pushBot("[DEV] 1980円・全解読版の鑑定を開始します（決済スキップ）…");

        const it = intakeRefGetter();
        const out = await generateWithProgress("paid_1980", it);

        const outNorm = normalizeOut(out);
        saveLastPaid({ mode:"paid_1980", intake: it, outNorm });

        if(outNorm.format==="html") pushBotHtml(outNorm.content);
        else pushBot(outNorm.content);

        showAfterPaid(UI);
        bindPaidUtilityActions({ allowUpgradeButtons:true });

      }catch(e){
        pushBot("[DEV] 1980円版の生成に失敗しました: " + (e.message||e));
        console.error(e);
      }finally{
        setPaidButtonsEnabled(true);
      }
    });
  }
}

// opts.allowUpgradeButtons=false → reshow-only mode keeps UI minimal
function bindPaidUtilityActions(opts = { allowUpgradeButtons:true }){
  // Show / re-show (recoverable)
  bindClickEl(UI.btnShow, async ()=>{
    const last = loadLastPaid();
    if(last){
      pushBot(`前回の有料レポート（${last.mode}）を再表示します。`);
      if(last.format==="html") pushBotHtml(last.content);
      else pushBot(last.content);

      // IMPORTANT: keep UI state
      if(opts.allowUpgradeButtons) showAfterPaid(UI);
      else showReshowOnly(UI);

      return;
    }

    const pending = loadPaidPending();
    if(!pending){
      pushBot("まだ有料レポートがありません。");
      return;
    }

    pushBot("前回の有料レポートを再生成します…");
    try{
      const out = await generateWithProgress(pending.mode, pending.intake);
      const outNorm = normalizeOut(out);
      saveLastPaid({ mode: pending.mode, intake: pending.intake, outNorm });
      clearPaidPending();

      if(outNorm.format==="html") pushBotHtml(outNorm.content);
      else pushBot(outNorm.content);

      if(opts.allowUpgradeButtons) showAfterPaid(UI);
      else showReshowOnly(UI);

    }catch(e){
      pushBot("申し訳ございません。再生成に失敗しました。");
      console.error(e);
    }
  });

  // Copy
  bindClickEl(UI.btnCopy, async ()=>{
    const last = loadLastPaid();
    if(!last){ pushBot("まだ有料レポートがありません。"); return; }
    track("copy_click", { report_type: "paid" });
    const text = last.format==="html" ? htmlToText(last.content) : last.content;
    await copyText(text);
    pushBot("コピーしました。");
  });

  // PDF
  bindClickEl(UI.btnPdf, ()=>{
    const last = loadLastPaid();
    if(!last){ pushBot("まだ有料レポートがありません。"); return; }
    printAsPdf({
      title: `占いばあや｜${last.mode}`,
      html: last.format==="html" ? last.content : null,
      text: last.format==="text" ? last.content : null,
    });
  });

  // Share removed
  if(UI.btnShare){
    UI.btnShare.onclick = null;
    setVisibleEl(UI.btnShare, false);
  }
}

/** ====== chat rendering ====== */
function pushBot(text, opts = { html:false }){
  const id = crypto.randomUUID();
  const safe = opts.html ? text : escapeHtml(text);

  const avatarHtml = BOT_AVATAR_URL
    ? `<div class="avatar"><img src="${BOT_AVATAR_URL}" alt="占いばあや"></div>`
    : `<div class="avatar"><div class="fallback">ば</div></div>`;

  chatEl?.insertAdjacentHTML("beforeend", `
    <div class="row bot" data-msg-id="${id}">
      ${avatarHtml}
      <div class="bubble bot">${safe}</div>
    </div>
  `);
  if(chatEl) chatEl.scrollTop = chatEl.scrollHeight;
  return id;
}
function pushBotHtml(html){
  return pushBot(html, { html:true });
}
function pushUser(text){
  const id = crypto.randomUUID();
  chatEl?.insertAdjacentHTML("beforeend", `
    <div class="row user" data-msg-id="${id}">
      <div class="bubble user">${escapeHtml(text)}</div>
    </div>
  `);
  if(chatEl) chatEl.scrollTop = chatEl.scrollHeight;
  return id;
}
function removeMsgById(id){
  const el = chatEl?.querySelector(`[data-msg-id="${id}"]`);
  if(el) el.remove();
}

/** ====== storage ====== */
function saveIntake(itk){ localStorage.setItem(STORAGE_KEY, JSON.stringify(itk)); }
function loadIntake(){
  const s = localStorage.getItem(STORAGE_KEY);
  if(!s) return newIntake();
  try{
    const p = JSON.parse(s);
    if(!p?.version || p.version !== "1.3") return newIntake();
    return p;
  }catch{
    return newIntake();
  }
}

/** ====== validators ====== */
function isDate(v){ return /^\d{4}[\/-]\d{2}[\/-]\d{2}$/.test(v.trim()); }
function normDate(v){ return v.trim().replaceAll("/", "-"); }
function normDateOrNull(v){
  const t = v.trim();
  if(!t || t==="不明" || t.toLowerCase()==="unknown") return null;
  if(!isDate(t)) return null;
  return normDate(t);
}

function isTimeOrUnknown(v){
  const t = v.trim();
  if(t==="不明" || t.toLowerCase()==="unknown") return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}
function normTimeOrNull(v){
  const t = v.trim();
  if(!t || t==="不明" || t.toLowerCase()==="unknown") return null;
  return t;
}

function isMbtiOrUnknown(v){
  const t = v.trim().toUpperCase();
  if(t==="不明" || t==="UNKNOWN") return true;
  return /^[EI][NS][TF][JP]$/.test(t);
}
function normMbtiOrNull(v){
  const t = v.trim().toUpperCase();
  if(!t || t==="不明" || t==="UNKNOWN") return null;
  return t;
}

function escapeHtml(s){
  const str = String(s ?? "");
  return str
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
