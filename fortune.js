const STORAGE_KEY = "fortune_intake_v1_2";

const STATES = {
  ASK_USER_GENDER: "ASK_USER_GENDER",
  ASK_USER_BDAY: "ASK_USER_BDAY",
  ASK_USER_BTIME: "ASK_USER_BTIME",
  ASK_USER_PREF: "ASK_USER_PREF",
  ASK_USER_MBTI: "ASK_USER_MBTI",
  MINI_READ_USER: "MINI_READ_USER",

  ASK_PARTNER_BDAY: "ASK_PARTNER_BDAY",
  ASK_PARTNER_AGE_RANGE: "ASK_PARTNER_AGE_RANGE",
  ASK_PARTNER_BTIME: "ASK_PARTNER_BTIME",
  ASK_PARTNER_PREF: "ASK_PARTNER_PREF",
  ASK_PARTNER_MBTI: "ASK_PARTNER_MBTI",

  ASK_RELATION: "ASK_RELATION",
  ASK_RECENT_EVENT: "ASK_RECENT_EVENT",
  MINI_READ_PARTNER: "MINI_READ_PARTNER",

  ASK_CONCERN_LONG: "ASK_CONCERN_LONG",
  FREE_REPORT: "FREE_REPORT",
  DONE: "DONE",
};

function newIntake() {
  return {
    version: "1.2",
    persona: {
      name: "占いばあや",
      tone: "polite_kyoto",
      forecast_style: "tendency_and_recommendation",
      free_report_length_chars: 1500,
      must_output: ["吉", "凶", "一手"],
    },
    user: {
      gender: null,
      birthday: null,
      birth_time: null,
      birth_prefecture: null,
      mbti: null,
    },
    partner: {
      birthday: null,
      birth_time: null,
      birth_prefecture: null, // 相手の出身地
      mbti: null,
      age_range: null,
      relation: null,
      recent_event: null,
    },
    concern: { free_text: null },
    derived: { user_mini_reading: null, partner_mini_reading: null },
    meta: {
      session_id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

let intake = loadIntake();
let state = STATES.ASK_USER_GENDER;

const chatEl = document.getElementById("chat");
const formEl = document.getElementById("form");
const inputEl = document.getElementById("input");
const resetBtn = document.getElementById("reset");

const choicesBox = document.getElementById("choices");
const choicesRow = document.getElementById("choicesRow");

// paid
const DEV_PAID = new URLSearchParams(location.search).get("dev_paid") === "1";

resetBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  intake = newIntake();
  state = STATES.ASK_USER_GENDER;
  chatEl.innerHTML = "";
  hideChoices();
  hidePaidActions();
  boot();
});

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = inputEl.value.trim();
  if (!v) return;
  inputEl.value = "";
  await submitAnswer(v);
});

async function submitAnswer(v) {
  pushUser(v);

  const ok = applyAnswer(state, v);
  if (!ok) {
    pushBot("恐れ入ります。形式が少し違うようです。もう一度、例に沿って教えてくださいませ。");
    return;
  }

  await advance();
}

function boot() {
  pushBot("こんばんは。占いばあやでございます。ひとつずつ伺いますね。");
  ask(state);
}
boot();

function ask(s) {
  const q = questionFor(s);
  if (q) pushBot(q);
  renderChoicesForState(s);
}

function questionFor(s) {
  switch (s) {
    case STATES.ASK_USER_GENDER:
      return "まず、あなた様の性別をお伺いしてもよろしいですか。";
    case STATES.ASK_USER_BDAY:
      return "次に、あなた様の生年月日を西暦でお教えくださいませ。（例：2003/01/07）";
    case STATES.ASK_USER_BTIME:
      return "出生時刻が分かればお教えくださいませ。不明でも大丈夫でございます。（例：05:15 / 不明）";
    case STATES.ASK_USER_PREF:
      return "お生まれの都道府県をお伺いしてもよろしいですか。（自由入力で結構です）";
    case STATES.ASK_USER_MBTI:
      return "MBTIは何型でしょう？分からなければ“不明”で結構です。";

    case STATES.ASK_PARTNER_BDAY:
      return "次にお相手様です。生年月日（西暦）をお教えくださいませ。（例：2002/05/03）";
    case STATES.ASK_PARTNER_AGE_RANGE:
      return "差し支えなければ、お相手様の年代だけ。（例：20代前半／20代後半／30代前半）";
    case STATES.ASK_PARTNER_BTIME:
      return "お相手様の出生時刻が分かればお教えくださいませ。不明で結構です。";
    case STATES.ASK_PARTNER_PREF:
      return "お相手様の出身地（都道府県）が分かれば、お教えくださいませ。不明でも結構です。";
    case STATES.ASK_PARTNER_MBTI:
      return "お相手様のMBTIは分かりますか？分からなければ“不明”で結構です。";

    case STATES.ASK_RELATION:
      return "いまの関係性を、ひとことで。（片想い／交際中／曖昧／復縁など、自由で結構です）";
    case STATES.ASK_RECENT_EVENT:
      return "直近で起きた出来事を、短くで。（例：3日前に既読のまま／先週会った など）";
    case STATES.ASK_CONCERN_LONG:
      return "最後に、いちばん知りたいことを伺います。何に悩んでおられて、どうなりたいですか？長くて構いません。迷ったら、①直近の事実②不安③理想④期限 の順にお書きくださいませ。";
    default:
      return null;
  }
}

/**
 * ここがキモ：
 * - stateに応じて「選択肢ボタン」「不明ボタン」を出す
 * - 生年月日（自分・相手）には不明を出さない（要件）
 */
function renderChoicesForState(s) {
  const spec = choicesSpec(s);
  if (!spec) {
    hideChoices();
    return;
  }

  const { options, allowUnknown } = spec;
  const items = [...options];

  if (allowUnknown) items.push({ label: "不明", value: "不明", kind: "primary" });

  showChoices(items);
}

function choicesSpec(s) {
  const MBTI = [
    "INTJ","INTP","ENTJ","ENTP",
    "INFJ","INFP","ENFJ","ENFP",
    "ISTJ","ISFJ","ESTJ","ESFJ",
    "ISTP","ISFP","ESTP","ESFP"
  ].map(x => ({ label: x, value: x }));

  switch (s) {
    case STATES.ASK_USER_GENDER:
      return {
        options: [
          { label: "女性", value: "女性", kind: "primary" },
          { label: "男性", value: "男性", kind: "primary" },
          { label: "その他", value: "その他/答えたくない", kind: "primary" },
        ],
        allowUnknown: false,
      };

    case STATES.ASK_USER_BTIME:
    case STATES.ASK_PARTNER_BTIME:
      return {
        options: [
          { label: "00:00", value: "00:00" },
          { label: "06:00", value: "06:00" },
          { label: "12:00", value: "12:00" },
          { label: "18:00", value: "18:00" },
        ],
        allowUnknown: true,
      };

    case STATES.ASK_USER_MBTI:
    case STATES.ASK_PARTNER_MBTI:
      return { options: MBTI, allowUnknown: true };

    case STATES.ASK_PARTNER_AGE_RANGE:
      return {
        options: [
          { label: "10代", value: "10代" },
          { label: "20代前半", value: "20代前半" },
          { label: "20代後半", value: "20代後半" },
          { label: "30代前半", value: "30代前半" },
          { label: "30代後半", value: "30代後半" },
          { label: "40代以上", value: "40代以上" },
        ],
        allowUnknown: true,
      };

    case STATES.ASK_PARTNER_PREF:
      return {
        options: [],
        allowUnknown: true,
      };

    default:
      // 生年月日や自由記述は選択肢なし
      return null;
  }
}

function showChoices(items) {
  choicesBox.classList.remove("is-hidden");
  choicesRow.innerHTML = "";

  // ボタン生成
  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `chip ${item.kind === "primary" ? "primary" : ""}`.trim();
    btn.textContent = item.label;

    btn.onclick = async () => {
      // 送信と同じ経路へ流す
      await submitAnswer(item.value);
    };

    choicesRow.appendChild(btn);
  }
}

function hideChoices() {
  choicesBox.classList.add("is-hidden");
  choicesRow.innerHTML = "";
}

function applyAnswer(s, vRaw) {
  const v = String(vRaw ?? "").trim();

  try {
    // USER
    if (s === STATES.ASK_USER_GENDER) {
      if (v.length < 1) return false;
      intake.user.gender = v;
    }

    if (s === STATES.ASK_USER_BDAY) {
      // 要件：ここは不明禁止
      if (!isDate(v)) return false;
      intake.user.birthday = normDate(v);
    }

    if (s === STATES.ASK_USER_BTIME) {
      if (!isTimeOrUnknown(v)) return false;
      intake.user.birth_time = normTimeOrNull(v);
    }

    if (s === STATES.ASK_USER_PREF) {
      if (v.length < 2) return false;
      intake.user.birth_prefecture = v;
    }

    if (s === STATES.ASK_USER_MBTI) {
      if (!isMbtiOrUnknown(v)) return false;
      intake.user.mbti = normMbtiOrNull(v);
    }

    // PARTNER
    if (s === STATES.ASK_PARTNER_BDAY) {
      // 要件：相手も不明禁止（信用問題）
      if (!isDate(v)) return false;
      intake.partner.birthday = normDate(v);
    }

    if (s === STATES.ASK_PARTNER_AGE_RANGE) {
      if (v === "不明") {
        intake.partner.age_range = null;
      } else {
        if (v.length < 2) return false;
        intake.partner.age_range = v;
      }
    }

    if (s === STATES.ASK_PARTNER_BTIME) {
      if (!isTimeOrUnknown(v)) return false;
      intake.partner.birth_time = normTimeOrNull(v);
    }

    if (s === STATES.ASK_PARTNER_PREF) {
      if (v === "不明") {
        intake.partner.birth_prefecture = null;
      } else {
        if (v.length < 2) return false;
        intake.partner.birth_prefecture = v;
      }
    }

    if (s === STATES.ASK_PARTNER_MBTI) {
      if (!isMbtiOrUnknown(v)) return false;
      intake.partner.mbti = normMbtiOrNull(v);
    }

    if (s === STATES.ASK_RELATION) {
      if (v.length < 2) return false;
      intake.partner.relation = v;
    }

    if (s === STATES.ASK_RECENT_EVENT) {
      if (v.length < 2) return false;
      intake.partner.recent_event = v;
    }

    if (s === STATES.ASK_CONCERN_LONG) {
      if (v.length < 30) return false;
      intake.concern.free_text = v;
    }

    intake.meta.updated_at = new Date().toISOString();
    saveIntake(intake);
    return true;
  } catch (e) {
    return false;
  }
}

async function advance() {
  // USER FLOW
  if (state === STATES.ASK_USER_GENDER) {
    state = STATES.ASK_USER_BDAY;
    ask(state);
    return;
  }
  if (state === STATES.ASK_USER_BDAY) {
    state = STATES.ASK_USER_BTIME;
    ask(state);
    return;
  }
  if (state === STATES.ASK_USER_BTIME) {
    state = STATES.ASK_USER_PREF;
    ask(state);
    return;
  }
  if (state === STATES.ASK_USER_PREF) {
    state = STATES.ASK_USER_MBTI;
    ask(state);
    return;
  }
  if (state === STATES.ASK_USER_MBTI) {
    hideChoices();
    state = STATES.MINI_READ_USER;
    pushBot("少々お待ちくださいませ…");
    const out = await generate("mini_user", intake);
    intake.derived.user_mini_reading = out.text;
    saveIntake(intake);
    pushBot(out.text);
    state = STATES.ASK_PARTNER_BDAY;
    ask(state);
    return;
  }

  // PARTNER FLOW
  if (state === STATES.ASK_PARTNER_BDAY) {
    // 相手の生年月日がある前提なので年代はスキップ（必要なら残してOK）
    state = STATES.ASK_PARTNER_BTIME;
    ask(state);
    return;
  }
  if (state === STATES.ASK_PARTNER_AGE_RANGE) {
    state = STATES.ASK_PARTNER_BTIME;
    ask(state);
    return;
  }
  if (state === STATES.ASK_PARTNER_BTIME) {
    state = STATES.ASK_PARTNER_PREF;
    ask(state);
    return;
  }
  if (state === STATES.ASK_PARTNER_PREF) {
    state = STATES.ASK_PARTNER_MBTI;
    ask(state);
    return;
  }
  if (state === STATES.ASK_PARTNER_MBTI) {
    state = STATES.ASK_RELATION;
    ask(state);
    return;
  }

  // RELATION
  if (state === STATES.ASK_RELATION) {
    state = STATES.ASK_RECENT_EVENT;
    ask(state);
    return;
  }

  if (state === STATES.ASK_RECENT_EVENT) {
    hideChoices();
    state = STATES.MINI_READ_PARTNER;
    pushBot("ありがとうございます。お相手様の気配を拝見いたしますね…");
    const out = await generate("mini_partner", intake);
    intake.derived.partner_mini_reading = out.text;
    saveIntake(intake);
    pushBot(out.text);
    state = STATES.ASK_CONCERN_LONG;
    ask(state);
    return;
  }

  if (state === STATES.ASK_CONCERN_LONG) {
    hideChoices();
    pushBot("承りました。では、無料の鑑定をお渡しします。");
    const out = await generate("free_report", intake);
    pushBotHtml(out.html);
    state = STATES.DONE;

    showPaidActions();
    bindPaidActions(() => intake);

    pushBot("この先は、詳しい鑑定（有料）もお作りできます。まずはここまで、いかがでしたか。");
    return;
  }
}

async function generate(mode, intakeObj) {
  const res = await fetch("/api/fortune-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, intake: intakeObj }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("fortune-generate error:", errText);
    throw new Error(errText);
  }

  return await res.json();
}

/* paid actions */
function hidePaidActions() {
  const box = document.getElementById("paidActions");
  if (box) box.classList.add("is-hidden");
}

function showPaidActions() {
  const box = document.getElementById("paidActions");
  const note = document.getElementById("paidActionsNote");
  const dev480 = document.getElementById("btnDevPaid480");
  const dev980 = document.getElementById("btnDevPaid980");

  if (!box) return;

  box.classList.remove("is-hidden");

  if (DEV_PAID) {
    if (note) note.classList.remove("is-hidden");
    if (dev480) dev480.classList.remove("is-hidden");
    if (dev980) dev980.classList.remove("is-hidden");
  } else {
    if (note) note.classList.add("is-hidden");
    if (dev480) dev480.classList.add("is-hidden");
    if (dev980) dev980.classList.add("is-hidden");
  }
}

function setPaidButtonsEnabled(enabled) {
  const ids = ["btnPaid480", "btnPaid980", "btnDevPaid480", "btnDevPaid980"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  }
}

function bindPaidActions(intakeRefGetter) {
  // 本番：ここはStripeへ遷移（準備中なので今は何もしない）
  const paid480 = document.getElementById("btnPaid480");
  const paid980 = document.getElementById("btnPaid980");

  if (paid480) {
    paid480.onclick = () => {
      pushBot("ただいま準備中でございます。もう少々お待ちくださいませ。");
    };
  }
  if (paid980) {
    paid980.onclick = () => {
      pushBot("ただいま準備中でございます。もう少々お待ちくださいませ。");
    };
  }

  // テスト：決済なしで生成
  const dev480 = document.getElementById("btnDevPaid480");
  const dev980 = document.getElementById("btnDevPaid980");

  if (dev480) {
    dev480.onclick = async () => {
      try {
        setPaidButtonsEnabled(false);
        pushBot("承知しました。480円版（テスト）の鑑定をお出しします…");
        const it = intakeRefGetter();
        const out = await generate("paid_300", it); // 互換：mode名はあなたのAPI側に合わせる
        pushBot(out.text || out.html || "");
      } catch (e) {
        pushBot("申し訳ございません。480円版の生成に失敗しました。");
        console.error(e);
      } finally {
        setPaidButtonsEnabled(true);
      }
    };
  }

  if (dev980) {
    dev980.onclick = async () => {
      try {
        setPaidButtonsEnabled(false);
        pushBot("承知しました。980円版（テスト）の鑑定をお出しします…");
        const it = intakeRefGetter();
        const out = await generate("paid_980", it);
        pushBot(out.text || out.html || "");
      } catch (e) {
        pushBot("申し訳ございません。980円版の生成に失敗しました。");
        console.error(e);
      } finally {
        setPaidButtonsEnabled(true);
      }
    };
  }
}

/* UI helpers */
function pushBot(t) {
  chatEl.insertAdjacentHTML("beforeend", `<div class="msg bot">${escapeHtml(t)}</div>`);
  chatEl.scrollTop = chatEl.scrollHeight;
}
function pushBotHtml(html) {
  chatEl.insertAdjacentHTML("beforeend", `<div class="msg bot">${html}</div>`);
  chatEl.scrollTop = chatEl.scrollHeight;
}
function pushUser(t) {
  chatEl.insertAdjacentHTML("beforeend", `<div class="msg user">${escapeHtml(t)}</div>`);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function saveIntake(itk) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(itk));
}
function loadIntake() {
  const s = localStorage.getItem(STORAGE_KEY);
  return s ? JSON.parse(s) : newIntake();
}

/* validators */
function isDate(v) {
  // 2003/01/07 or 2003-01-07
  return /^\d{4}[\/-]\d{2}[\/-]\d{2}$/.test(v.trim());
}
function normDate(v) {
  return v.trim().replaceAll("/", "-");
}
function isTimeOrUnknown(v) {
  const t = v.trim();
  if (t === "不明" || t.toLowerCase() === "unknown") return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}
function normTimeOrNull(v) {
  const t = v.trim();
  if (!t || t === "不明" || t.toLowerCase() === "unknown") return null;
  return t;
}
function isMbtiOrUnknown(v) {
  const t = v.trim().toUpperCase();
  if (t === "不明" || t === "UNKNOWN") return true;
  return /^[EI][NS][TF][JP]$/.test(t);
}
function normMbtiOrNull(v) {
  const t = v.trim().toUpperCase();
  if (!t || t === "不明" || t === "UNKNOWN") return null;
  return t;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
