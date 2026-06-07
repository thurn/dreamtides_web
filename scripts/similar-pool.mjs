#!/usr/bin/env node
// Build a pool from one input decklist by unioning it with the most "uniquely
// similar" decklists in a corpus of decklists.
//
// Similarity is IDF-weighted cosine over card-presence vectors. Each deck is a
// binary vector over the card universe (the corpus lists are singletons, so a
// card is either in a deck or not). Each card's weight is its inverse document
// frequency idf(c) = ln(N / df(c)), where df(c) is the number of decks that
// contain c. Staples that show up in many decks get a small weight and barely
// move the score; cards that co-occur in only a handful of decks dominate it.
// That is what makes a match "uniquely" similar rather than just "both play the
// popular cards".
//
//   weight(c)    = idf(c) ^ idfPower
//   cosine(A, B) = (sum over c in A∩B of weight(c)^2) / (||A|| * ||B||)
//   ||A||        = sqrt(sum over c in A of weight(c)^2)
//
// Pool assembly: rank every other deck by similarity to the input, then union
// WHOLE decks best-first starting from the input itself. Each card is capped at
// `--cap` copies. Decks are never truncated mid-list; instead we keep the
// whole-deck boundary whose pool size lands closest to `--target`, accepting
// anything inside the window [target - tolerance, target + tolerance].
//
// Run with --help for the full flag list.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { corpusLineToken, loadCardMaps, resolveToken } from './lib/card-refs.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Corpus files reference cards by their stable id UUID; resolve to current names.
const CARD_MAPS = loadCardMaps(join(REPO_ROOT, 'data', 'tabula', 'cards_v2.toml'));

const FLAGS = {
  target: {
    def: 100,
    parse: Number,
    help: 'Target pool size in cards (counting duplicate copies). The builder lands on '
      + 'the whole-deck boundary closest to this. Default 100.',
  },
  tolerance: {
    def: 10,
    parse: Number,
    help: 'Half-width of the acceptable pool-size window: the pool may end anywhere in '
      + '[target - tolerance, target + tolerance] (e.g. 90-110). Default 10.',
  },
  cap: {
    def: 2,
    parse: Number,
    help: 'Max copies of any single card in the pool. Default 2.',
  },
  top: {
    def: 10,
    parse: Number,
    help: 'How many ranked matches to print in the report. Default 10.',
  },
  dir: {
    def: join(REPO_ROOT, 'docs', 'drafts_anon'),
    parse: String,
    help: 'Corpus directory of *.txt decklists. Default docs/drafts_anon.',
  },
  'idf-power': {
    def: 1,
    parse: Number,
    help: 'Exponent on idf weights. 1 = standard. >1 sharpens the rarity emphasis '
      + '(staples matter even less); 0 = ignore rarity, plain presence cosine. Default 1.',
  },
  'min-df': {
    def: 1,
    parse: Number,
    help: 'Ignore cards appearing in fewer than this many decks when SCORING similarity '
      + '(they are still added to the pool). Default 1 (keep all).',
  },
  'max-df-frac': {
    def: 1,
    parse: Number,
    help: 'Ignore cards appearing in more than this FRACTION of decks when SCORING '
      + 'similarity — a hard staple cutoff. Default 1.0 (keep all).',
  },
  'include-input': {
    def: false,
    parse: () => true,
    flag: true,
    help: 'Allow the input deck itself to be a candidate match (by filename). '
      + 'Default off (the input is excluded from its own ranking).',
  },
};

function printHelp() {
  console.log('Usage: node scripts/similar-pool.mjs <input-deck.txt> [flags]\n');
  console.log('Builds a card pool by unioning the input with its most uniquely-similar decks.\n');
  console.log('Flags:');
  for (const [name, spec] of Object.entries(FLAGS)) {
    const sample = spec.flag ? `--${name}` : `--${name}=<${spec.parse === Number ? 'num' : 'val'}>`;
    console.log(`  ${sample.padEnd(22)} ${spec.help} (default: ${JSON.stringify(spec.def)})`);
  }
  console.log('\nExamples:');
  console.log('  node scripts/similar-pool.mjs docs/drafts_anon/0001.txt');
  console.log('  node scripts/similar-pool.mjs my-deck.txt --target=60 --cap=3');
  console.log('  node scripts/similar-pool.mjs my-deck.txt --idf-power=2 --max-df-frac=0.05');
  console.log('  node scripts/similar-pool.mjs my-deck.txt --target=120 --tolerance=15');
}

function parseArgs(argv) {
  const opts = {};
  for (const [name, spec] of Object.entries(FLAGS)) opts[name] = spec.def;
  opts.input = null;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      const raw = eq === -1 ? '' : arg.slice(eq + 1);
      const spec = FLAGS[name];
      if (!spec) {
        console.error(`Unknown flag: --${name}  (run --help)`);
        process.exit(1);
      }
      const value = spec.parse(raw);
      if (spec.choices && !spec.choices.includes(value)) {
        console.error(`--${name} must be one of: ${spec.choices.join(', ')}`);
        process.exit(1);
      }
      if (spec.parse === Number && Number.isNaN(value)) {
        console.error(`--${name} expects a number`);
        process.exit(1);
      }
      opts[name] = value;
    } else if (!opts.input) {
      opts.input = arg;
    }
  }
  return opts;
}

// A deck is the set of distinct, non-empty card names in a file (corpus lists
// are singletons; dedupe defensively). With whole-deck unioning and a copy cap,
// the pool's contents depend only on which decks are unioned, not card order,
// so the set is all we need.
function parseDeck(path) {
  const seen = new Set();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const token = corpusLineToken(line);
    if (token) seen.add(resolveToken(token, CARD_MAPS).name);
  }
  return { set: seen };
}

// Map card name -> its rules text from cards_v2.toml, collapsed to a single line
// (rendered-text is often a multi-line TOML string). Cards with no rules text
// map to ''.
function loadRulesText() {
  const tomlPath = join(REPO_ROOT, 'data', 'tabula', 'cards_v2.toml');
  const parsed = parse(readFileSync(tomlPath, 'utf8'));
  const byName = new Map();
  for (const card of parsed.cards ?? []) {
    const text = (card['rendered-text'] ?? '').replace(/\s+/g, ' ').trim();
    byName.set(card.name, text);
  }
  return byName;
}

function loadCorpus(dir) {
  const decks = new Map(); // filename -> { set }
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.txt')) continue;
    const deck = parseDeck(join(dir, file));
    if (deck.set.size > 0) decks.set(file, deck);
  }
  return decks;
}

function computeWeights(decks, opts) {
  const df = new Map();
  for (const { set } of decks.values()) {
    for (const c of set) df.set(c, (df.get(c) ?? 0) + 1);
  }
  const N = decks.size;
  const maxDf = opts['max-df-frac'] * N;
  const weight = new Map(); // scoring weight; 0 for cards filtered out of similarity
  for (const [c, d] of df) {
    if (d < opts['min-df'] || d > maxDf) {
      weight.set(c, 0);
      continue;
    }
    weight.set(c, Math.pow(Math.log(N / d), opts['idf-power']));
  }
  return { weight, df, N };
}

function norm(set, weight) {
  let sumSq = 0;
  for (const c of set) {
    const w = weight.get(c) ?? 0;
    sumSq += w * w;
  }
  return Math.sqrt(sumSq);
}

function cosine(a, b, weight, normA, normB) {
  if (normA === 0 || normB === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const c of small) {
    if (large.has(c)) {
      const w = weight.get(c) ?? 0;
      dot += w * w;
    }
  }
  return dot / (normA * normB);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.input) {
    printHelp();
    process.exit(1);
  }

  const inputPath = resolve(opts.input);
  const input = parseDeck(inputPath);
  const inputName = basename(inputPath);

  const rulesText = loadRulesText();
  const decks = loadCorpus(opts.dir);
  const { weight, df, N } = computeWeights(decks, opts);
  const normInput = norm(input.set, weight);

  const scored = [];
  for (const [file, deck] of decks) {
    if (!opts['include-input'] && file === inputName) continue;
    const sim = cosine(input.set, deck.set, weight, normInput, norm(deck.set, weight));
    scored.push({ file, deck, sim });
  }
  scored.sort((a, b) => b.sim - a.sim);

  // ---- Report the ranking ----
  console.log(`Input: ${inputName} (${input.set.size} cards)`);
  console.log(`Corpus: ${N} decks, ${weight.size} unique cards  (dir: ${opts.dir})`);
  const low = opts.target - opts.tolerance;
  const high = opts.target + opts.tolerance;
  console.log(
    `Scoring: idf-power=${opts['idf-power']}, min-df=${opts['min-df']}, `
    + `max-df-frac=${opts['max-df-frac']}  |  pool: target=${opts.target}±${opts.tolerance} `
    + `(${low}-${high}), cap=${opts.cap}\n`,
  );
  console.log(`Top ${opts.top} most uniquely-similar decks (IDF-cosine):`);
  for (const { file, deck, sim } of scored.slice(0, opts.top)) {
    const shared = [...input.set].filter((c) => deck.set.has(c));
    const drivers = shared
      .sort((x, y) => (weight.get(y) ?? 0) - (weight.get(x) ?? 0))
      .slice(0, 5)
      .map((c) => `${c} (df=${df.get(c)})`);
    console.log(
      `  ${sim.toFixed(4)}  ${file}  [${shared.length} shared]  driven by: ${drivers.join(', ')}`,
    );
  }

  // ---- Assemble the pool ----
  // Union whole decks best-first. After the input and after each added deck we
  // have a candidate pool; we keep the candidate whose total size is closest to
  // the target (tie-break toward the larger pool). Decks are never truncated.
  function unionInto(pool, set) {
    let added = 0;
    for (const c of set) {
      const have = pool.get(c) ?? 0;
      if (have >= opts.cap) continue;
      pool.set(c, have + 1);
      added += 1;
    }
    return added;
  }

  const pool = new Map(); // card -> copies
  let size = unionInto(pool, input.set);
  const used = []; // { file, sim, added }
  // Each candidate snapshots the pool reachable after unioning `used.length` decks.
  const candidates = [{ pool: new Map(pool), size, used: [] }];
  for (const { file, deck, sim } of scored) {
    const added = unionInto(pool, deck.set);
    used.push({ file, sim, added });
    candidates.push({ pool: new Map(pool), size: (size += added), used: [...used] });
    // Once we reach the top of the window, more decks only move us further away.
    if (size >= high) break;
  }

  let best = candidates[0];
  for (const cand of candidates) {
    const d = Math.abs(cand.size - opts.target);
    const bd = Math.abs(best.size - opts.target);
    if (d < bd || (d === bd && cand.size > best.size)) best = cand;
  }

  console.log(`\nDecks unioned into the pool (in similarity order):`);
  console.log(`  ${inputName} (input)`);
  for (const { file, sim, added } of best.used) {
    console.log(`  ${file}  sim=${sim.toFixed(4)}  (+${added} cards)`);
  }

  const finalPool = best.pool;
  const singles = [...finalPool.values()].filter((n) => n === 1).length;
  const capped = [...finalPool.values()].filter((n) => n >= opts.cap).length;
  const inWindow = best.size >= low && best.size <= high;
  console.log(
    `\nPool: ${best.size} cards total — ${finalPool.size} distinct `
    + `(${singles} singletons, ${capped} at the ${opts.cap}-copy cap)`
    + (inWindow ? '' : `  [!] closest whole-deck size to target; outside ${low}-${high}`),
  );
  console.log(`\n=== POOL ===`);
  for (const [card, copies] of [...finalPool.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )) {
    const text = rulesText.get(card) ?? '';
    console.log(`${copies}  ${card}${text ? `  ${text}` : ''}`);
  }
}

main();
