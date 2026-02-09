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
  ASK_PARTNER_MBTI: "ASK_PARTNER_MBTI",
  ASK_PARTNER_BIRTHPLACE: "ASK_PARTNER_BIRTHPLACE",

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
      gender: null,            // "female" | "male" | "other" | "no_answer"
      birthday: null,          // "YYYY-MM-DD"
      birth_time: null,        // "HH:MM" | null
      birth_prefecture: null,  // string
      mbti: null,              // "ENTJ" etc | null
    },
    partner: {
      birthday: null,
      birth_time: null,
      mbti: null,
      age_range: null,
      birthplace: null,        // 追加：相手の出身地（自由入力）
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

const quickbarEl = document.getElementById("quickbar");
const quickHintEl = document.getElementById("quickHint");
const chipsEl = document.getElementById("chips");

resetBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  intake = newIntake();
  state = STATES.ASK_USER_GENDER;
  chatEl.innerHTML = "";
  boot();
});

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = (inputEl.value || "").trim();
  if (!v) return;

  pushUser(v);
  inputEl.value = "";

  const ok = applyAnswer(state, v);
  if (!ok) {
    pushBot("恐れ入ります。形式が少し違うようです。もう一度、例に沿って教えてくださいませ。");
    return;
  }

  await advance();
});

function boot() {
  pushBot("こんばんは。占いばあやでございます。ひとつずつ伺いますね。");
  ask(state);
}
boot();

function ask(s) {
  const q = questionFor(s);
  if (q) pushBot(q);
  renderUIByState(s);
}

function questionFor(s) {
  switch (s) {
    case STATES.ASK_USER_GENDER:
      return "まず、あなた様の性別をお伺いしてもよろしいですか。答えたくなければ“答えたくない”で結構でございます。";

    case STATES.ASK_USER_BDAY:
      return "次に、あなた様の生年月日をお教えくださいませ。（カレンダーから選べます）";

    case STATES.ASK_USER_BTIME:
      return "出生時刻が分かればお教えくださいませ。（例：05:15）不明でも大丈夫でございます。";

    case STATES.ASK_USER_PREF:
      return "お生まれの都道府県をお伺いしてもよろしいですか。";

    case STATES.ASK_USER_MBTI:
      return "あなた様のMBTIは何型でしょう？分からなければ“不明”で結構です。";

    case STATES.ASK_PARTNER_BDAY:
      return "次にお相手様です。生年月日は分かりますか？分からなければ“不明”で大丈夫でございます。";

    case STATES.ASK_PARTNER_AGE_RANGE:
      return "では差し支えなければ、お相手様の年代だけ。（例：20代前半／20代後半／30代前半）";

    case STATES.ASK_PARTNER_BTIME:
      return "お相手様の出生時刻が分かればお教えくださいませ。不明で結構です。";

    case STATES.ASK_PARTNER_MBTI:
      return "お相手様のMBTIは分かりますか？分からなければ“不明”でも結構です。";

    case STATES.ASK_PARTNER_BIRTHPLACE:
      return "最後に、お相手様の出身地（都道府県や国など）をお伺いしてもよろしいですか。不明なら“不明”で結構です。";

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

function applyAnswer(s, v) {
  try {
    if (s === STATES.ASK_USER_GENDER) {
      // ボタンからは female/male/other/no_answer が入る。手入力でも受ける。
      const t = v.trim().toLowerCase();
      const map = {
        "女性": "female",
        "女": "female",
        "female": "female",
        "男性": "male",
        "男": "male",
        "male": "male",
        "その他": "other",
        "other": "other",
        "答えたくない": "no_answer",
        "回答したくない": "no_answer",
        "no_answer": "no_answer",
      };
      const g = map[v.trim()] || map[t];
      if (!g) return false;
      intake.user.gender = g;
    }

    if (s === STATES.ASK_USER_BDAY) {
      if (!isDateOrISODate(v)) return false;
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

    if (s === STATES.ASK_PARTNER_BDAY) {
      // "不明" OK
      if (!isDateOrISODateOrUnknown(v)) return false;
      intake.partner.birthday = normDateOrNull(v);
    }

    if (s === STATES.ASK_PARTNER_AGE_RANGE) {
      if (v.length < 3) return false;
      intake.partner.age_range = v;
    }

    if (s === STATES.ASK_PARTNER_BTIME) {
      if (!isTimeOrUnknown(v)) return false;
      intake.partner.birth_time = normTimeOrNull(v);
    }

    if (s === STATES.ASK_PARTNER_MBTI) {
      if (!isMbtiOrUnknown(v)) return false;
      intake.partner.mbti = normMbtiOrNull(v);
    }

    if (s === STATES.ASK_PARTNER_BIRTHPLACE) {
      if (v.length < 2) return false;
      intake.partner.birthplace = (v.trim() === "不明") ? null : v.trim();
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

  if (state === STATES.ASK_PARTNER_BDAY) {
    state = intake.partner.birthday ? STATES.ASK_PARTNER_BTIME : STATES.ASK_PARTNER_AGE_RANGE;
    ask(state);
    return;
  }

  if (state === STATES.ASK_PARTNER_AGE_RANGE) {
    state = STATES.ASK_PARTNER_BTIME;
    ask(state);
    return;
  }

  if (state === STATES.ASK_PARTNER_BTIME) {
    state = STATES.ASK_PARTNER_MBTI;
    ask(state);
    return;
  }

  if (state === STATES.ASK_PARTNER_MBTI) {
    state = STATES.ASK_PARTNER_BIRTHPLACE;
    ask(state);
    return;
  }

  if (state === STATES.ASK_PARTNER_BIRTHPLACE) {
    state = STATES.ASK_RELATION;
    ask(state);
    return;
  }

  if (state === STATES.ASK_RELATION) {
    state = STATES.ASK_RECENT_EVENT;
    ask(state);
    return;
  }

  if (state === STATES.ASK_RECENT_EVENT) {
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
    pushBot("承りました。では、無料の鑑定をお渡しします。");
    const out = await generate("free_report", intake);
    pushBotHtml(out.html);
    state = STATES.DONE;

    showPaidActions();
    bindPaidActions(() => intake);

    pushBot("この先は、詳しい鑑定（有料）もお作りできます。まずはここまで、いかがでしたか。");
    renderUIByState(state);
    return;
  }
}

async function generate(mode, intake) {
  const res = await fetch("/api/fortune-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, intake }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("fortune-generate error:", errText);
    throw new Error(errText);
  }

  return await res.json();
}

/* ------------------------------
   Paid actions（既存ロジック維持）
-------------------------------- */
const DEV_PAID = new URLSearchParams(location.search).get("dev_paid") === "1";

function showPaidActions() {
  const box = document.getElementById("paidActions");
  const note = document.getElementById("paidActionsNote");
  if (!box) return;

  box.classList.remove("is-hidden");
  if (DEV_PAID && note) note.classList.remove("is-hidden");
}

function setPaidButtonsEnabled(enabled) {
  const b300 = document.getElementById("btnPaid300");
  const b980 = document.getElementById("btnPaid980");
  if (b300) b300.disabled = !enabled;
  if (b980) b980.disabled = !enabled;
}

function bindPaidActions(intakeRefGetter) {
  const b300 = document.getElementById("btnPaid300");
  const b980 = document.getElementById("btnPaid980");

  if (b300) {
    b300.onclick = async () => {
      try {
        setPaidButtonsEnabled(false);
        pushBot("承知しました。480円版の鑑定をお出しします…");
        const it = intakeRefGetter();
        const out = await generate("paid_300", it);
        pushBot(out.text || out.html || "");
      } catch (e) {
        pushBot("申し訳ございません。480円版の生成に失敗しました。");
        console.error(e);
      } finally {
        setPaidButtonsEnabled(true);
      }
    };
  }

  if (b980) {
    b980.onclick = async () => {
      try {
        setPaidButtonsEnabled(false);
        pushBot("承知しました。980円版の鑑定をお出しします…");
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

/* ------------------------------
   UI helpers
-------------------------------- */
function pushBot(t) {
  chatEl.insertAdjacentHTML("beforeend", `<div class="msg bot">${escapeHtml(String(t ?? ""))}</div>`);
  chatEl.scrollTop = chatEl.scrollHeight;
}
function pushBotHtml(html) {
  chatEl.insertAdjacentHTML("beforeend", `<div class="msg bot">${html || ""}</div>`);
  chatEl.scrollTop = chatEl.scrollHeight;
}
function pushUser(t) {
  chatEl.insertAdjacentHTML("beforeend", `<div class="msg user">${escapeHtml(String(t ?? ""))}</div>`);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function saveIntake(itk) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(itk));
}
function loadIntake() {
  const s = localStorage.getItem(STORAGE_KEY);
  return s ? JSON.parse(s) : newIntake();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ------------------------------
   状態に応じた「下ボタン」＆入力UIの切替
-------------------------------- */
function renderUIByState(s) {
  // DONE のときは選択肢を空にしてよい
  if (s === STATES.DONE) {
    setInputMode("text", "ここに入力…");
    setQuickHint("必要であれば、追加でご質問を入力してくださいませ。");
    setChips([]);
    return;
  }

  if (s === STATES.ASK_USER_GENDER) {
    setInputMode("text", "自由入力も可能です（例：女性）");
    setQuickHint("選択肢を押すか、自由入力でも回答できます。");
    setChips([
      { label: "女性", value: "女性" },
      { label: "男性", value: "男性" },
      { label: "その他", value: "その他" },
      { label: "答えたくない", value: "答えたくない" },
    ]);
    return;
  }

  if (s === STATES.ASK_USER_BDAY) {
    setInputMode("date", "生年月日を選択");
    setQuickHint("カレンダーで選ぶか、自由入力でもOKです（例：2003/01/07）。");
    setChips([
      { label: "入力する", value: "__FOCUS__" },
    ]);
    return;
  }

  if (s === STATES.ASK_PARTNER_BDAY) {
    setInputMode("date", "生年月日を選択（不明でも可）");
    setQuickHint("カレンダーで選ぶか、不明なら不明を押してくださいませ。");
    setChips([
      { label: "不明", value: "不明" },
      { label: "入力する", value: "__FOCUS__" },
    ]);
    return;
  }

  if (s === STATES.ASK_USER_BTIME || s === STATES.ASK_PARTNER_BTIME) {
    setInputMode("time", "出生時刻を選択（不明でも可）");
    setQuickHint("分からなければ“不明”で結構でございます。");
    setChips([
      { label: "不明", value: "不明" },
      { label: "入力する", value: "__FOCUS__" },
    ]);
    return;
  }

  if (s === STATES.ASK_USER_MBTI || s === STATES.ASK_PARTNER_MBTI) {
    setInputMode("text", "MBTI（例：ENTJ）／不明");
    setQuickHint("16タイプから選ぶか、分からなければ“不明”を押してくださいませ。");
    setChips([
      { label: "INTJ", value: "INTJ" }, { label: "INTP", value: "INTP" }, { label: "ENTJ", value: "ENTJ" }, { label: "ENTP", value: "ENTP" },
      { label: "INFJ", value: "INFJ" }, { label: "INFP", value: "INFP" }, { label: "ENFJ", value: "ENFJ" }, { label: "ENFP", value: "ENFP" },
      { label: "ISTJ", value: "ISTJ" }, { label: "ISFJ", value: "ISFJ" }, { label: "ESTJ", value: "ESTJ" }, { label: "ESFJ", value: "ESFJ" },
      { label: "ISTP", value: "ISTP" }, { label: "ISFP", value: "ISFP" }, { label: "ESTP", value: "ESTP" }, { label: "ESFP", value: "ESFP" },
      { label: "不明", value: "不明" },
    ], { grid: true });
    return;
  }

  if (s === STATES.ASK_PARTNER_BIRTHPLACE) {
    setInputMode("text", "例：福岡県 / ソウル / 不明");
    setQuickHint("分かる範囲で結構です。都道府県や国・都市などをご入力くださいませ。");
    setChips([
      { label: "不明", value: "不明" },
      { label: "日本（都道府県）", value: "__FOCUS__" },
      { label: "海外（国・都市）", value: "__FOCUS__" },
    ]);
    return;
  }

  // その他は従来通りテキスト入力中心
  setInputMode("text", "ここに入力…");
  setQuickHint("選択肢が無い場合は、自由入力でお答えくださいませ。");
  setChips([]);
}

function setInputMode(type, placeholder) {
  // type は "text" | "date" | "time"
  inputEl.type = type;
  inputEl.placeholder = placeholder || "";
}

function setQuickHint(text) {
  if (!quickHintEl) return;
  quickHintEl.textContent = text || "";
}

function setChips(items, opt = {}) {
  if (!chipsEl) return;

  // grid レイアウト（MBTI用）
  chipsEl.className = opt.grid ? "chips grid" : "chips";
  chipsEl.innerHTML = "";

  (items || []).forEach((it) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = it.label;

    btn.addEventListener("click", () => {
      if (it.value === "__FOCUS__") {
        inputEl.focus();
        // date/time の場合はフォーカスでピッカーが開く環境が多い
        return;
      }

      // date/time input の場合、ボタン値を入れたらそのまま送信
      inputEl.value = it.value;
      formEl.requestSubmit();
    });

    chipsEl.appendChild(btn);
  });
}

/* ------------------------------
   validators（date input対応）
-------------------------------- */
function isDateOrISODate(v) {
  const t = v.trim();
  // 2003/01/07 or 2003-01-07
  return /^\d{4}[\/-]\d{2}[\/-]\d{2}$/.test(t);
}
function isDateOrISODateOrUnknown(v) {
  const t = v.trim();
  if (t === "不明" || t.toLowerCase() === "unknown") return true;
  return isDateOrISODate(t);
}
function normDate(v) {
  // "YYYY/MM/DD" -> "YYYY-MM-DD"
  return v.trim().replaceAll("/", "-");
}
function normDateOrNull(v) {
  const t = v.trim();
  if (!t || t === "不明" || t.toLowerCase() === "unknown") return null;
  return normDate(t);
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
  if (t === "不明" || t === "UNKNOWN" || !t) return null;
  return t;
}
