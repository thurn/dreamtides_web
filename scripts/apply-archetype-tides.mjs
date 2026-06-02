// One-off: stamp archetype tides onto cards_v2.toml from the archetype card-pool
// and splash docs, and write the tides registry sidecar with color coding.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ARCH_DIR = join(ROOT, "docs/cards2/archetypes");
const CARD_TOML = join(ROOT, "data/tabula/cards_v2.toml");
const TIDE_TOML = join(ROOT, "data/tabula/cards_v2.tides.toml");

// --- gather (tideName -> set of card names) from the docs ----------------------
const cardNameToTides = new Map();
// Preserve discovery order of tides so registry colors are stable/grouped.
const tideOrder = [];

function addTide(cardName, tide) {
  if (!cardNameToTides.has(cardName)) cardNameToTides.set(cardName, new Set());
  cardNameToTides.get(cardName).add(tide);
}

function titleName(text) {
  // "# Blink — Card Pool" -> "Blink"
  return text.replace(/^#\s*/, "").split(" — ")[0].trim();
}

const files = readdirSync(ARCH_DIR)
  .filter((f) => f.endsWith("_cards.md") || f.endsWith("_splash.md"))
  .sort();

for (const file of files) {
  const isSplash = file.endsWith("_splash.md");
  const lines = readFileSync(join(ARCH_DIR, file), "utf8").split("\n");
  const base = titleName(lines[0]);
  const tide = isSplash ? `${base} Splash` : base;
  if (!tideOrder.includes(tide)) tideOrder.push(tide);

  for (const line of lines) {
    // Numbered list entries: "12. Card Name — description"
    const m = /^\s*\d+\.\s+(.+?)\s+[—–]\s/.exec(line);
    if (m) addTide(m[1].trim(), tide);
  }
}

// --- patch cards_v2.toml -------------------------------------------------------
const src = readFileSync(CARD_TOML, "utf8").split("\n");
const matched = new Set();
let currentName = null;
let patched = 0;

const tomlList = (names) => `[${names.map((n) => JSON.stringify(n)).join(", ")}]`;

for (let i = 0; i < src.length; i++) {
  const nameMatch = /^name = "(.*)"$/.exec(src[i]);
  if (nameMatch) {
    currentName = nameMatch[1];
    continue;
  }
  if (/^tides = \[\]\s*$/.test(src[i]) && currentName) {
    const tides = cardNameToTides.get(currentName);
    if (tides && tides.size > 0) {
      const ordered = tideOrder.filter((t) => tides.has(t));
      src[i] = `tides = ${tomlList(ordered)}`;
      matched.add(currentName);
      patched++;
    }
  }
}

writeFileSync(CARD_TOML, src.join("\n"));

// --- color coding --------------------------------------------------------------
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Group base archetype + its splash on the same hue: base darker, splash lighter.
const baseArchetypes = tideOrder.filter((t) => !t.endsWith(" Splash"));
const hueOf = new Map();
baseArchetypes.forEach((base, idx) => {
  hueOf.set(base, Math.round((360 * idx) / baseArchetypes.length));
});

const registry = tideOrder.map((tide) => {
  const isSplash = tide.endsWith(" Splash");
  const base = isSplash ? tide.slice(0, -" Splash".length) : tide;
  const hue = hueOf.get(base) ?? 0;
  const color = isSplash ? hslToHex(hue, 55, 62) : hslToHex(hue, 62, 40);
  return { name: tide, color };
});

const out = [
  "# Tides registry for cards_v2.toml.",
  "# Each [[tides]] entry defines an available card tide and its display color.",
  '# Managed by the card editor\'s "Manage tides" panel.',
  "",
];
for (const { name, color } of registry) {
  out.push("[[tides]]");
  out.push(`name = ${JSON.stringify(name)}`);
  out.push(`color = ${JSON.stringify(color)}`);
  out.push("");
}
writeFileSync(TIDE_TOML, `${out.join("\n").trimEnd()}\n`);

// --- report --------------------------------------------------------------------
const unmatched = [...cardNameToTides.keys()].filter((n) => !matched.has(n)).sort();
console.log(`Tides defined: ${tideOrder.length}`);
console.log(`Card entries patched: ${patched}`);
console.log(`Distinct card names matched: ${matched.size}`);
console.log(`Unmatched doc card names (${unmatched.length}):`);
for (const n of unmatched) console.log(`  - ${n}`);
