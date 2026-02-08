// /lib/fortune/buildPrompt.js
import { promptMiniUser } from "./prompts/mini_user.js";
import { promptMiniPartner } from "./prompts/mini_partner.js";

export function buildPrompt(mode, intake) {
  switch (mode) {
    case "mini_user":
      return promptMiniUser(intake);
    case "mini_partner":
      return promptMiniPartner(intake);
    default:
      return `Unsupported mode: ${mode}`;
  }
}
