// Shared accumulation over real draft pick records for the pick-data pool
// variants (`pickfit`, `pickearly`, `pickpos`). Each variant differs only in how
// it weights observations by PICK POSITION and how it turns the counts into a
// prior; they all share this single walk and the excess-lift affinity below.
//
// The records are stored UUID-keyed (`PickRecord.packs`/`picks` are card ids), so
// everything here is in id space. A pick's POSITION within its pack is derived
// from its index: after bundling, every seat has exactly `PICKS_PER_PACK` × 3
// trimmed picks in pick order, so `index % PICKS_PER_PACK` is the 0-based
// pick-in-pack (0 = first pick of the pack, the highest-signal choice).

import type { AffinityCorpus } from "./affinity-grower.ts";
import type { PickRecord } from "./types.ts";

// Trimmed picks per pack in the bundle (`buildDraftRecords` keeps pickInPack ≤ 10
// across 3 packs → 30 picks per seat).
export const PICKS_PER_PACK = 10;

export interface PickStats {
  // Weighted offer/take counts per card id.
  offered: Map<string, number>;
  taken: Map<string, number>;
  // Weighted conditional counts: how often c was offered / taken while d was
  // already in the drafter's pool, keyed [d][c].
  offeredWith: Map<string, Map<string, number>>;
  takenWith: Map<string, Map<string, number>>;
  // Unweighted, all-positions take tallies, for an average-pick-position prior.
  takenPosSum: Map<string, number>;
  takenCount: Map<string, number>;
}

export interface AccumOptions {
  // Per-observation weight as a function of 0-based pick-in-pack position.
  // Defaults to 1 (every pick counts equally, the `pickfit` behaviour).
  weight?: (positionInPack: number) => number;
  // When set, picks at or beyond this 0-based position are not accumulated as
  // observations (their cards still enter the drafter's pool as later context).
  // Used by `pickearly` to trust only the high-signal early picks.
  maxPosition?: number;
}

function bumpPair(
  m: Map<string, Map<string, number>>,
  outer: string,
  inner: string,
  by: number,
): void {
  let row = m.get(outer);
  if (row === undefined) {
    row = new Map<string, number>();
    m.set(outer, row);
  }
  row.set(inner, (row.get(inner) ?? 0) + by);
}

// Walk every seat's picks in order, accumulating position-aware offer/take stats.
// `poolSoFar` always tracks every card taken so far (the real draft context),
// while which picks are *counted* — and how heavily — is governed by `opts`.
export function accumulatePickStats(
  records: readonly PickRecord[],
  opts: AccumOptions = {},
): PickStats {
  const weight = opts.weight ?? (() => 1);
  const { maxPosition } = opts;

  const offered = new Map<string, number>();
  const taken = new Map<string, number>();
  const offeredWith = new Map<string, Map<string, number>>();
  const takenWith = new Map<string, Map<string, number>>();
  const takenPosSum = new Map<string, number>();
  const takenCount = new Map<string, number>();

  for (const rec of records) {
    const poolSoFar = new Set<string>();
    const len = Math.min(rec.packs.length, rec.picks.length);
    for (let i = 0; i < len; i += 1) {
      const position = i % PICKS_PER_PACK;
      const chosen = new Set(rec.picks[i]);

      // Average-pick-position tally over every take, independent of weighting.
      for (const c of chosen) {
        takenPosSum.set(c, (takenPosSum.get(c) ?? 0) + position);
        takenCount.set(c, (takenCount.get(c) ?? 0) + 1);
      }

      const counted = maxPosition === undefined || position < maxPosition;
      if (counted) {
        const w = weight(position);
        if (w > 0) {
          // Dedupe the pack to ids; a duplicate id collapses to one offer.
          for (const c of new Set(rec.packs[i])) {
            offered.set(c, (offered.get(c) ?? 0) + w);
            const isTaken = chosen.has(c);
            if (isTaken) taken.set(c, (taken.get(c) ?? 0) + w);
            for (const d of poolSoFar) {
              if (d === c) continue;
              bumpPair(offeredWith, d, c, w);
              if (isTaken) bumpPair(takenWith, d, c, w);
            }
          }
        }
      }

      for (const c of chosen) poolSoFar.add(c);
    }
  }

  return { offered, taken, offeredWith, takenWith, takenPosSum, takenCount };
}

export interface ExcessLiftOptions {
  // Shrinkage constant for the conditional pick rate: a (d→c) estimate is
  // w·condRate + (1-w)·baseline with w = support / (support + shrinkage).
  shrinkage: number;
  // Minimum co-offer support before a (d→c) synergy entry is recorded.
  minSupport: number;
  // Optional replacement for the grower's play-rate prior (e.g. an
  // average-pick-position priority). The synergy affinity always measures excess
  // against the empirical pick RATE regardless, since condRate is a rate.
  priorOverride?: Map<string, number>;
}

// Turn accumulated stats into the affinity corpus the grower consumes: an
// availability-corrected pick-rate prior and a synergy affinity equal to the
// shrunk EXCESS pick rate (condRate above the card's baseline rate, floored at
// zero so only positive synergy is recorded; power stays in the prior).
export function buildExcessLiftCorpus(
  stats: PickStats,
  opts: ExcessLiftOptions,
): AffinityCorpus | null {
  const { offered, taken, offeredWith, takenWith } = stats;
  if (offered.size === 0 || taken.size === 0) return null;

  const ratePrior = new Map<string, number>();
  for (const [c, o] of offered) ratePrior.set(c, (taken.get(c) ?? 0) / o);

  const { shrinkage, minSupport } = opts;
  const affinity = new Map<string, Map<string, number>>();
  for (const [d, row] of offeredWith) {
    const tRow = takenWith.get(d);
    const normRow = new Map<string, number>();
    for (const [c, ow] of row) {
      if (ow < minSupport) continue;
      const condRate = (tRow?.get(c) ?? 0) / ow;
      const baseline = ratePrior.get(c) ?? 0;
      const w = ow / (ow + shrinkage);
      const excess = w * (condRate - baseline);
      if (excess > 0) normRow.set(c, excess);
    }
    if (normRow.size > 0) affinity.set(d, normRow);
  }

  return {
    cards: [...taken.keys()],
    affinity,
    prior: opts.priorOverride ?? ratePrior,
  };
}
