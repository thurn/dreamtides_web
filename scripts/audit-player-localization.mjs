import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPlayerLocalizationFile } from "../eslint-rules/ui-boundary-roles.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COPY_SHAPE = /(?:label|title|subtitle|message|description|detail|placeholder|alt|emptyLabel|busyLabel|effectText|headline|aria-label|ariaLabel)\s*[:=]\s*(["'`][^"'`\n]*["'`])/u;

const EXCLUDED_PREFIXES = [
  "src/cumulus/docs/",
  "src/cumulus/screens/devtools/",
  "src/editor/",
  "src/debug/",
  "src/image_viewer/",
  "src/__test-helpers__/",
  "src/battle/components/BattleContextMenu.tsx",
  "src/battle/test-support.ts",
  "src/components/AuguryJourneyMenu.ts",
  "src/coop/EventLogViewer.tsx",
  "src/cumulus/components/overlay/DeveloperRail.tsx",
  "src/cumulus/internal/reveal/test-utils.tsx",
  "src/cumulus/screens/JourneyDebugEditorScreen.tsx",
  "src/cumulus/screens/PackageDebugDialog.tsx",
  "src/cumulus/screens/TutorialEditorRail.tsx",
  "src/cumulus/screens/battle-overlays/BattleFigmentCreatorOverlay.tsx",
  "src/cumulus/screens/battle-overlays/BattleLogOverlay.tsx",
  "src/screens/cumulus_adapters/card-source-view-model.ts",
  "src/screens/cumulus_adapters/journey-debug-view-model.ts",
];

const EXCLUDED_CONTAINERS = [
  "src/battle/ai/",
  "src/battle/debug/",
  "src/journey_v2/testing/",
  "src/testing/",
  "src/state/use-tutorial-editor.ts",
  "src/state/use-tutorial-presentation-logging.ts",
];

function sourceFiles() {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "src/**/*.ts", "src/**/*.tsx"],
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\n")
    .filter((file) => /\.tsx?$/u.test(file) && !/\.(test|spec)\.tsx?$/u.test(file));
}

export function classify(file, line) {
  if (
    EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix)) ||
    EXCLUDED_CONTAINERS.some((prefix) => file.startsWith(prefix))
  ) return "excluded-developer-surface";
  if (/\b(?:console|logEvent|throw new Error)\b/u.test(line)) return "machine-or-diagnostic-value";
  if (
    file.startsWith("src/rules/") ||
    file.startsWith("src/eventlog/") ||
    file.startsWith("src/runtime/") ||
    file.startsWith("src/battle/integration/")
  ) {
    return "machine-or-diagnostic-value";
  }
  if (
    file.startsWith("src/data/") ||
    file.startsWith("src/types/") ||
    file.startsWith("src/journey_v2/archetypes/")
  ) return "authored-data-source";
  return "unclassified";
}

export function auditPlayerLocalization(files = sourceFiles()) {
  const results = [];
  for (const file of files) {
    if (!existsSync(resolve(ROOT, file))) continue;
    if (isPlayerLocalizationFile(file)) continue;
    const lines = readFileSync(resolve(ROOT, file), "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!COPY_SHAPE.test(line) || /\btxa?\s*\(/u.test(line)) return;
      results.push({ file, line: index + 1, text: line.trim(), classification: classify(file, line) });
    });
  }
  return results;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const results = auditPlayerLocalization();
  for (const result of results) {
    process.stdout.write(`${result.classification}\t${result.file}:${result.line}\t${result.text}\n`);
  }
  if (process.argv.includes("--check") && results.some((result) => result.classification === "unclassified")) {
    process.exitCode = 1;
  }
}
