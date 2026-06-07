// One-time migration: rewrite every card reference that lives in source data by
// its stable cards_v2 UUID instead of its display name. Idempotent — a reference
// already stored as a UUID is left as-is — so it doubles as a refresher for the
// `# Name` / `// Name` comments after a rename. The corpus comment is also
// refreshed by `setup-assets.mjs` on every build; this script additionally keeps
// the TOML / TS / JSON comments current.
//
// Converts, in place:
//   - docs/drafts_anon/*.txt and docs/drafts_dt/*.txt  -> `<uuid> # Name`
//   - data/tabula/dreamcallers_v2.toml signature-cards -> uuid array w/ comments
//   - src/data/cards-v2-metadata.ts                    -> keyed by uuid, // Name
//   - data/buildaround_support.json                    -> keyed by uuid, name field
//
// Run with: node scripts/migrate-card-refs.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  loadCardMaps,
  corpusFiles,
  corpusLineToken,
  corpusLine,
  resolveToken,
} from "./lib/card-refs.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const CARDS_V2 = join(ROOT, "data", "tabula", "cards_v2.toml");
const maps = loadCardMaps(CARDS_V2);

let filesChanged = 0;
function writeIfChanged(path, next) {
  const prev = readFileSync(path, "utf8");
  if (prev !== next) {
    writeFileSync(path, next);
    filesChanged += 1;
    return true;
  }
  return false;
}

// --- corpus dirs -------------------------------------------------------------
function migrateCorpus(dir) {
  let changed = 0;
  for (const filename of corpusFiles(dir)) {
    const path = join(dir, filename);
    const lines = readFileSync(path, "utf8").split("\n");
    const out = lines.map((line) => {
      const token = corpusLineToken(line);
      if (token.length === 0) return line;
      const { id, name } = resolveToken(token, maps);
      return corpusLine(id, name);
    });
    // Preserve a single trailing newline; drop accidental blank tails.
    let text = out.join("\n").replace(/\n+$/u, "");
    text += "\n";
    if (writeIfChanged(path, text)) changed += 1;
  }
  console.log(`  ${dir}: ${changed} file(s) updated`);
}

console.log("Migrating corpus directories...");
migrateCorpus(join(ROOT, "docs", "drafts_anon"));
migrateCorpus(join(ROOT, "docs", "drafts_dt"));

// --- dreamcallers_v2.toml signature-cards ------------------------------------
console.log("Migrating dreamcallers_v2.toml signature-cards...");
{
  const path = join(ROOT, "data", "tabula", "dreamcallers_v2.toml");
  const src = readFileSync(path, "utf8");
  // Match a whole `signature-cards = [ ... ]` assignment, single- or multi-line.
  const next = src.replace(
    /signature-cards = \[(?<body>[\s\S]*?)\]/gu,
    (_match, body) => {
      const tokens = [...body.matchAll(/"([^"]+)"/gu)].map((m) => m[1]);
      const entries = tokens.map((tok) => {
        const { id, name } = resolveToken(tok, maps);
        return `  "${id}", # ${name}`;
      });
      return `signature-cards = [\n${entries.join("\n")}\n]`;
    },
  );
  writeIfChanged(path, next);
}

// --- cards-v2-metadata.ts ----------------------------------------------------
console.log("Migrating cards-v2-metadata.ts...");
{
  const path = join(ROOT, "src", "data", "cards-v2-metadata.ts");
  const { CARDS_V2_POOL_METADATA } = await import(`file://${path}`);

  const header = `// Draft-pool metadata for the experimental cards_v2 pool, keyed by each card's
// stable \`id\` UUID from \`cards_v2.toml\`. Keying by UUID keeps the metadata in
// sync across display renames; the trailing \`// Name\` comments are refreshed
// from the current card name by \`scripts/migrate-card-refs.mjs\`.
//
// The \`idf3\` pool variant (the standard algorithm) reads none of this — it works
// from the bundled real decklists plus each Dreamcaller's signature alone. These
// fields exist only for the other \`?algo=\` variants (\`default\`, \`diverse\`,
// \`decklists\`, \`merged\`): \`core\` flags an always-included staple, \`tides\` supply
// the mechanic-archetype themes, and \`colors\` / \`draftArchetypes\` supply the
// color-combo lists and color+archetype slices. They live here in TypeScript
// rather than in \`cards_v2.toml\`; \`scripts/setup-assets.mjs\` merges them into
// \`cards_v2-data.json\`, and \`scripts/generate-color-pool.mjs\` reads them directly.
// See \`docs/cards2/draft_pool_algorithms.md\`.

export interface CardV2PoolMetadata {
  tides?: readonly string[];
  core?: boolean;
  colors?: readonly string[];
  draftArchetypes?: readonly string[];
}
`;

  const arr = (xs) => `[${xs.map((x) => JSON.stringify(x)).join(", ")}]`;
  const lines = [
    "export const CARDS_V2_POOL_METADATA: Record<string, CardV2PoolMetadata> = {",
  ];
  for (const [name, meta] of Object.entries(CARDS_V2_POOL_METADATA)) {
    const { id, name: current } = resolveToken(name, maps);
    lines.push(`  ${JSON.stringify(id)}: { // ${current}`);
    if (meta.tides !== undefined) lines.push(`    tides: ${arr(meta.tides)},`);
    if (meta.core !== undefined) lines.push(`    core: ${String(meta.core)},`);
    if (meta.colors !== undefined) {
      lines.push(`    colors: ${arr(meta.colors)},`);
    }
    if (meta.draftArchetypes !== undefined) {
      lines.push(`    draftArchetypes: ${arr(meta.draftArchetypes)},`);
    }
    lines.push("  },");
  }
  lines.push("};");
  writeIfChanged(path, `${header}\n${lines.join("\n")}\n`);
}

// --- buildaround_support.json ------------------------------------------------
console.log("Migrating buildaround_support.json...");
{
  const path = join(ROOT, "data", "buildaround_support.json");
  const data = JSON.parse(readFileSync(path, "utf8"));
  const nextCards = {};
  for (const [name, entry] of Object.entries(data.cards)) {
    // Tolerate an already-migrated file (entry.name present, key is a uuid).
    const ref = typeof entry.name === "string" ? entry.name : name;
    const { id, name: current } = resolveToken(ref, maps);
    const { name: _drop, ...rest } = entry;
    nextCards[id] = { name: current, ...rest };
  }
  data.cards = nextCards;
  if (typeof data._comment === "string" && !data._comment.includes("Keyed by")) {
    data._comment = data._comment.replace(
      /Cards that are neither are omitted\.?/u,
      "Cards that are neither are omitted. Keyed by each card's cards_v2 id UUID; the name field is informational and refreshed from the current card name.",
    );
  }
  writeIfChanged(path, `${JSON.stringify(data, null, 2)}\n`);
}

console.log(`Migration complete. ${filesChanged} file(s) changed.`);
