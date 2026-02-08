// /lib/fortune/schema.js
import { pickTwoElements } from "./elements.js";

export function ensureDerivedWithElements(intake) {
  const it = intake || {};
  it.user = it.user || {};
  it.partner = it.partner || {};
  it.concern = it.concern || {};
  it.derived = it.derived || {};

  const u = it.user;
  const p = it.partner;

  const userSeed = `user|${u.birthday ?? ""}|${u.birth_time ?? ""}|${u.birth_prefecture ?? ""}`;
  const partnerKey = p.birthday ?? p.age_range ?? "";
  const partnerSeed = `partner|${partnerKey}|${p.birth_time ?? ""}`;

  if (!it.derived.user_elements) it.derived.user_elements = pickTwoElements(userSeed);
  if (!it.derived.partner_elements) it.derived.partner_elements = pickTwoElements(partnerSeed);

  return it;
}
