import { pathToFileURL } from "node:url";

import { runDevWithEmulator } from "./dev-with-emulator.mjs";

// Launches Vite plus the Realtime Database emulator and opens the app straight
// into a quest previously persisted to disk via the debug overlay's "Save
// Quest" control (see scripts/saved-quests-api.mjs). The saved quest is
// identified by the name it was saved under, e.g.
//
//   npm run load-quest -- "warriors draft"
//
// The app reads `?loadQuest=<name>` (see src/runtime/runtime-config.ts), fetches
// the matching snapshot from `/api/saved-quests`, and replaces the room's quest
// state with it before rendering the run.

export function buildOpenArgs(argv) {
  const questName = argv.join(" ").trim();
  if (questName === "") {
    return null;
  }
  return ["--open", `/?loadQuest=${encodeURIComponent(questName)}`];
}

async function main() {
  const openArgs = buildOpenArgs(process.argv.slice(2));
  if (openArgs === null) {
    console.error(
      'Usage: npm run load-quest -- "<saved quest name>"\n' +
        "The name must match a quest saved from the debug overlay (saved-quests/).",
    );
    process.exit(1);
  }
  await runDevWithEmulator(openArgs);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
