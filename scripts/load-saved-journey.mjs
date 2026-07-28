import { pathToFileURL } from "node:url";

import { runDevWithEmulator } from "./dev-with-emulator.mjs";

// Launches Vite plus the Realtime Database emulator and opens the app straight
// into a journey previously persisted to disk via the debug overlay's "Save
// Journey" control (see scripts/saved-journeys-api.mjs). The saved journey is
// identified by the name it was saved under, e.g.
//
//   npm run load-journey -- "warriors draft"
//
// The app reads `?loadJourney=<name>` (see src/runtime/runtime-config.ts), fetches
// the matching snapshot from `/api/saved-journeys`, and replaces the room's journey
// state with it before rendering the run.

export function buildOpenArgs(argv) {
  const journeyName = argv.join(" ").trim();
  if (journeyName === "") {
    return null;
  }
  return ["--open", `/?loadJourney=${encodeURIComponent(journeyName)}`];
}

async function main() {
  const openArgs = buildOpenArgs(process.argv.slice(2));
  if (openArgs === null) {
    console.error(
      'Usage: npm run load-journey -- "<saved journey name>"\n' +
        "The name must match a journey saved from the debug overlay (saved-journeys/).",
    );
    process.exit(1);
  }
  await runDevWithEmulator(openArgs);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
