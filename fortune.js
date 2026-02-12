// fortune.js (FULL) — 2026-02
// 要件反映
// 1) 無料レポートが出るまで：アクションボタンは一切出さない
// 2) 無料後：480/980 の2ボタンだけ表示（共有は出さない）
// 3) 有料後：コピー/PDF/再表示を表示（480/980は出しっぱなし）※共有は出さない
// 4) 相談文が短い場合：弾かずに追質問してから生成へ進める（自然な会話）
// 5) HTMLでid重複があっても、最後のpaidActionsだけ採用（それ以外は非表示）

const STORAGE_KEY = "fortune_intake_v1_3";
const FREE_LAST_KEY = "fortune_free_last_v1";
const PAID_LAST_KEY = "fortune_paid_last_v1";

function nowIso(){ return new Date().toISOString(); }

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
  try{ return JSON.parse(s); }catch{ return null; }
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

/** ====== UI show/hide policy ======
 * 無料前：freeActions / paidActions を全部非表示
 * 無料後：paidEntry(480/980)のみ表示
 * 有料後：paidUtility(コピー/PDF/再表示)表示、paidEntryは出しっぱなし
 * 共有：無料/有料ともに廃止（非表示）
 */
function initActionBlocks(){
  // HTMLでidが重複してるので、paidActionsは「最後の1つ」だけ採用し、それ以外は常に非表示
  hideAllButLastById("paidActions");
  // freeActionsも今は使わない（共有廃止）
  setVisibleAllById("freeActions", false);

  // paidActions（最後だけ）を握る
  const paidBox = lastById("paidActions");

  // 中のボタン（最後のpaidActions配下にある前提。無い場合はidで最後を拾う）
  const btn480 = (paidBox && paidBox.querySelector("#btnPaid480")) || lastById("btnPaid480");
  const btn980 = (paidBox && paidBox.querySelector("#btnPaid980")) || lastById("btnPaid980");
  const btnCopy = (paidBox && paidBox.querySelector("#btnPaidCopy")) || lastById("btnPaidCopy");
  const btnPdf  = (paidBox && paidBox.querySelector("#btnPaidPdf"))  || lastById("btnPaidPdf");
  const btnShow = (paidBox && paidBox.querySelector("#btnPaidShow")) || lastById("btnPaidShow");
  const btnShare= (paidBox && paidBox.querySelector("#btnPaidShare"))|| lastById("btnPaidShare");
  const note    = (paidBox && paidBox.querySelector("#paidActionsNote")) || lastById("paidActionsNote");

  // paid box自体を隠す（無料が出るまで）
  setVisibleEl(paidBox, false);

  // 念のため個別も隠す
  setVisibleEl(btn480, false);
  setVisibleEl(btn980, false);
  setVisibleEl(btnCopy, false);
  setVisibleEl(btnPdf,  false);
  setVisibleEl(btnShow, false);
  setVisibleEl(btnShare,false); // 共有は常に消す
  setVisibleEl(note,    false);

  // ボタン文言（薄い→具体化）
  if(btnCopy) btnCopy.textContent = "占い結果を文章としてコピー";
  if(btnPdf)  btnPdf.textContent  = "占い結果をPDF保存";
  if(btnShow) btnShow.textContent = "占い結果を再表示（内容は変わりません）";

  return { paidBox, btn480, btn980, btnCopy, btnPdf, btnShow, btnShare, note };
}

function showAfterFree(ui){
  // 無料後：paid entryのみ表示
  setVisibleEl(ui.paidBox, true);
  setой; // (intentional no-op safeguard)
  setVisibleEl(ui.btn480, true);
  setVisibleEl(ui.btn980, true);

  // 有料ユーティリティはまだ
  setVisibleEl(ui.btnCopy, false);
  setVisibleEl(ui.btnPdf,  false);
  setVisibleEl(ui.btnShow, false);

  // 共有は出さない
  setVisibleEl(ui.btnShare, false);
  setVisibleEl(ui.note, DEV_PAID);
}

function showAfterPaid(ui){
  // paid entryは出しっぱなし
  setVisibleEl(ui.paidBox, true);
  setVisibleEl(ui.btn480, true);
  setVisibleEl(ui.btn980, true);

  // utilityを表示
  setVisibleEl(ui.btnCopy, true);
  setVisibleEl(ui.btnPdf,  true);
  setVisibleEl(ui.btnShow, true);

  // 共有は出さない
  setVisibleEl(ui.btnShare, false);
  setVisibleEl(ui.note, DEV_PAID);
}

const DEV_PAID = new URLSearchParams(location.search).get("dev_paid") === "1";

/** ====== BOTアイコン（任意）====== */
const BOT_AVATAR_URL = "/baya.png";

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

// 相談文が短い時の追質問制御
let concernNeedsMore = false;
let concernFollowupCount = 0;

const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const resetBtn = document.getElementById("reset");
const choicesEl = document.getElementById("choices");
const choicesBodyEl = document.getElementById("choicesBody");

// UI（paidActionsは最後の1つだけ掴む）
const UI = initActionBlocks();

/** ====== composer ====== */
sendBtn?.addEventListener("click", async () => {
  const v = (inputEl?.value || "").trim();
  if(!v) return;
  await handleAnswer(v);
});
inputEl?.addEventListener("keydown", (e) => {
  if(e.key === "Enter"){
    // 送信しない（textareaで改行のみ）
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

  intake = newIntake();
  state = STATES.ASK_USER_BDAY;
  concernNeedsMore = false;
  concernFollowupCount = 0;

  if(chatEl) chatEl.innerHTML = "";
  hideChoices();
  // アクション完全非表示へ
  initActionBlocks();
  boot();
});

/** ====== boot ====== */
function boot(){
  // 初期表示でボタンが一瞬見える問題は、JSだけだと完全撲滅が難しいため、
  // ここで可能な限り早く非表示を強制します（HTML側で hidden 付与がベスト）。
  initActionBlocks();
  pushBot("こんばんは。占いばあやでございます。ひとつずつ伺いますね。");
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

    // 相談文：短いなら弾かずに通し、後で追質問フローへ
    if(s===STATES.ASK_CONCERN_LONG){
      const t = v.trim();
      if(t.length < 2) return false;

      // 追記として積む（追質問後の入力を上書きしない）
      const prev = (intake.concern.free_text || "").trim();
      intake.concern.free_text = prev ? `${prev}\n\n【追記】\n${t}` : t;

      // 生成に必要な情報量が足りない場合は advance() 側で止めて追質問する
      if(intake.concern.free_text.replace(/\s/g,"").length < 30){
        concernNeedsMore = true;
      }else{
        concernNeedsMore = false;
      }
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

async function generateWithProgress(mode, intake){
  const lines = progressLinesFor(mode);
  const ids = [];
  for(let i=0;i<lines.length;i++){
    const id = pushBot(lines[i] + " " + typingDotsHtml(), { html: true });
    ids.push(id);
    await sleep(7000);
  }

  try{
    const out = await generate(mode, intake);
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

    // ★短文なら弾かずに追質問（自然）
    if(concernNeedsMore){
      concernFollowupCount += 1;
      concernNeedsMore = false;

      if(concernFollowupCount === 1){
        pushBot("承りました。もう少しだけ状況が分かると精度が上がります。次の3点を短くで結構ですので追記くださいませ。");
        pushBot("①直近の事実（いつ／何があった） ②いちばんの不安 ③理想（どうなりたい）");
      }else{
        // 2回目以降は軽めに
        pushBot("ありがとうございます。最後に一点だけ。相手との接点（会う頻度／連絡頻度）を短く追記くださいませ。");
      }
      // stateは維持して再入力待ち
      return;
    }

    // ここまで来たら無料生成へ
    pushBot("承りました。では、無料の鑑定をお渡しします。");
    const out = await generateWithProgress("free_report", intake);

    const outNorm = normalizeOut(out);
    saveLastFree({ intake, outNorm });

    if(outNorm.format==="html") pushBotHtml(outNorm.content);
    else pushBot(outNorm.content);

    // 無料後：480/980だけ表示（共有は出さない）
    state = STATES.DONE;
    showAfterFree(UI);

    // bind 480/980
    bindPaidEntryActions(() => intake);

    pushBot("この先は、詳しい鑑定（有料）もお作りできます。まずはここまで、いかがでしたか。");
    return;
  }
}

/** ====== API ====== */
async function generate(mode, intake){
  const res = await fetch("/api/fortune-generate", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ mode, intake })
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
}

function bindPaidEntryActions(intakeRefGetter){
  // 480
  bindClickEl(UI.btn480, async ()=>{
    try{
      setPaidButtonsEnabled(false);
      pushBot("承知しました。480円版（1週間の流れ）をお出しします…");

      const it = intakeRefGetter();
      const out = await generateWithProgress("paid_480", it);

      const outNorm = normalizeOut(out);
      saveLastPaid({ mode:"paid_480", intake: it, outNorm });

      if(outNorm.format==="html") pushBotHtml(outNorm.content);
      else pushBot(outNorm.content);

      // 有料後：utility表示
      showAfterPaid(UI);
      bindPaidUtilityActions();

    }catch(e){
      pushBot("申し訳ございません。480円版の生成に失敗しました。");
      console.error(e);
    }finally{
      setPaidButtonsEnabled(true);
    }
  });

  // 980
  bindClickEl(UI.btn980, async ()=>{
    try{
      setPaidButtonsEnabled(false);
      pushBot("承知しました。980円版（今後の運勢を詳しく）をお出しします…");

      const it = intakeRefGetter();
      const out = await generateWithProgress("paid_980", it);

      const outNorm = normalizeOut(out);
      saveLastPaid({ mode:"paid_980", intake: it, outNorm });

      if(outNorm.format==="html") pushBotHtml(outNorm.content);
      else pushBot(outNorm.content);

      // 有料後：utility表示
      showAfterPaid(UI);
      bindPaidUtilityActions();

    }catch(e){
      pushBot("申し訳ございません。980円版の生成に失敗しました。");
      console.error(e);
    }finally{
      setPaidButtonsEnabled(true);
    }
  });
}

function bindPaidUtilityActions(){
  // 再表示
  bindClickEl(UI.btnShow, ()=>{
    const last = loadLastPaid();
    if(!last){ pushBot("まだ有料レポートがありません。"); return; }
    pushBot(`前回の有料レポート（${last.mode}）を再表示します。`);
    if(last.format==="html") pushBotHtml(last.content);
    else pushBot(last.content);
  });

  // コピー
  bindClickEl(UI.btnCopy, async ()=>{
    const last = loadLastPaid();
    if(!last){ pushBot("まだ有料レポートがありません。"); return; }
    const text = last.format==="html" ? htmlToText(last.content) : last.content;
    await copyText(text);
    pushBot("コピーしました。");
  });

  // PDF保存
  bindClickEl(UI.btnPdf, ()=>{
    const last = loadLastPaid();
    if(!last){ pushBot("まだ有料レポートがありません。"); return; }
    printAsPdf({
      title: `占いばあや｜${last.mode}`,
      html: last.format==="html" ? last.content : null,
      text: last.format==="text" ? last.content : null,
    });
  });

  // 共有は廃止（何もしない）
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
