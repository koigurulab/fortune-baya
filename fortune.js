const STORAGE_KEY = "fortune_intake_v1_3";

const PAID_LAST_KEY = "fortune_paid_last_v1";

function nowIso(){ return new Date().toISOString(); }

function intakeSig(it){
  // 同一入力判定（必要なら項目追加）
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
  // 念のため
  return { format:"text", content: String(out ?? "") };
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
    // fallback
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

  const contentHtml = html ? html : `<pre style="white-space:pre-wrap; font-family:inherit;">${escapeHtml(text || "")}</pre>`;
  w.document.open();
  w.document.write(`
<!doctype html>
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
</body></html>
  `);
  w.document.close();
}

/** ====== BOTアイコン（任意）======
 * 画像を使うなら public/baya.png を置いて "/baya.png" にしてください。
 * 置かない場合は丸アイコンに「ば」が表示されます。
 */
const BOT_AVATAR_URL = "/baya.png";

const STATES = {
  ASK_USER_BDAY: "ASK_USER_BDAY",        // 必須（不明ボタン無し）
  ASK_USER_GENDER: "ASK_USER_GENDER",
  ASK_USER_BTIME: "ASK_USER_BTIME",      // 不明OK
  ASK_USER_PREF: "ASK_USER_PREF",        // 自由入力
  ASK_USER_MBTI: "ASK_USER_MBTI",        // 不明OK
  MINI_READ_USER: "MINI_READ_USER",

  ASK_PARTNER_BDAY: "ASK_PARTNER_BDAY",  // 不明入力OK（ボタンは出さない）
  ASK_PARTNER_GENDER: "ASK_PARTNER_GENDER",
  ASK_PARTNER_PREF: "ASK_PARTNER_PREF",  // 自由入力（不明OK）
  ASK_PARTNER_AGE_RANGE: "ASK_PARTNER_AGE_RANGE",
  ASK_PARTNER_BTIME: "ASK_PARTNER_BTIME",// 不明OK
  ASK_PARTNER_MBTI: "ASK_PARTNER_MBTI",  // 不明OK

  ASK_RELATION: "ASK_RELATION",
  ASK_RECENT_EVENT: "ASK_RECENT_EVENT",
  MINI_READ_PARTNER: "MINI_READ_PARTNER",

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

const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");     // textarea想定
const sendBtn = document.getElementById("sendBtn");
const resetBtn = document.getElementById("reset");

const choicesEl = document.getElementById("choices");
const choicesBodyEl = document.getElementById("choicesBody");

/** ====== 1) Enterで送信しない（クリック送信のみ） ====== */
sendBtn.addEventListener("click", async () => {
  const v = inputEl.value.trim();
  if(!v) return;
  await handleAnswer(v);
});

inputEl.addEventListener("keydown", (e) => {
  // Enterで送信させない。textareaなら改行はデフォルトで入る
  // ※もし input type="text" の場合は、Enterでフォームsubmitされることがあるので、
  //   HTML側を textarea にしておくのが安全です。
  if (e.key === "Enter") {
    // 送信はしない（何もしない）
  }
});

// テキストエリアの自動リサイズ
inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
});

resetBtn.addEventListener("click", ()=>{
  localStorage.removeItem(STORAGE_KEY);
  intake = newIntake();
  state = STATES.ASK_USER_BDAY;
  chatEl.innerHTML = "";
  hideChoices();
  hidePaidActions();
  boot();
});

function boot(){
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
  choicesEl.classList.add("is-hidden");
  choicesBodyEl.innerHTML = "";
}
function showChoices(){
  choicesEl.classList.remove("is-hidden");
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

  choicesBodyEl.innerHTML = "";

  // 本人の生年月日：date picker（不明なし）
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
    choicesBodyEl.appendChild(box);
    return;
  }

  // 相手の生年月日：date picker（不明ボタンは出さない。自由入力で「不明」許可）
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
    choicesBodyEl.appendChild(box);
    return;
  }

  // 性別（本人/相手）
  if(s===STATES.ASK_USER_GENDER || s===STATES.ASK_PARTNER_GENDER){
    showChoices();
    const row = document.createElement("div");
    row.className = "choice-row";
    row.appendChild(chip("女性","女性","primary"));
    row.appendChild(chip("男性","男性","primary"));
    row.appendChild(chip("その他/答えたくない","その他/答えたくない"));
    choicesBodyEl.appendChild(row);
    return;
  }

  // 出生時刻（本人/相手）：time picker + presets + 不明
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
    choicesBodyEl.appendChild(picker);

    const row = document.createElement("div");
    row.className = "choice-row";
    row.appendChild(chip("00:00","00:00","primary"));
    row.appendChild(chip("06:00","06:00","primary"));
    row.appendChild(chip("12:00","12:00","primary"));
    row.appendChild(chip("18:00","18:00","primary"));
    row.appendChild(chip("不明","不明"));
    choicesBodyEl.appendChild(row);
    return;
  }

  // MBTI（本人/相手）
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
    choicesBodyEl.appendChild(row);
    return;
  }

  // それ以外：選択肢なし
  hideChoices();
}

/** ====== main answer handler ====== */
async function handleAnswer(v){
  pushUser(v);
  inputEl.value = "";
  inputEl.style.height = "auto";

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
    if(s===STATES.ASK_CONCERN_LONG){ if(v.length<30) return false; intake.concern.free_text = v; }

    intake.meta.updated_at = new Date().toISOString();
    saveIntake(intake);
    return true;
  }catch(e){
    console.error(e);
    return false;
  }
}

/** ====== 3) 重い生成は“段階メッセージ”を挟む ====== */
function progressLinesFor(mode){
  switch(mode){
    case "mini_user":
      return [
        "命式の骨組みを立てております…",
        "五行の偏りを静かに見ております…",
        "強みの出どころ（木火土金水）を整えています…",
        "あなたの恋の癖が出やすい場面を照らしております…",
        "言葉にしてお返しする準備が整えております…"
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
        "今週の運勢の波（強い日・弱い日）を見ています…",
        "木火土金水のバランスから、衝突点を拾っています…",
        "今週どうすべきかを考えておりす…",
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

async function generateWithProgress(mode, intake){
  const lines = progressLinesFor(mode);

  // 3つ“順番に”出す（2秒ごとに変化）
  const ids = [];
  for(let i=0;i<lines.length;i++){
    const id = pushBot(lines[i] + " " + typingDotsHtml(), { html: true, isProgress: true });
    ids.push(id);
    await sleep(7000); // ★ここがポイント：7秒ずつ
  }

  try{
    const out = await generate(mode, intake);
    // progressメッセージは見栄え優先で消す
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

  if(state===STATES.ASK_CONCERN_LONG){
    hideChoices();
    pushBot("承りました。では、無料の鑑定をお渡しします。");
    const out = await generateWithProgress("free_report", intake);
    pushBotHtml(out.html);
    state=STATES.DONE;

    showPaidActions();
    bindPaidActions(() => intake);

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

/** ====== paid actions ====== */
const DEV_PAID = new URLSearchParams(location.search).get("dev_paid") === "1";

function showPaidActions(){
  const box = document.getElementById("paidActions");
  const note = document.getElementById("paidActionsNote");
  if(!box) return;
  box.classList.remove("is-hidden");
  if(DEV_PAID && note) note.classList.remove("is-hidden");
}
function hidePaidActions(){
  const box = document.getElementById("paidActions");
  if(box) box.classList.add("is-hidden");
}
function setPaidButtonsEnabled(enabled){
  const b480 = document.getElementById("btnPaid480");
  const b980 = document.getElementById("btnPaid980");
  if(b480) b480.disabled = !enabled;
  if(b980) b980.disabled = !enabled;
}

function bindPaidActions(intakeRefGetter){
  const b480 = document.getElementById("btnPaid480");
  const b980 = document.getElementById("btnPaid980");

  function bindPaidUtilityActions(){
  const btnCopy = document.getElementById("btnPaidCopy");
  const btnPdf  = document.getElementById("btnPaidPdf");
  const btnShow = document.getElementById("btnPaidShow");
  const btnShare= document.getElementById("btnPaidShare");

  if(btnShow){
    btnShow.onclick = ()=>{
      const last = loadLastPaid();
      if(!last){ pushBot("まだ有料レポートがありません。"); return; }
      pushBot(`前回の有料レポート（${last.mode}）を再表示します。`);
      if(last.format==="html") pushBotHtml(last.content);
      else pushBot(last.content);
    };
  }

  if(btnCopy){
    btnCopy.onclick = async ()=>{
      const last = loadLastPaid();
      if(!last){ pushBot("まだ有料レポートがありません。"); return; }
      const text = last.format==="html" ? htmlToText(last.content) : last.content;
      await copyText(text);
      pushBot("コピーしました。");
    };
  }

  if(btnPdf){
    btnPdf.onclick = ()=>{
      const last = loadLastPaid();
      if(!last){ pushBot("まだ有料レポートがありません。"); return; }
      printAsPdf({
        title: `占いばあや｜${last.mode}`,
        html: last.format==="html" ? last.content : null,
        text: last.format==="text" ? last.content : null,
      });
    };
  }

  if(btnShare){
    btnShare.onclick = async ()=>{
      const last = loadLastPaid();
      if(!last){ pushBot("まだ有料レポートがありません。"); return; }

      pushBot("共有リンクを作成します…");
      const res = await fetch("/api/share-create",{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ format:last.format, content:last.content })
      });
      if(!res.ok){
        pushBot("申し訳ございません。共有リンクの作成に失敗しました。");
        return;
      }
      const { token } = await res.json();
      const url = `${location.origin}/share.html?token=${token}`;

      // Web Share APIが使える端末は共有UIを出す
      if(navigator.share){
        try{
          await navigator.share({ title:"占いばあや｜共有レポート", url });
          pushBot("共有しました。");
          return;
        }catch{ /* ユーザーキャンセル等 */ }
      }

      await copyText(url);
      pushBot("共有リンクをコピーしました。貼り付けて送れます。");
    };
  }
}

  if(b480){
    b480.onclick = async ()=>{
      try{
        setPaidButtonsEnabled(false);
        pushBot("承知しました。480円版の鑑定をお出しします…");
        const it = intakeRefGetter();
        const out = await generateWithProgress("paid_480", it); // サーバのmodeに合わせてください
        pushBot(out.text || out.html || "");
      }catch(e){
        pushBot("申し訳ございません。480円版の生成に失敗しました。");
        console.error(e);
      }finally{
        setPaidButtonsEnabled(true);
      }
    };
  }

  if(b980){
    b980.onclick = async ()=>{
      try{
        setPaidButtonsEnabled(false);
        pushBot("承知しました。980円版の鑑定をお出しします…");
        const it = intakeRefGetter();
        const out = await generateWithProgress("paid_980", it);
        pushBot(out.text || out.html || "");
      }catch(e){
        pushBot("申し訳ございません。980円版の生成に失敗しました。");
        console.error(e);
      }finally{
        setPaidButtonsEnabled(true);
      }
    };
  }
}

/** ====== 2) LINE風描画（botはアイコン付き） ====== */
function typingDotsHtml(){
  return `<span class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>`;
}

function pushBot(text, opts = { html:false, isProgress:false }){
  const id = crypto.randomUUID();
  const safe = opts.html ? text : escapeHtml(text);

  const avatarHtml = BOT_AVATAR_URL
    ? `<div class="avatar"><img src="${BOT_AVATAR_URL}" alt="占いばあや"></div>`
    : `<div class="avatar"><div class="fallback">ば</div></div>`;

  chatEl.insertAdjacentHTML("beforeend", `
    <div class="row bot" data-msg-id="${id}">
      ${avatarHtml}
      <div class="bubble bot">${safe}</div>
    </div>
  `);
  chatEl.scrollTop = chatEl.scrollHeight;
  return id;
}

function pushBotHtml(html){
  return pushBot(html, { html:true });
}

function pushUser(text){
  const id = crypto.randomUUID();
  chatEl.insertAdjacentHTML("beforeend", `
    <div class="row user" data-msg-id="${id}">
      <div class="bubble user">${escapeHtml(text)}</div>
    </div>
  `);
  chatEl.scrollTop = chatEl.scrollHeight;
  return id;
}

function removeMsgById(id){
  const el = chatEl.querySelector(`[data-msg-id="${id}"]`);
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

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
