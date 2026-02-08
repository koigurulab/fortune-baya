import { promptMiniUser } from "./prompts/mini_user.js";
import { promptMiniPartner } from "./prompts/mini_partner.js";
import { promptFreeReport } from "./prompts/free_report.js";
import { promptPaid300 } from "./prompts/paid_300.js";
import { promptPaid300 } from "./prompts/paid_980.js";

export function buildPrompt(mode, intake) {
  switch (mode) {
    case "mini_user": return promptMiniUser(intake);
    case "mini_partner": return promptMiniPartner(intake);
    case "free_report": return promptFreeReport(intake);
    default: return `Unsupported mode: ${mode}`;
  }
}
