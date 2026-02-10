// lib/fortune/deriveElements.js

const STEMS = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];

// 天干→五行
const STEM_TO_ELEMENT = {
  "甲":"木","乙":"木",
  "丙":"火","丁":"火",
  "戊":"土","己":"土",
  "庚":"金","辛":"金",
  "壬":"水","癸":"水",
};

// 地支→五行（簡易）
const BRANCH_TO_ELEMENT = {
  "子":"水","丑":"土","寅":"木","卯":"木",
  "辰":"土","巳":"火","午":"火","未":"土",
  "申":"金","酉":"金","戌":"土","亥":"水",
};

// 月支（節入り厳密ではなく“月”の簡易対応）
// 寅=2月, 卯=3月, ... , 子=12月, 丑=1月
function monthToBranch(month) {
  const map = {
    1:"丑", 2:"寅", 3:"卯", 4:"辰", 5:"巳", 6:"午",
    7:"未", 8:"申", 9:"酉", 10:"戌", 11:"亥", 12:"子",
  };
  return map[month] || null;
}

function parseBirthday(birthday) {
  // "YYYY-MM-DD" か {year,month,day} を許容
  if (!birthday) return null;

  if (typeof birthday === "string") {
    const m = birthday.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  }

  if (typeof birthday === "object") {
    const y = Number(birthday.year);
    const mo = Number(birthday.month);
    const d = Number(birthday.day);
    if (!y || !mo || !d) return null;
    return { year: y, month: mo, day: d };
  }

  return null;
}

function yearToStemBranch(year) {
  // 西暦4年が 甲子 の基準（簡易換算）
  const stem = STEMS[(year - 4) % 10 < 0 ? (year - 4) % 10 + 10 : (year - 4) % 10];
  const branch = BRANCHES[(year - 4) % 12 < 0 ? (year - 4) % 12 + 12 : (year - 4) % 12];
  return { stem, branch };
}

export function deriveElementsFromBirthday(birthday) {
  const b = parseBirthday(birthday);
  if (!b) {
    return {
      primary: "不明",
      secondary: "不明",
      meta: { reason: "birthday_missing_or_invalid" },
    };
  }

  const { stem, branch } = yearToStemBranch(b.year);
  const monthBranch = monthToBranch(b.month);

  const primary = STEM_TO_ELEMENT[stem] || "不明";                 // 年干→主気（MVP）
  const secondary = (monthBranch && BRANCH_TO_ELEMENT[monthBranch]) || "不明"; // 月支→補助気（MVP）

  return {
    primary,
    secondary,
    meta: {
      yearStem: stem,
      yearBranch: branch,
      monthBranch: monthBranch,
    },
  };
}
