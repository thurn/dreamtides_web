import { buildSupportContribution } from "./cards/support-contribution";
import * as evaluateModule from "./evaluate";
import { cloneForwardModel, type ForwardModel } from "./forward-model";
import { DEPLOY_SLOT_IDS, type DeploySlotId } from "../types";

/**
 * Abstract opponent-response model. Given a {@link ForwardModel} projection
 * (the AI's own cards with full identity, the opponent reduced to abstract
 * bodies plus hand/void counts), this samples a small set of archetypal
 * opponent responses to the AI's committed front rank, evaluates the resulting
 * position with {@link evaluateModule.evaluate}, and aggregates.
 *
 * Asymmetric-knowledge principle (`battle_ai.md` §"Modeling the Opponent"):
 * this layer reads ONLY `opponentBodies`, `opponentHandCount`, and
 * `opponentVoidCount`. It never inspects real opponent card definitions.
 *
 * Combat is resolved directly over the projection (NOT via
 * `engine/judgment.ts`, which needs real `BattleMutableState` instances),
 * applying the rules in `battle_rules.md` §"Challenge phase resolution":
 *   - Defended challenger vs defender: the lower effective spark dissolves; a
 *     tie dissolves both; a defended challenger does not score.
 *   - Unpaired challenger: scores victory points equal to its spark.
 * The Starter pool has no Preeminence/Unstoppable, so those keyword carve-outs
 * do not apply here.
 */

export type OpponentMode = "expectiminimax" | "worstCase";

/**
 * Deck-wide prior probability that the opponent holds removal for the AI's top
 * threat *per unknown card in hand*. The per-response chance the opponent has
 * removal is `min(1, REMOVAL_PRIOR * opponentHandCount)`: more unknown cards,
 * more likely a piece of removal is among them. Tuning knob.
 */
const REMOVAL_PRIOR = 0.1;

/**
 * Prior weight of each archetypal response for the expectiminimax (mean)
 * aggregation. Higher weight = the AI assumes that response is more likely.
 * "Trade evenly" and "block biggest" (competent defensive play) outweigh the
 * passive "no defense" line. Tuning knobs.
 */
const ARCHETYPE_PRIORS: Record<ResponseArchetype, number> = {
  noDefense: 1,
  blockBiggest: 2,
  tradeEvenly: 3,
};

type ResponseArchetype = "noDefense" | "blockBiggest" | "tradeEvenly";

const ARCHETYPE_ORDER: readonly ResponseArchetype[] = [
  "noDefense",
  "blockBiggest",
  "tradeEvenly",
];

/** Hard cap on sampled responses, matching the spec ("≤ ~16"). */
const MAX_SAMPLE_CAP = 16;

interface Challenger {
  slot: DeploySlotId;
  battleCardId: string;
  effectiveSpark: number;
}

/** A defender the opponent can assign: an abstract body's effective spark. */
interface DefenderBody {
  index: number;
  effectiveSpark: number;
}

interface SampledResponse {
  archetype: ResponseArchetype;
  /** Whether the opponent also removes the AI's single top threat pre-combat. */
  removesTopThreat: boolean;
  /** Prior weight used by expectiminimax aggregation. */
  weight: number;
}

// --- Tiny deterministic PRNG ----------------------------------------------
// mulberry32: a small, fast, deterministic 32-bit generator. Used instead of
// Math.random() (which throws in this project's headless/script context) so
// sampling is reproducible from `rngSeed` alone.

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Building the committed front rank ------------------------------------

/**
 * The AI's committed front rank: every `aiDeployed` character that
 * `canChallengeThisTurn`, with its effective spark = base spark plus its support
 * contribution. Sorted descending by spark so "biggest" is index 0.
 */
function buildChallengers(model: ForwardModel): Challenger[] {
  const support = buildSupportContribution(model);
  const challengers: Challenger[] = [];
  for (const slot of DEPLOY_SLOT_IDS) {
    const card = model.aiDeployed[slot];
    if (card === null || !card.canChallengeThisTurn) {
      continue;
    }
    const base = card.basePrintedSpark * card.figmentCount + card.sparkDelta;
    const effectiveSpark = base + (support.get(card.battleCardId) ?? 0);
    challengers.push({ slot, battleCardId: card.battleCardId, effectiveSpark });
  }
  challengers.sort((a, b) => b.effectiveSpark - a.effectiveSpark);
  return challengers;
}

/** Abstract bodies the opponent could assign as defenders, biggest first. */
function buildDefenders(model: ForwardModel): DefenderBody[] {
  const defenders: DefenderBody[] = model.opponentBodies.map((body, index) => ({
    index,
    effectiveSpark: body.effectiveSpark,
  }));
  defenders.sort((a, b) => b.effectiveSpark - a.effectiveSpark);
  return defenders;
}

// --- Applying a response to a cloned model --------------------------------

/** Moves the AI card occupying `slot` from deployed into the void. */
function dissolveChallenger(model: ForwardModel, slot: DeploySlotId): void {
  const card = model.aiDeployed[slot];
  if (card === null) {
    return;
  }
  model.aiDeployed[slot] = null;
  model.aiVoid.push(card);
}

/** Removes the opponent body at the original `opponentBodies` index. */
function consumeOpponentBody(model: ForwardModel, originalIndex: number): void {
  // `originalIndex` indexes into the model's current `opponentBodies`. We splice
  // by matching identity rather than position so multiple removals compose.
  const target = model.opponentBodies[originalIndex];
  if (target === undefined) {
    return;
  }
  const at = model.opponentBodies.indexOf(target);
  if (at !== -1) {
    model.opponentBodies.splice(at, 1);
  }
}

/**
 * Resolves a single lane between one AI challenger and one defender body over
 * the cloned model (`battle_rules.md` §"Challenge phase resolution"). The
 * defended challenger never scores; the lower spark dissolves; a tie dissolves
 * both. Returns the defender's surviving spark contribution removed from play
 * (it is consumed from `opponentBodies` if it dissolves).
 */
function resolveLane(
  model: ForwardModel,
  challenger: Challenger,
  defender: DefenderBody,
): void {
  if (challenger.effectiveSpark < defender.effectiveSpark) {
    // Challenger dissolves; defender survives.
    dissolveChallenger(model, challenger.slot);
  } else if (challenger.effectiveSpark > defender.effectiveSpark) {
    // Defender dissolves; challenger survives but, being defended, does not score.
    consumeOpponentBody(model, defender.index);
  } else {
    // Tie: both dissolve (no Preeminence in the Starter pool).
    dissolveChallenger(model, challenger.slot);
    consumeOpponentBody(model, defender.index);
  }
}

/** An unpaired challenger scores victory points equal to its spark. */
function scoreUnpaired(model: ForwardModel, challenger: Challenger): void {
  model.aiScore += challenger.effectiveSpark;
}

/**
 * Applies a sampled archetypal response to `clone` (already a clone), mutating
 * `aiScore`, dissolving traded AI bodies into `aiVoid`, and consuming opponent
 * bodies from `opponentBodies`.
 */
function applyResponse(
  clone: ForwardModel,
  challengers: Challenger[],
  response: SampledResponse,
): void {
  let active = challengers;

  if (response.removesTopThreat && active.length > 0) {
    // Pre-combat removal of the single most valuable challenger (index 0, the
    // highest-spark challenger). It dissolves before it can score or trade.
    const top = active[0];
    dissolveChallenger(clone, top.slot);
    active = active.slice(1);
  }

  if (active.length === 0) {
    return;
  }

  switch (response.archetype) {
    case "noDefense": {
      // Opponent assigns no defenders; every challenger scores unblocked.
      for (const challenger of active) {
        scoreUnpaired(clone, challenger);
      }
      break;
    }
    case "blockBiggest": {
      // Largest available opponent body opposite the AI's biggest challenger.
      const defenders = buildDefenders(clone);
      if (defenders.length === 0) {
        for (const challenger of active) {
          scoreUnpaired(clone, challenger);
        }
        break;
      }
      const biggestChallenger = active[0];
      resolveLane(clone, biggestChallenger, defenders[0]);
      for (let i = 1; i < active.length; i += 1) {
        scoreUnpaired(clone, active[i]);
      }
      break;
    }
    case "tradeEvenly": {
      // Greedy: assign each opponent body to a challenger it can kill or trade
      // with, maximizing dissolved AI spark. Defenders are taken biggest-first
      // and matched to the biggest challenger they can dissolve (spark >=);
      // remaining challengers score unblocked.
      const defenders = buildDefenders(clone);
      const blocked = new Set<DeploySlotId>();
      for (const defender of defenders) {
        // Pick the biggest not-yet-blocked challenger the defender can dissolve
        // or tie (defender spark >= challenger spark removes the most AI spark).
        let best: Challenger | null = null;
        for (const challenger of active) {
          if (blocked.has(challenger.slot)) {
            continue;
          }
          if (defender.effectiveSpark >= challenger.effectiveSpark) {
            if (best === null || challenger.effectiveSpark > best.effectiveSpark) {
              best = challenger;
            }
          }
        }
        if (best === null) {
          continue;
        }
        blocked.add(best.slot);
        resolveLane(clone, best, defender);
      }
      // Unblocked challengers score.
      for (const challenger of active) {
        if (!blocked.has(challenger.slot)) {
          scoreUnpaired(clone, challenger);
        }
      }
      break;
    }
  }
}

// --- Sampling -------------------------------------------------------------

/**
 * Builds the candidate response space (each archetype, with and without the
 * "remove top threat" overlay), then samples up to `cap` of them. The removal
 * overlay is gated by a Bernoulli draw using `REMOVAL_PRIOR * opponentHandCount`
 * so the sampled mix reflects how likely the opponent is to hold removal.
 */
function sampleResponses(
  model: ForwardModel,
  cap: number,
  rng: () => number,
): SampledResponse[] {
  const removalChance = Math.min(1, REMOVAL_PRIOR * model.opponentHandCount);
  const responses: SampledResponse[] = [];

  for (const archetype of ARCHETYPE_ORDER) {
    if (responses.length >= cap) {
      break;
    }
    // Base (no-removal) response.
    responses.push({ archetype, removesTopThreat: false, weight: ARCHETYPE_PRIORS[archetype] });

    if (responses.length >= cap) {
      break;
    }
    // Removal overlay: a Bernoulli draw decides whether this sampled response
    // also removes the top threat. Its prior weight is scaled by the removal
    // chance so expectiminimax weights it proportionally.
    if (rng() < removalChance && removalChance > 0) {
      responses.push({
        archetype,
        removesTopThreat: true,
        weight: ARCHETYPE_PRIORS[archetype] * removalChance,
      });
    }
  }

  return responses;
}

// --- Public API -----------------------------------------------------------

/**
 * Scores the AI's committed front rank against a sampled set of archetypal
 * opponent responses.
 *
 * @param model - The forward-model projection. Only abstract opponent fields
 *   are read.
 * @param mode - `expectiminimax` returns the prior-weighted mean evaluation;
 *   `worstCase` returns the minimum evaluation over sampled responses.
 * @param sampleCap - Maximum concrete responses to sample (clamped to
 *   {@link MAX_SAMPLE_CAP}).
 * @param rngSeed - Deterministic seed. Math.random() is never used.
 */
export function scoreAgainstOpponent(
  model: ForwardModel,
  mode: OpponentMode,
  sampleCap: number,
  rngSeed: number,
): number {
  const cap = Math.max(1, Math.min(MAX_SAMPLE_CAP, Math.floor(sampleCap)));
  const rng = createRng(rngSeed);

  const challengers = buildChallengers(model);
  const responses = sampleResponses(model, cap, rng);

  // With no responses (cap forces at least one, but guard anyway) just evaluate
  // the position as-is.
  if (responses.length === 0) {
    return evaluateModule.evaluate(model);
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let minScore = Number.POSITIVE_INFINITY;

  for (const response of responses) {
    const clone = cloneForwardModel(model);
    applyResponse(clone, challengers, response);
    const score = evaluateModule.evaluate(clone);

    weightedSum += response.weight * score;
    totalWeight += response.weight;
    if (score < minScore) {
      minScore = score;
    }
  }

  if (mode === "worstCase") {
    return minScore;
  }
  // expectiminimax: prior-weighted mean.
  return totalWeight > 0 ? weightedSum / totalWeight : minScore;
}
