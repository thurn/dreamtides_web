#!/usr/bin/env node

// Run this with `node .llms/skills/ltodd/scripts/estimate-part-loc.mjs`

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const repositoryRoot = path.resolve(scriptDirectory, "../../../..");
const sourceRoot = path.join(repositoryRoot, "src");
const indexPath = path.join(repositoryRoot, "ltodd", "index.md");
const sourceExtensions = new Set([".css", ".ts", ".tsx"]);
const pathSummaryLimit = 5;

const alwaysExcluded = [
  /(?:^|\/)__test-helpers__(?:\/|$)/,
  /(?:^|\/)__tests__(?:\/|$)/,
  /(?:^|\/)(?:testing|test-support|test-utils)(?:[./-]|\/|$)/,
  /\.(?:spec|test)\.[^.]+$/,
  /^src\/battle\/debug\//,
  /^src\/components\/ErrorBoundary\.tsx$/,
  /^src\/cumulus\/components\/__docgen/,
  /^src\/cumulus\/docs\//,
  /^src\/cumulus\/screens\/(?:JourneyDebugEditorScreen|PackageDebugDialog|TutorialEditorRail)\.tsx$/,
  /^src\/cumulus\/screens\/devtools\//,
  /^src\/data\/tutorial-editor-api\.ts$/,
  /^src\/debug\//,
  /^src\/editor\//,
  /^src\/image_viewer\//,
  /^src\/rules\/battle\/apply-debug-edit\.ts$/,
  /^src\/rules\/replay\//,
  /^src\/runtime\/qa-/,
  /^src\/screens\/CardSourceOverlay\.tsx$/,
  /^src\/screens\/cumulus_adapters\/(?:card-source|journey-debug|package-debug)-view-model\.ts$/,
  /^src\/screens\/(?:DebugScreen|JourneyDebugEditor|debug-helpers)/,
];

const excludedIfUnmatched = [
  /^src\/coop\//,
  /^src\/eventlog\//,
  /^src\/firebase\//,
  /^src\/logging\.ts$/,
  /^src\/runtime\//,
  /^src\/vendor\//,
];

function matches(relativePath, patterns) {
  return patterns.some((pattern) => pattern.test(relativePath));
}

function isExperimentalDraftSource(relativePath) {
  if (/^src\/draft\/(?:fresh20|replay)\//.test(relativePath)) return true;
  if (
    /^src\/draft\/pool\/variant-/.test(relativePath) &&
    relativePath !== "src/draft/pool/variant-tides4.ts"
  ) {
    return true;
  }
  return /^src\/draft\/pool\/(?:affinity|pick-|seed-|tides[235]?-io)/.test(
    relativePath,
  );
}

// Rules are ordered. The first matching part owns the whole file for estimation.
const partRules = [
  // Reusable catalog controls, surfaces, communication, and journey chrome
  // belong to the design system even when their names mention gameplay.
  {
    directory: "cumulus",
    patterns: [
      /^src\/cumulus\/components\/(?:card|controls|overlay|status|typography)\//,
      /^src\/cumulus\/components\/hud\/(?:CoopPresenceStatus|EssenceValue|JourneyStatusBar|Motes|TideDisc|TidesInfoLabel)\.tsx$/,
      /^src\/cumulus\/primitives\/Pressable\.tsx$/,
    ],
  },
  {
    directory: "tutorial",
    patterns: [/tutorial/i],
  },
  {
    directory: "gamble_site",
    patterns: [/gamble/i, /gravok-wager|starway-stairs|tidemark-ladder-climb/i],
  },
  {
    directory: "exploration_augury",
    patterns: [
      /augury|exploration/i,
      /^src\/journey_v2\//,
      /^src\/reward-selection\//,
    ],
  },
  {
    directory: "battle_setup",
    patterns: [
      /^src\/battle\/(?:ai|integration)\//,
      /^src\/battle\/state\/create-initial-state\.ts$/,
      /^src\/coop\/providers\/battle-init-provider\.ts$/,
      /^src\/data\/(?:dreamwell-database|figment-database|materialized-figments)\.ts$/,
      /(?:^|\/|-)battle-start(?:[./_/-]|$)/i,
      /BattleStart/,
    ],
  },
  {
    directory: "battle_outcomes",
    patterns: [
      /^src\/battle\/(?:components|ui)\//,
      /^src\/battle\/use-/,
      /^src\/components\/BattleSiteRoute\.tsx$/,
      /^src\/cumulus\/components\/battle\//,
      /^src\/cumulus\/screens\/(?:BattleForeseeOverlay|BattleResultSurface|CardZoneBrowserOverlay|MobileBattleScreen)/,
      /^src\/cumulus\/screens\/battle-overlays\//,
      /^src\/screens\/cumulus_adapters\/(?:mobile-battle|MobileBattle)/,
    ],
  },
  {
    directory: "battle_rules",
    patterns: [
      /^src\/battle\/(?:engine|state)\//,
      /^src\/battle\/automation\//,
      /^src\/battle\/(?:automatic-intent-key|card-definition|center-preferred-slot|random|semantic-play|starter-card-targets|types)\.ts$/,
      /^src\/rules\/battle\//,
    ],
  },
  {
    directory: "draft_deckbuilding",
    patterns: [
      /^src\/(?:draft|purge|transfiguration)\//,
      /^src\/(?:card-type-change)\.ts$/,
      /^src\/coop\/providers\/(?:deck|draft)-provider\.ts$/,
      /^src\/data\/(?:draft-site-bootstrap|starter-cards|tides4-preview)\.ts$/,
      /^src\/rules\/journey\/(?:deck|draft)\.ts$/,
      /^src\/state\/deck-entry-ids\.ts$/,
      /^src\/cumulus\/screens\/(?:DesktopDeckViewer|DraftScreen|DuplicationSiteScreen|MobileDeckViewer|PoolViewerScreen|PurgeSiteScreen|StartingDeckOverlay|TransfigurationSiteScreen)/,
      /^src\/screens\/cumulus_adapters\/(?:desktop-deck|draft|duplication|mobile-deck|pool-viewer|purge|starting-deck|transfiguration|DesktopDeck|DraftSite|Duplication|MobileDeck|PoolViewer|Purge|StartingDeck|Transfiguration)/,
    ],
  },
  {
    directory: "sites",
    patterns: [
      /^src\/(?:dreamsign|random-site|rewards|shop)\//,
      /^src\/coop\/providers\/site-provider\.ts$/,
      /^src\/data\/(?:dreamsign-profiles|economy-data)\.ts$/,
      /^src\/rules\/journey\/(?:reward-effects|shop|sites)\.ts$/,
      /^src\/types\/(?:economy-data|site-type)\.ts$/,
      /^src\/cumulus\/screens\/(?:CardShopSiteScreen|DreamsignBazaarSiteScreen|DreamsignReplacementDialog|DreamsignRevelationScreen|GuideGallerySiteLayout|RandomSiteScreen)/,
      /^src\/screens\/cumulus_adapters\/(?:card-shop|dreamsign-bazaar|dreamsign-revelation|inline-reward|random-site|CardShop|DreamsignBazaar|DreamsignRevelation|RandomSite)/,
    ],
  },
  {
    directory: "journeys",
    patterns: [
      /^src\/(?:affiliations|atlas|state)\//,
      /^src\/(?:App|main)\.tsx$/,
      /^src\/components\/(?:DreamscapeJourneyMenu|FrontDoorRouter)\.tsx$/,
      /^src\/coop\/providers\/lifecycle-provider\.ts$/,
      /^src\/data\/(?:atlas-data|dream-avatar-selection|dreamscapes|journey-content|nightmare|nightmare-identity)\.ts$/,
      /^src\/rules\/(?:events|fold-state|front-door|invariants|reducer)\.ts$/,
      /^src\/rules\/journey\/lifecycle\.ts$/,
      /^src\/types\/(?:atlas-data|journey|layer-name)\.ts$/,
      /^src\/cumulus\/components\/(?:atlas|dreamscape|hud)\//,
      /^src\/cumulus\/screens\/(?:ApplicationStateScreen|AtlasScreen|DreamscapeScreen|JourneyCompleteScreen|JourneyFailedScreen|JourneyStartScreen|LoadingScreen|MainMenuScreen|journey-start)/,
      /^src\/screens\/cumulus_adapters\/(?:atlas|dreamscape|journey-complete|journey-failed|journey-start|loading|main-menu|Atlas|Dreamscape|JourneyComplete|JourneyFailed|JourneyStart|Loading|MainMenu)/,
    ],
  },
  {
    directory: "cumulus_interaction",
    patterns: [
      /^src\/components\/(?:CumulusJourneyChrome|JourneyUtilityMenuController|ScreenRouter)\./,
      /^src\/cumulus\/CumulusRoot\.tsx$/,
      /^src\/cumulus\/internal\/reveal\//,
      /^src\/cumulus\/primitives\/(?:motion-time|pointer-gesture|press-feedback|safe-area|use-scale-to-fit)\./,
      /^src\/cumulus\/screens\/(?:chrome-geometry|use-is-desktop)\./,
      /^src\/screens\/cumulus_adapters\/registry\.tsx$/,
    ],
  },
  {
    directory: "dreamtides",
    patterns: [/^src\/data\//, /^src\/rules\//, /^src\/types\//],
  },
  {
    directory: "cumulus",
    patterns: [/^src\/cumulus\//, /^src\/index\.css$/],
  },
];

function usage() {
  return [
    "Usage: estimate-part-loc.mjs [--details | --paths]",
    "",
    "Estimates physical TS, TSX, and CSS lines associated with each LToDD part.",
    "Use --details to print every file assignment and the excluded/unassigned files.",
    "Use --paths to print the five highest-line-count source neighborhoods per part.",
  ].join("\n");
}

export function parseArguments(argumentsList) {
  let details = false;
  let paths = false;
  for (const argument of argumentsList) {
    if (argument === "--details") {
      details = true;
      continue;
    }
    if (argument === "--paths") {
      paths = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  if (details && paths) {
    throw new Error("--details and --paths cannot be used together");
  }
  return { details, paths };
}

async function readParts() {
  const index = await fs.readFile(indexPath, "utf8");
  const pattern = /^## Part ([^:]+): (.+)\r?\n\r?\nDirectory: `\/([^`]+)`/gm;
  const parts = [...index.matchAll(pattern)].map((match) => ({
    numeral: match[1],
    title: match[2],
    directory: match[3],
  }));
  if (parts.length === 0) {
    throw new Error(`no LToDD parts found in ${indexPath}`);
  }

  const indexedDirectories = new Set(parts.map((part) => part.directory));
  const classifiedDirectories = new Set(
    partRules.map((rule) => rule.directory),
  );
  const missingRules = parts.filter(
    (part) => !classifiedDirectories.has(part.directory),
  );
  const staleRules = partRules.filter(
    (rule) => !indexedDirectories.has(rule.directory),
  );
  if (missingRules.length > 0 || staleRules.length > 0) {
    const messages = [
      ...missingRules.map(
        (part) => `missing classifier for /${part.directory}`,
      ),
      ...staleRules.map((rule) => `stale classifier for /${rule.directory}`),
    ];
    throw new Error(`source-part map is out of sync:\n${messages.join("\n")}`);
  }
  return parts;
}

async function collectSourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(absolutePath)));
    } else if (
      entry.isFile() &&
      sourceExtensions.has(path.extname(entry.name))
    ) {
      files.push(absolutePath);
    }
  }
  return files;
}

function countPhysicalLines(text) {
  if (text.length === 0) return 0;
  const lineCount = text.split(/\r?\n/).length;
  return /\r?\n$/.test(text) ? lineCount - 1 : lineCount;
}

function classify(relativePath) {
  if (
    matches(relativePath, alwaysExcluded) ||
    isExperimentalDraftSource(relativePath)
  ) {
    return { kind: "excluded" };
  }
  for (const rule of partRules) {
    if (matches(relativePath, rule.patterns)) {
      return { kind: "part", directory: rule.directory };
    }
  }
  if (matches(relativePath, excludedIfUnmatched)) {
    return { kind: "excluded" };
  }
  return { kind: "unassigned" };
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function printSummary(parts, records) {
  const partWidth = 6;
  const directoryWidth =
    Math.max(
      "Directory".length,
      ...parts.map((part) => part.directory.length + 1),
    ) + 2;
  const filesWidth = 8;
  const linesWidth = 12;
  const shareWidth = 9;
  const tableWidth =
    partWidth + directoryWidth + filesWidth + linesWidth + shareWidth;
  const includedRecords = records.filter((record) => record.kind === "part");
  const includedLines = includedRecords.reduce(
    (total, record) => total + record.lines,
    0,
  );
  const totals = new Map(
    parts.map((part) => [part.directory, { files: 0, lines: 0 }]),
  );
  for (const record of includedRecords) {
    const total = totals.get(record.directory);
    total.files += 1;
    total.lines += record.lines;
  }

  process.stdout.write(
    "Estimated design-bearing production source by LToDD part\n",
  );
  process.stdout.write(
    `${"Part".padEnd(partWidth)}${"Directory".padEnd(directoryWidth)}${"Files".padStart(filesWidth)}${"Lines".padStart(linesWidth)}${"Share".padStart(shareWidth)}\n`,
  );
  process.stdout.write(`${"-".repeat(tableWidth)}\n`);
  for (const part of parts) {
    const total = totals.get(part.directory);
    const share = includedLines === 0 ? 0 : (total.lines / includedLines) * 100;
    process.stdout.write(
      `${part.numeral.padEnd(partWidth)}${`/${part.directory}`.padEnd(directoryWidth)}${String(total.files).padStart(filesWidth)}${formatInteger(total.lines).padStart(linesWidth)}${`${share.toFixed(1)}%`.padStart(shareWidth)}\n`,
    );
  }
  process.stdout.write(`${"-".repeat(tableWidth)}\n`);
  process.stdout.write(
    `${"Total".padEnd(partWidth + directoryWidth)}${String(includedRecords.length).padStart(filesWidth)}${formatInteger(includedLines).padStart(linesWidth)}\n`,
  );

  for (const kind of ["unassigned", "excluded"]) {
    const matching = records.filter((record) => record.kind === kind);
    const lines = matching.reduce((total, record) => total + record.lines, 0);
    process.stdout.write(
      `${kind[0].toUpperCase()}${kind.slice(1)}: ${matching.length} files, ${formatInteger(lines)} lines\n`,
    );
  }
}

function printDetails(parts, records) {
  for (const part of parts) {
    process.stdout.write(`\n/${part.directory} — ${part.title}\n`);
    const matching = records
      .filter(
        (record) =>
          record.kind === "part" && record.directory === part.directory,
      )
      .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
    for (const record of matching) {
      process.stdout.write(
        `  ${formatInteger(record.lines).padStart(7)}  ${record.path}\n`,
      );
    }
  }

  for (const kind of ["unassigned", "excluded"]) {
    process.stdout.write(`\n${kind[0].toUpperCase()}${kind.slice(1)}\n`);
    const matching = records
      .filter((record) => record.kind === kind)
      .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
    for (const record of matching) {
      process.stdout.write(
        `  ${formatInteger(record.lines).padStart(7)}  ${record.path}\n`,
      );
    }
  }
}

export function summarizePathNeighborhoods(records, limit = pathSummaryLimit) {
  const neighborhoods = new Map();
  for (const record of records) {
    const directory = path.posix.dirname(record.path);
    const neighborhood = neighborhoods.get(directory) ?? {
      directory,
      files: [],
      lines: 0,
    };
    neighborhood.files.push(record.path);
    neighborhood.lines += record.lines;
    neighborhoods.set(directory, neighborhood);
  }

  return [...neighborhoods.values()]
    .map((neighborhood) => ({
      path:
        neighborhood.files.length === 1
          ? neighborhood.files[0]
          : `${neighborhood.directory}/`,
      lines: neighborhood.lines,
    }))
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path))
    .slice(0, limit);
}

export function formatPathSummary(parts, records) {
  const sections = [];
  for (const part of parts) {
    const matching = records.filter(
      (record) => record.kind === "part" && record.directory === part.directory,
    );
    const neighborhoods = summarizePathNeighborhoods(matching);
    sections.push(
      [
        `${part.numeral} /${part.directory} — ${part.title}`,
        ...neighborhoods.map(
          (neighborhood) =>
            `  ${formatInteger(neighborhood.lines).padStart(7)}  ${neighborhood.path}`,
        ),
      ].join("\n"),
    );
  }

  return [
    "Highest-line-count production source neighborhoods by LToDD part",
    "",
    sections.join("\n\n"),
  ].join("\n");
}

function printPaths(parts, records) {
  process.stdout.write(`${formatPathSummary(parts, records)}\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const [parts, sourceFiles] = await Promise.all([
    readParts(),
    collectSourceFiles(sourceRoot),
  ]);
  const records = [];
  for (const absolutePath of sourceFiles) {
    const relativePath = path
      .relative(repositoryRoot, absolutePath)
      .split(path.sep)
      .join("/");
    const text = await fs.readFile(absolutePath, "utf8");
    records.push({
      ...classify(relativePath),
      path: relativePath,
      lines: countPhysicalLines(text),
    });
  }

  if (options.paths) {
    printPaths(parts, records);
  } else {
    printSummary(parts, records);
    if (options.details) printDetails(parts, records);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
