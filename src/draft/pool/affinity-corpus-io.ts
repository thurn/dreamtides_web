// Serialize an {@link AffinityCorpus} to a committed per-card embedding and
// reconstruct it back. The embedding (`data/affinity_embedding.jsonc`) is the
// runtime artifact the `embedded` pool variant grows from: each card becomes a
// pair of rank-`R` vectors plus a prior, and synergy is reconstructed as
//   affinity(d, c) = max(0, U[d] · V[c]).
// The grower and every affinity-grown variant keep consuming the in-memory
// `AffinityCorpus` exactly as they do for the record-derived corpus, so the only
// thing that changes is where the corpus comes from.
//
// Three concerns live here, all pure and dependency-free so the bake script
// (`scripts/bake-affinity-corpus.mjs`), the acceptance harness
// (`scripts/affinity-corpus-parity.mjs`), the unit tests, and the browser loader
// all share one implementation:
//
//   * {@link applyOverlay} folds a committed "resembles" overlay
//     (`data/affinity_overlay.jsonc`) into a corpus at bake time, so new and
//     changed cards take their place in the synergy geometry before the fit.
//   * {@link fitEmbedding} distills a corpus into the low-rank embedding via a
//     seeded randomized truncated SVD (no external dependencies).
//   * {@link deserializeCorpus} densifies the embedding back into an
//     `AffinityCorpus`.
//
// Everything is deterministic: the SVD's random projection is seeded from a
// fixed constant, so re-baking the same inputs yields the same vectors.

import type { AffinityCorpus } from "./affinity-grower.ts";
import { makeRng } from "./rng.ts";

// The committed embedding's on-disk schema (`data/affinity_embedding.jsonc`).
// Cards are keyed by lowercase UUID; floats are rounded to 5 decimals. `U` is the
// source factor ("what this card pulls"), `V` the target factor ("what pulls this
// card"); both are N×`rank`, aligned row-for-row to `cards`.
export interface AffinityEmbeddingJson {
  version: number;
  kind: "embedding";
  rank: number;
  cards: string[];
  prior: number[];
  U: number[][];
  V: number[][];
}

// One overlay recipe: a card `id` placed (or re-pointed) next to the cards it
// `resembles`, optionally rescaling its prior. See {@link applyOverlay}.
export interface AffinityOverlayEntry {
  id: string;
  resembles?: string[];
  priorScale?: number;
}

// The committed authoring overlay (`data/affinity_overlay.jsonc`). `add` entries
// introduce cards absent from the records; `edit` entries re-point or rescale an
// existing card. Both are processed in array order, `add` before `edit`.
export interface AffinityOverlay {
  add?: AffinityOverlayEntry[];
  edit?: AffinityOverlayEntry[];
}

// Tunables for {@link fitEmbedding}. `rank` is the embedding rank (default 32,
// the validated default; 16-32 is the validated band). `oversample` is the
// randomized-SVD oversampling `p` (extra random projection columns that improve
// the subspace estimate, discarded after the fit). `seed` seeds the Gaussian
// projection so the fit is reproducible.
export interface FitEmbeddingOptions {
  rank?: number;
  oversample?: number;
  seed?: number;
}

export const DEFAULT_EMBEDDING_RANK = 32;
const DEFAULT_OVERSAMPLE = 12;
// A fixed constant so re-bakes are reproducible — never `Math.random`.
const DEFAULT_SVD_SEED = 0x5eed_5d10;
// Below this magnitude a reconstructed dot product is treated as no synergy, so
// the densified affinity stays sparse. Matches the embedding's 5-decimal
// rounding floor.
const RECONSTRUCT_EPSILON = 1e-6;

function round5(x: number): number {
  const r = Math.round(x * 1e5) / 1e5;
  // Collapse -0 to 0 so the serialized JSON is canonical.
  return Object.is(r, -0) ? 0 : r;
}

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
// (what pulls it), so it lands in the synergy geometry beside them; because the
// embedding is fit AFTER this step, the card receives a consistent latent vector
// automatically. See `docs/cards2/affinity_corpus_distillation_design.md` §7.
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

// --- Randomized truncated SVD (seeded, no dependencies) ---------------------
//
// Standard randomized-range-finder recipe on the dense N×N affinity matrix `A`
// (row = source, col = target). Returns the factors already split evenly across
// the singular values: U[:,i] = u_i·√σ_i and V[:,i] = v_i·√σ_i, so that
// U[d]·V[c] reconstructs the rank-`k` truncation of A.

// Fill `arr` with deterministic pseudo-Gaussian samples via Box-Muller over a
// seeded uniform RNG.
function fillGaussian(arr: Float64Array, rng: () => number): void {
  for (let i = 0; i < arr.length; i += 2) {
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    const radius = Math.sqrt(-2 * Math.log(u1));
    arr[i] = radius * Math.cos(2 * Math.PI * u2);
    if (i + 1 < arr.length) arr[i + 1] = radius * Math.sin(2 * Math.PI * u2);
  }
}

// Modified Gram-Schmidt orthonormalization of the columns of an N×L matrix,
// in place. Columns that collapse to ~0 (linearly dependent) are zeroed.
function orthonormalizeColumns(Q: Float64Array, n: number, l: number): void {
  for (let j = 0; j < l; j++) {
    for (let i = 0; i < j; i++) {
      let dot = 0;
      for (let r = 0; r < n; r++) dot += Q[r * l + i] * Q[r * l + j];
      for (let r = 0; r < n; r++) Q[r * l + j] -= dot * Q[r * l + i];
    }
    let norm = 0;
    for (let r = 0; r < n; r++) norm += Q[r * l + j] * Q[r * l + j];
    norm = Math.sqrt(norm);
    if (norm > 1e-12) {
      for (let r = 0; r < n; r++) Q[r * l + j] /= norm;
    } else {
      for (let r = 0; r < n; r++) Q[r * l + j] = 0;
    }
  }
}

// Cyclic Jacobi eigendecomposition of a small symmetric n×n matrix (`S`, flat
// row-major, consumed). Returns eigenvalues and eigenvectors (columns of `V`,
// flat row-major).
function jacobiEigen(
  S: Float64Array,
  n: number,
): { values: number[]; vectors: Float64Array } {
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;

  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) off += S[p * n + q] * S[p * n + q];
    }
    if (off < 1e-30) break;

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = S[p * n + q];
        if (apq === 0) continue;
        const app = S[p * n + p];
        const aqq = S[q * n + q];
        const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
        const c = Math.cos(phi);
        const s = Math.sin(phi);
        // S <- Gᵀ S G (column update then row update).
        for (let k = 0; k < n; k++) {
          const skp = S[k * n + p];
          const skq = S[k * n + q];
          S[k * n + p] = c * skp - s * skq;
          S[k * n + q] = s * skp + c * skq;
        }
        for (let k = 0; k < n; k++) {
          const spk = S[p * n + k];
          const sqk = S[q * n + k];
          S[p * n + k] = c * spk - s * sqk;
          S[q * n + k] = s * spk + c * sqk;
        }
        // V <- V G (accumulate eigenvectors).
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p];
          const vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq;
          V[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }

  const values: number[] = [];
  for (let i = 0; i < n; i++) values.push(S[i * n + i]);
  return { values, vectors: V };
}

// Fit a rank-`rank` embedding of `corpus`. Materializes the dense affinity
// matrix, runs a seeded randomized truncated SVD, and returns the embedding JSON
// (floats rounded to 5 decimals). Cards keep the corpus's natural order so the
// artifact is reproducible.
export function fitEmbedding(
  corpus: AffinityCorpus,
  opts: FitEmbeddingOptions = {},
): AffinityEmbeddingJson {
  const cards = corpus.cards;
  const n = cards.length;
  const rank = Math.max(1, Math.min(opts.rank ?? DEFAULT_EMBEDDING_RANK, n));
  const oversample = opts.oversample ?? DEFAULT_OVERSAMPLE;
  const l = Math.min(rank + oversample, n);
  const index = new Map<string, number>();
  for (let i = 0; i < n; i++) index.set(cards[i], i);

  // Dense affinity matrix A (row = source d, col = target c).
  const A = new Float64Array(n * n);
  for (const [d, row] of corpus.affinity) {
    const di = index.get(d);
    if (di === undefined) continue;
    for (const [c, v] of row) {
      const ci = index.get(c);
      if (ci !== undefined) A[di * n + ci] = v;
    }
  }

  // Ω: N×L seeded Gaussian projection. Y = A·Ω; Q = orthonormalize(Y).
  const omega = new Float64Array(n * l);
  fillGaussian(omega, makeRng(opts.seed ?? DEFAULT_SVD_SEED));
  const Q = new Float64Array(n * l);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < l; j++) {
      let acc = 0;
      const rowOff = i * n;
      for (let k = 0; k < n; k++) acc += A[rowOff + k] * omega[k * l + j];
      Q[i * l + j] = acc;
    }
  }
  orthonormalizeColumns(Q, n, l);

  // B = Qᵀ·A (L×N), then the small symmetric S = B·Bᵀ (L×L).
  const B = new Float64Array(l * n);
  for (let j = 0; j < l; j++) {
    for (let c = 0; c < n; c++) {
      let acc = 0;
      for (let i = 0; i < n; i++) acc += Q[i * l + j] * A[i * n + c];
      B[j * n + c] = acc;
    }
  }
  const S = new Float64Array(l * l);
  for (let a = 0; a < l; a++) {
    for (let b = a; b < l; b++) {
      let acc = 0;
      for (let c = 0; c < n; c++) acc += B[a * n + c] * B[b * n + c];
      S[a * l + b] = acc;
      S[b * l + a] = acc;
    }
  }

  const { values, vectors } = jacobiEigen(S, l);
  // Top `rank` eigenpairs by descending eigenvalue (= descending σ²).
  const order = values
    .map((value, i) => ({ value, i }))
    .sort((x, y) => y.value - x.value)
    .slice(0, rank);

  const U: number[][] = Array.from({ length: n }, () => new Array<number>(rank).fill(0));
  const Vmat: number[][] = Array.from({ length: n }, () => new Array<number>(rank).fill(0));

  for (let col = 0; col < order.length; col++) {
    const { value, i: eig } = order[col];
    const sigma = Math.sqrt(Math.max(0, value));
    const sqrtSigma = Math.sqrt(sigma);
    // u = Q·w (left singular vector); Bᵀ·w = σ·v (so v = (Bᵀw)/σ).
    for (let r = 0; r < n; r++) {
      let u = 0;
      for (let j = 0; j < l; j++) u += Q[r * l + j] * vectors[j * l + eig];
      U[r][col] = round5(u * sqrtSigma);
    }
    if (sqrtSigma > 1e-12) {
      for (let c = 0; c < n; c++) {
        let btw = 0;
        for (let j = 0; j < l; j++) btw += B[j * n + c] * vectors[j * l + eig];
        // V[:,col] = (Bᵀw)/√σ = √σ·v.
        Vmat[c][col] = round5(btw / sqrtSigma);
      }
    }
  }

  return {
    version: 1,
    kind: "embedding",
    rank,
    cards: [...cards],
    prior: cards.map((c) => round5(corpus.prior.get(c) ?? 0)),
    U,
    V: Vmat,
  };
}

// Reconstruct an {@link AffinityCorpus} from a committed embedding: `prior` and
// `cards` map straight across; `affinity` is densified from the dot products
// `max(0, U[d]·V[c])`, keeping entries above {@link RECONSTRUCT_EPSILON}. The
// grower then consumes this exactly as it consumes the record-derived corpus.
export function deserializeCorpus(json: AffinityEmbeddingJson): AffinityCorpus {
  if (json.kind !== "embedding") {
    throw new Error(`Unexpected affinity artifact kind: ${String(json.kind)}.`);
  }
  const { cards, U, V } = json;
  const n = cards.length;
  if (U.length !== n || V.length !== n || json.prior.length !== n) {
    throw new Error(
      `Affinity embedding is malformed: cards=${n}, prior=${json.prior.length}, ` +
        `U=${U.length}, V=${V.length} must all match.`,
    );
  }
  const rank = json.rank;

  const prior = new Map<string, number>();
  for (let i = 0; i < n; i++) prior.set(cards[i], json.prior[i]);

  const affinity = new Map<string, Map<string, number>>();
  for (let d = 0; d < n; d++) {
    const ud = U[d];
    const row = new Map<string, number>();
    for (let c = 0; c < n; c++) {
      const vc = V[c];
      let dot = 0;
      for (let r = 0; r < rank; r++) dot += ud[r] * vc[r];
      if (dot > RECONSTRUCT_EPSILON) row.set(cards[c], dot);
    }
    if (row.size > 0) affinity.set(cards[d], row);
  }

  return { cards: [...cards], affinity, prior };
}
