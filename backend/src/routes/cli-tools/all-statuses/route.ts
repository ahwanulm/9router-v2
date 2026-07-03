"use server";


import { GET as claudeGet } from "../claude-settings/route.js";
import { GET as codexGet } from "../codex-settings/route.js";
import { GET as opencodeGet } from "../opencode-settings/route.js";
import { GET as droidGet } from "../droid-settings/route.js";
import { GET as openclawGet } from "../openclaw-settings/route.js";
import { GET as hermesGet } from "../hermes-settings/route.js";
import { GET as coworkGet } from "../cowork-settings/route.js";
import { GET as copilotGet } from "../copilot-settings/route.js";
import { GET as clineGet } from "../cline-settings/route.js";
import { GET as kiloGet } from "../kilo-settings/route.js";
import { GET as deepseekTuiGet } from "../deepseek-tui-settings/route.js";
import { GET as jcodeGet } from "../jcode-settings/route.js";

const STATUS_GETTERS = {
  claude: claudeGet,
  codex: codexGet,
  opencode: opencodeGet,
  droid: droidGet,
  openclaw: openclawGet,
  hermes: hermesGet,
  cowork: coworkGet,
  copilot: copilotGet,
  cline: clineGet,
  kilo: kiloGet,
  "deepseek-tui": deepseekTuiGet,
  jcode: jcodeGet,
};

// Batch endpoint: gather all CLI tool statuses in one round-trip
export async function GET(req: any, res: any) {
  const entries = await Promise.all(
    Object.entries(STATUS_GETTERS).map(async ([toolId, getter]) => {
      try {
        const res = await getter();
        const data = await res.json();
        return [toolId, data];
      } catch {
        return [toolId, null];
      }
    })
  );
  return res.json(Object.fromEntries(entries));
}
