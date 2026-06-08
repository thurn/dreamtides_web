// Serialize an {@link AffinityCorpus} to the committed corpus artifact and
// reconstruct it back. The artifact (`data/affinity_corpus.jsonc`) is the
// runtime input the `embedded` pool variant grows from: the record-derived
// affinity matrix (a play-rate prior plus a sparse card×card synergy matrix),
// rounded to a fixed number of decimals and checked into version control, with
// the committed overlay folded in. The grower and every affinity-grown variant
// keep consuming the in-memory `AffinityCorpus` exactly as they do for the
// record-rebuilt corpus, so the only thing that changes is where the corpus
// comes from — and because the committed matrix IS the matrix `sigseed` builds
// from records (at the artifact's rounding precision), `embedded` reproduces
// `sigseed`'s pools exactly while gaining an editable card set.
//
// Two concerns live here, both pure and dependency-free so the bake script
// (`scripts/bake-affinity-corpus.mjs`), the acceptance harness
// (`scripts/affinity-corpus-parity.mjs`), the unit tests, and the browser loader
// all share one implementation:
//
//   * {@link applyOverlay} folds a committed "resembles" overlay
//     (`data/affinity_overlay.jsonc`) into a corpus at bake time, so new and
//     changed cards take their place in the synergy geometry before serialization.
//   * {@link serializeCorpus} / {@link deserializeCorpus} round-trip the corpus
//     through the committed index-keyed sparse-matrix JSON.

import type { AffinityCorpus } from "./affinity-grower.ts";

// The committed corpus artifact's on-disk schema (`data/affinity_corpus.jsonc`).
// Cards are listed once in `cards`; `prior` is aligned to it. `affinity` is a
// sparse matrix in index space: each entry is `[sourceIndex, [[targetIndex,
// value], ...]]`, where the indices point into `cards`. Floats are rounded to a
// fixed number of decimals; only nonzero rows/entries are stored.
export interface AffinityCorpusJson {
  version: number;
  kind: "matrix";
  cards: string[];
  prior: number[];
  affinity: Array<[number, Array<[number, number]>]>;
}

// One overlay recipe: a card `id` placed (or re-pointed) next to the cards it
// `resembles`, optionally rescaling its prior. See {@link applyOverlay}.
export interface AffinityOverlayEntry {
  id: string;
  resembles?: string[];
  priorScale?: number;
}

// The committed authoring overlay (`data/affinity_overlay.jsonc`). `add` entries
// introduce cards absent from the historical records; `edit` entries re-point or
// rescale an existing card. Both are processed in array order, `add` before
// `edit`.
export interface AffinityOverlay {
  add?: AffinityOverlayEntry[];
  edit?: AffinityOverlayEntry[];
}

// How many decimals the committed artifact rounds prior/affinity floats to. Six
// is the smallest precision at which the rounded matrix reproduces the live
// `sigseed` generator byte-identically across the full real-draft simulation
// (validated by `scripts/affinity-corpus-parity.mjs`); five flips a handful of
// greedy-growth ties.
export const DEFAULT_DECIMALS = 6;

function makeRound(decimals: number): (x: number) => number {
  const factor = 10 ** decimals;
  return (x: number): number => {
    const r = Math.round(x * factor) / factor;
    // Collapse -0 to 0 so the serialized JSON is canonical.
    return Object.is(r, -0) ? 0 : r;
  };
}

// --- Overlay blend ("resembles") --------------------------------------------

// Deep-clone a corpus so the overlay can mutate freely without touching the
// caller's corpus.
function cloneCorpus(corpus: AffinityCorpus): AffinityCorpus {
  const affinity = new Map<string, Map<string, number>>();
  for (const [d, row] of corpus.affinity) affinity.set(d, new Map(row));
  return {
    cards: [...corpus.cards],
    affinity,
    prior: new Map(corpus.prior),
  };
}

// Average a per-resembles value over the recipe's neighbours, treating a missing
// contribution as 0 (so a neighbour that never partners `c` pulls the mean down).
function meanOver(resembles: readonly string[], valueOf: (r: string) => number): number {
  if (resembles.length === 0) return 0;
  let sum = 0;
  for (const r of resembles) sum += valueOf(r);
  return sum / resembles.length;
}

// The outgoing affinity row a `resembles` recipe produces: for every target `c`
// any neighbour partners, the neighbour-mean of affinity[r][c], dropping zeros
// and excluding self.
function blendedRow(
  affinity: ReadonlyMap<string, Map<string, number>>,
  id: string,
  resembles: readonly string[],
): Map<string, number> {
  const targets = new Set<string>();
  for (const r of resembles) {
    const row = affinity.get(r);
    if (row) for (const c of row.keys()) targets.add(c);
  }
  const out = new Map<string, number>();
  for (const c of targets) {
    if (c === id) continue;
    const v = meanOver(resembles, (r) => affinity.get(r)?.get(c) ?? 0);
    if (v > 0) out.set(c, v);
  }
  return out;
}

// Set or clear the incoming column for `id`: for every existing source `d`, the
// neighbour-mean of affinity[d][r]. Mutates `affinity` in place. Used by both
// `add` (set only) and `edit` (set or delete so a re-point removes stale ties).
function applyBlendedColumn(
  affinity: Map<string, Map<string, number>>,
  cards: readonly string[],
  id: string,
  resembles: readonly string[],
): void {
  for (const d of cards) {
    if (d === id) continue;
    const v = meanOver(resembles, (r) => affinity.get(d)?.get(r) ?? 0);
    const row = affinity.get(d);
    if (v > 0) {
      if (row) row.set(id, v);
      else affinity.set(d, new Map([[id, v]]));
    } else if (row) {
      row.delete(id);
    }
  }
}

function assertResemblesExist(
  cardSet: ReadonlySet<string>,
  entry: AffinityOverlayEntry,
): void {
  for (const r of entry.resembles ?? []) {
    if (!cardSet.has(r)) {
      throw new Error(
        `affinity overlay entry "${entry.id}": resembles target "${r}" is not ` +
          `a known card (it must reference a base card or an earlier overlay add).`,
      );
    }
  }
}

// Fold a committed `resembles` overlay into a corpus, returning a NEW corpus.
// `add` entries (cards absent from the records) then `edit` entries (re-point /
// rescale an existing card) are applied in array order, so a later recipe may
// reference an earlier overlay add. A card placed next to A, B, C inherits the
// neighbour-mean of their outgoing rows (what it pulls) and incoming columns
// (what pulls it), so it lands in the synergy geometry beside them. See
// `docs/cards2/affinity_corpus_distillation_design.md` §7.
export function applyOverlay(
  corpus: AffinityCorpus,
  overlay: AffinityOverlay,
): AffinityCorpus {
  const next = cloneCorpus(corpus);
  const cardSet = new Set(next.cards);

  for (const entry of overlay.add ?? []) {
    if (cardSet.has(entry.id)) {
      throw new Error(
        `affinity overlay add "${entry.id}": card already present; use "edit" to ` +
          `re-point or rescale an existing card.`,
      );
    }
    const resembles = entry.resembles ?? [];
    if (resembles.length === 0) {
      throw new Error(
        `affinity overlay add "${entry.id}": "resembles" must name at least one card.`,
      );
    }
    assertResemblesExist(cardSet, entry);
    const scale = entry.priorScale ?? 1;

    const row = blendedRow(next.affinity, entry.id, resembles);
    if (row.size > 0) next.affinity.set(entry.id, row);
    applyBlendedColumn(next.affinity, next.cards, entry.id, resembles);
    next.prior.set(entry.id, scale * meanOver(resembles, (r) => next.prior.get(r) ?? 0));
    next.cards.push(entry.id);
    cardSet.add(entry.id);
  }

  for (const entry of overlay.edit ?? []) {
    if (!cardSet.has(entry.id)) {
      throw new Error(
        `affinity overlay edit "${entry.id}": card is not present; use "add" to ` +
          `introduce a new card.`,
      );
    }
    if (entry.resembles && entry.resembles.length > 0) {
      assertResemblesExist(cardSet, entry);
      const scale = entry.priorScale ?? 1;
      const row = blendedRow(next.affinity, entry.id, entry.resembles);
      if (row.size > 0) next.affinity.set(entry.id, row);
      else next.affinity.delete(entry.id);
      applyBlendedColumn(next.affinity, next.cards, entry.id, entry.resembles);
      next.prior.set(
        entry.id,
        scale * meanOver(entry.resembles, (r) => next.prior.get(r) ?? 0),
      );
    } else if (entry.priorScale !== undefined) {
      next.prior.set(entry.id, (next.prior.get(entry.id) ?? 0) * entry.priorScale);
    }
  }

  return next;
}

// --- Serialize / deserialize the committed sparse matrix ---------------------

// Tunables for {@link serializeCorpus}. `decimals` is the rounding precision of
// the stored floats (default {@link DEFAULT_DECIMALS}).
export interface SerializeCorpusOptions {
  decimals?: number;
}

// Serialize a corpus to the committed index-keyed sparse-matrix JSON. Cards keep
// the corpus's natural order; within each row, entries are sorted by target index
// so the artifact is canonical regardless of the corpus's Map iteration order.
// Floats are rounded; values that round to 0 are dropped, keeping the matrix
// sparse.
export function serializeCorpus(
  corpus: AffinityCorpus,
  opts: SerializeCorpusOptions = {},
): AffinityCorpusJson {
  const round = makeRound(opts.decimals ?? DEFAULT_DECIMALS);
  const cards = corpus.cards;
  const index = new Map<string, number>();
  for (let i = 0; i < cards.length; i++) index.set(cards[i], i);

  const affinity: Array<[number, Array<[number, number]>]> = [];
  for (let di = 0; di < cards.length; di++) {
    const row = corpus.affinity.get(cards[di]);
    if (!row || row.size === 0) continue;
    const entries: Array<[number, number]> = [];
    for (const [c, v] of row) {
      const ci = index.get(c);
      if (ci === undefined) continue;
      const rv = round(v);
      if (rv !== 0) entries.push([ci, rv]);
    }
    if (entries.length === 0) continue;
    entries.sort((a, b) => a[0] - b[0]);
    affinity.push([di, entries]);
  }

  return {
    version: 2,
    kind: "matrix",
    cards: [...cards],
    prior: cards.map((c) => round(corpus.prior.get(c) ?? 0)),
    affinity,
  };
}

// Reconstruct an {@link AffinityCorpus} from the committed sparse-matrix JSON:
// `prior` and `cards` map straight across; `affinity` is rebuilt from the
// index-keyed rows. The grower then consumes this exactly as it consumes the
// record-derived corpus.
export function deserializeCorpus(json: AffinityCorpusJson): AffinityCorpus {
  if (json.kind !== "matrix") {
    throw new Error(`Unexpected affinity artifact kind: ${String(json.kind)}.`);
  }
  const { cards, prior: priorArr, affinity: rows } = json;
  const n = cards.length;
  if (priorArr.length !== n) {
    throw new Error(
      `Affinity corpus is malformed: cards=${n} but prior=${priorArr.length}.`,
    );
  }

  const prior = new Map<string, number>();
  for (let i = 0; i < n; i++) prior.set(cards[i], priorArr[i]);

  const affinity = new Map<string, Map<string, number>>();
  for (const [di, entries] of rows) {
    if (di < 0 || di >= n) {
      throw new Error(`Affinity corpus has an out-of-range source index ${di}.`);
    }
    const row = new Map<string, number>();
    for (const [ci, v] of entries) {
      if (ci < 0 || ci >= n) {
        throw new Error(`Affinity corpus has an out-of-range target index ${ci}.`);
      }
      row.set(cards[ci], v);
    }
    if (row.size > 0) affinity.set(cards[di], row);
  }

  return { cards: [...cards], affinity, prior };
}
