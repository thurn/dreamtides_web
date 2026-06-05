// Headless self-play harness for the battle AI planner (Task 4.3).
//
// PURPOSE. Play the AI planner against three baselines over many SEEDED games
// and report, per matchup: win rate, average turns to a result, and
// per-decision timing (mean and max ms). This both validates competence (the
// planner must clearly beat random-legal and greedy one-ply) and is the
// objective function for tuning src/battle/ai/evaluate.ts weights and the
// energy ramp. Project norm: answer design questions by simulation, not
// argument.
//
// DETERMINISM. Every seed is explicit. We NEVER call Math.random() or
// Date.now() for game logic -- both throw in this script runtime. performance.now()
// (node:perf_hooks) is used ONLY to measure decision latency; it is not Date.now().
//
// SIMULATION SUBSTRATE -- a faithful, self-contained two-sided world.
//   - A `World` holds BOTH sides. Each side carries its own hand/deck/deployed/
//     reserve as concrete `AiCard`s, plus energy/maxEnergy/score. Decks are
//     built from buildAiStarterDeck (Task 2.1) -- mirror decks for every
//     matchup, which is fine: the point is to exercise the planner.
//   - On the active side's turn we PROJECT a ForwardModel for that side
//     (`projectFromWorld`): the side's own zones with full identity, the OTHER
//     side reduced to abstract opponentBodies + counts -- exactly mirroring
//     forwardModelFromState, but over the World struct (which is not a real
//     BattleMutableState). The actor (planner/baseline) operates on that
//     projection; applying an action reuses the SAME card-effect logic the
//     planner uses (planner.applyAction over starterCardModels) -- card logic is
//     never re-implemented here. After each action we COMMIT the mutated
//     projection's own-side zones back to the World, and map any opponent-body
//     removal (Flashpoint) back to the real inactive side via the body's slot.
//   - At end of the active turn we resolve the Challenge directly over the World
//     applying battle_rules.md: each ready deployed challenger vs the opposing
//     deployed body in the SAME slot -- lower effective spark dissolves, a tie
//     dissolves both, an unpaired challenger scores its spark. AI-side support
//     uses buildSupportContribution via a per-side projection, so support math
//     reuses the shared resolver. onDissolved fires for dissolving cards.
//   - At the start of each side's turn we fire onDawn for that side's cards and
//     apply the energy ramp (target = min(turnNumber+1, 10); current reset to
//     max), reusing energyRampEdits' formula.
//   - Win at score >= 25; draw if the turn limit (50) is reached.
//
// Run: npx tsx scripts/battle-ai-experiment.mjs
//   (The src/battle modules use extensionless imports, which node's
//   --experimental-strip-types resolver cannot follow; `npx tsx` is the
//   supported fallback per docs/quest_prototype/qa_tooling.md.)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { buildAiStarterDeck } from "../src/battle/ai/deck.ts";
import { planNextAction } from "../src/battle/ai/planner.ts";
import { evaluate } from "../src/battle/ai/evaluate.ts";
import { buildSupportContribution } from "../src/battle/ai/cards/support-contribution.ts";
import { starterCardModels } from "../src/battle/ai/cards/index.ts";
import {
  DEPLOY_SLOT_IDS,
  RESERVE_SLOT_IDS,
} from "../src/battle/types.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

// --- Card database --------------------------------------------------------
const cardsArray = readJson("public/cards_v2-data.json");
const cardDatabase = new Map(cardsArray.map((c) => [c.cardNumber, c]));

// --- Constants (mirroring the real BattleInit config) ---------------------
const SCORE_TO_WIN = 25;
const MAX_ENERGY_CAP = 10;
const TURN_LIMIT = 50;

// Planner options used by the planner actor (and the mirror baseline). The
// deadline is effectively disabled (nowMs < deadlineMs always) because timing is
// measured externally with performance.now(); we want the planner to run its
// full search every decision so the latency we report is the real cost.
const PLANNER_OPTS = {
  deadlineMs: 1,
  beamWidth: 12,
  opponentMode: "expectiminimax",
  sampleCap: 8,
  nowMs: 0,
  rngSeed: 0,
};

// --- Deterministic PRNG (mulberry32) --------------------------------------
// Matches the generator the opponent model uses; never Math.random().
function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- AiCard construction --------------------------------------------------
let instanceCounter = 0;
/** Builds a fresh AiCard from a BattleDeckCardDefinition with a unique id. */
function defToAiCard(def, sideTag) {
  instanceCounter += 1;
  return {
    battleCardId: `${sideTag}:${def.cardNumber}:${instanceCounter}`,
    cardNumber: def.cardNumber,
    name: def.name,
    energyCost: def.energyCost ?? 0,
    basePrintedSpark: def.printedSpark ?? 0,
    sparkDelta: 0,
    figmentCount: 1,
    canChallengeThisTurn: true,
  };
}

// --- World struct ---------------------------------------------------------
function emptySlots(ids) {
  const o = {};
  for (const id of ids) o[id] = null;
  return o;
}

/** Fisher-Yates shuffle using the supplied seeded rng. */
function shuffle(array, rng) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

const STARTING_HAND = 5;

/** Builds one side's starting state from a freshly shuffled starter deck. */
function buildSide(sideTag, rng) {
  const deck = buildAiStarterDeck(cardDatabase).map((def) =>
    defToAiCard(def, sideTag),
  );
  const shuffled = shuffle(deck, rng);
  const hand = shuffled.slice(0, STARTING_HAND);
  const rest = shuffled.slice(STARTING_HAND);
  return {
    hand,
    deck: rest,
    void: [],
    deployed: emptySlots(DEPLOY_SLOT_IDS),
    reserve: emptySlots(RESERVE_SLOT_IDS),
    energy: 0,
    maxEnergy: 0,
    score: 0,
  };
}

// --- Projection: World side -> ForwardModel -------------------------------
// Mirrors forwardModelFromState: the active side's own zones are projected with
// full identity; the opposing side is reduced to abstract bodies + counts. The
// abstract body's `slot` is its real slot on the opponent, which we use to map
// removals back to the World on commit.
function effectiveSparkOfBody(side, card, slot, isReserve) {
  // For an opponent body we expose effective spark including its OWN support
  // (the abstract view the AI sees is the opponent's resolved spark). Compute it
  // via a one-side projection so buildSupportContribution applies.
  const support = supportContributionForSide(side);
  const base = card.basePrintedSpark * card.figmentCount + card.sparkDelta;
  return base + (support.get(card.battleCardId) ?? 0);
}

/** A minimal ForwardModel-shaped view of ONE side's own board, for support math. */
function ownBoardModel(side) {
  return {
    aiEnergy: side.energy,
    aiMaxEnergy: side.maxEnergy,
    aiScore: side.score,
    playerScore: 0,
    aiHand: side.hand,
    aiDeck: side.deck,
    aiVoid: side.void,
    aiDeployed: side.deployed,
    aiReserve: side.reserve,
    opponentBodies: [],
    opponentHandCount: 0,
    opponentVoidCount: 0,
  };
}

function supportContributionForSide(side) {
  return buildSupportContribution(ownBoardModel(side));
}

function projectFromWorld(world, activeSide) {
  const active = world[activeSide];
  const opponent = world[activeSide === "a" ? "b" : "a"];

  const opponentBodies = [];
  for (const slot of DEPLOY_SLOT_IDS) {
    const card = opponent.deployed[slot];
    if (card !== null) {
      opponentBodies.push({
        battleCardId: card.battleCardId,
        effectiveSpark: effectiveSparkOfBody(opponent, card, slot, false),
        rank: "front",
        slot,
        isFigment: false,
      });
    }
  }
  for (const slot of RESERVE_SLOT_IDS) {
    const card = opponent.reserve[slot];
    if (card !== null) {
      opponentBodies.push({
        battleCardId: card.battleCardId,
        effectiveSpark: effectiveSparkOfBody(opponent, card, slot, true),
        rank: "back",
        slot,
        isFigment: false,
      });
    }
  }

  return {
    aiEnergy: active.energy,
    aiMaxEnergy: active.maxEnergy,
    aiScore: active.score,
    playerScore: opponent.score,
    aiHand: active.hand.map((c) => ({ ...c })),
    aiDeck: active.deck.map((c) => ({ ...c })),
    aiVoid: active.void.map((c) => ({ ...c })),
    aiDeployed: cloneSlots(active.deployed),
    aiReserve: cloneSlots(active.reserve),
    opponentBodies,
    opponentHandCount: opponent.hand.length,
    opponentVoidCount: opponent.void.length,
  };
}

function cloneSlots(slots) {
  const o = {};
  for (const k of Object.keys(slots)) {
    o[k] = slots[k] === null ? null : { ...slots[k] };
  }
  return o;
}

// --- Commit: ForwardModel own-side zones -> World -------------------------
// After an actor applies an action to its projection, write the active side's
// zones back, and reconcile any opponent-body removals (Flashpoint dissolves a
// body; it appears as a body missing from the projection's opponentBodies that
// was present before). We reconcile by slot: any opponent body whose slot is no
// longer represented in the post-action opponentBodies has been dissolved.
function commitToWorld(world, activeSide, model, preOpponentSlots) {
  const active = world[activeSide];
  const opponent = world[activeSide === "a" ? "b" : "a"];

  active.energy = model.aiEnergy;
  active.maxEnergy = model.aiMaxEnergy;
  active.score = model.aiScore;
  active.hand = model.aiHand.map((c) => ({ ...c }));
  active.deck = model.aiDeck.map((c) => ({ ...c }));
  active.void = model.aiVoid.map((c) => ({ ...c }));
  active.deployed = cloneSlots(model.aiDeployed);
  active.reserve = cloneSlots(model.aiReserve);

  // Reconcile opponent removals: a slot present before but absent after was
  // dissolved by the action (only Flashpoint does this in the Starter pool).
  const postSlots = new Set(model.opponentBodies.map((b) => b.slot));
  for (const slot of preOpponentSlots) {
    if (!postSlots.has(slot)) {
      dissolveOpponentSlot(opponent, slot);
    }
  }
}

function opponentSlotSet(world, activeSide) {
  const opponent = world[activeSide === "a" ? "b" : "a"];
  const slots = new Set();
  for (const slot of DEPLOY_SLOT_IDS) {
    if (opponent.deployed[slot] !== null) slots.add(slot);
  }
  for (const slot of RESERVE_SLOT_IDS) {
    if (opponent.reserve[slot] !== null) slots.add(slot);
  }
  return slots;
}

/** Removes the card at `slot` (deploy or reserve) from a side, firing onDissolved. */
function dissolveOpponentSlot(side, slot) {
  const zone = DEPLOY_SLOT_IDS.includes(slot) ? side.deployed : side.reserve;
  const card = zone[slot];
  if (card === null || card === undefined) return;
  zone[slot] = null;
  fireDissolved(side, card);
  side.void.push(card);
}

function fireDissolved(side, card) {
  const cardModel = starterCardModels.get(card.cardNumber);
  if (cardModel?.onDissolved !== undefined) {
    // onDissolved (e.g. Last Witness: draw a card) mutates the OWNER's zones.
    // Run it against a one-side projection, then write drawn zones back.
    const view = ownBoardModel(side);
    cardModel.onDissolved(view, card);
    side.hand = view.aiHand;
    side.deck = view.aiDeck;
  }
}

// --- Actors ---------------------------------------------------------------
// Each actor takes a ForwardModel projection and returns the next action in the
// shape planNextAction returns: { kind, self?, targets?, toSlot? } or END_TURN.

/** The planner. Threads a per-decision seed for reproducibility. */
function plannerActor(model, seed) {
  return planNextAction(model, { ...PLANNER_OPTS, rngSeed: seed });
}

/**
 * Enumerates every legal next action from a projection, in the planner's own
 * action vocabulary, so baselines and the planner share legality exactly. We
 * reuse the planner's generateActions indirectly by re-deriving it here: play
 * each affordable/legal card; reposition a ready reserve character into the
 * first empty deploy slot. Returns PlannedAction-shaped objects plus END_TURN.
 */
function legalActions(model) {
  const actions = [];
  // Plays from hand.
  model.aiHand.forEach((card) => {
    const cardModel = starterCardModels.get(card.cardNumber);
    if (cardModel === undefined || !cardModel.canPlay(model, card)) return;
    actions.push({
      kind: "PLAY_CARD",
      self: card,
      targets: cardModel.chooseTargets(model, card),
      toSlot: undefined,
    });
  });
  // Reposition: first empty deploy slot only (slots are interchangeable).
  let targetDeploy = null;
  for (const slot of DEPLOY_SLOT_IDS) {
    if (model.aiDeployed[slot] === null) {
      targetDeploy = slot;
      break;
    }
  }
  if (targetDeploy !== null) {
    for (const reserveSlot of RESERVE_SLOT_IDS) {
      const card = model.aiReserve[reserveSlot];
      if (card === null || !card.canChallengeThisTurn) continue;
      actions.push({
        kind: "MOVE_CARD",
        self: card,
        targets: null,
        toSlot: targetDeploy,
        sourceSlotId: reserveSlot,
      });
    }
  }
  return actions;
}

/** Applies a PlannedAction-shaped action to a projection (reuses card models). */
function applyActionToModel(model, action) {
  if (action.kind === "END_TURN") return;
  if (action.kind === "PLAY_CARD") {
    const cardModel = starterCardModels.get(action.self.cardNumber);
    if (cardModel === undefined) return;
    const live =
      model.aiHand.find((c) => c.battleCardId === action.self.battleCardId) ??
      action.self;
    cardModel.play(model, live, action.targets ?? null);
    cardModel.onMaterialized?.(model, live);
    return;
  }
  // MOVE_CARD. planNextAction returns the source reserve slot only inside
  // `trace.sourceSlotId`; baselines attach `sourceSlotId` directly. Either way we
  // re-locate the card by id, which is robust to both shapes.
  const toSlot = action.toSlot ?? action.trace?.targetSlotId;
  if (toSlot == null) return;
  let found = null;
  for (const slot of RESERVE_SLOT_IDS) {
    if (model.aiReserve[slot]?.battleCardId === action.self.battleCardId) {
      found = slot;
      break;
    }
  }
  if (found === null || model.aiDeployed[toSlot] !== null) return;
  model.aiDeployed[toSlot] = model.aiReserve[found];
  model.aiReserve[found] = null;
}

/** random-legal: uniformly-random legal action including END_TURN. */
function randomActor(model, rng) {
  const actions = legalActions(model);
  // END_TURN is always an option.
  const idx = Math.floor(rng() * (actions.length + 1));
  if (idx >= actions.length) return { kind: "END_TURN" };
  return actions[idx];
}

/** greedy one-ply: pick the legal action maximizing evaluate after applying it;
 *  END_TURN if none beats the current board. No look-ahead. */
function greedyActor(model) {
  const baseline = evaluate(model);
  let best = null;
  let bestScore = baseline;
  for (const action of legalActions(model)) {
    const probe = cloneModelForProbe(model);
    applyActionToModel(probe, action);
    const score = evaluate(probe);
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best ?? { kind: "END_TURN" };
}

function cloneModelForProbe(model) {
  return {
    ...model,
    aiHand: model.aiHand.map((c) => ({ ...c })),
    aiDeck: model.aiDeck.map((c) => ({ ...c })),
    aiVoid: model.aiVoid.map((c) => ({ ...c })),
    aiDeployed: cloneSlots(model.aiDeployed),
    aiReserve: cloneSlots(model.aiReserve),
    opponentBodies: model.opponentBodies.map((b) => ({ ...b })),
  };
}

// --- Turn lifecycle -------------------------------------------------------
const DRAW_PER_TURN = 1;

/** Start-of-turn: ramp energy, fire onDawn, draw a card. */
function startTurn(side, turnNumber) {
  const value = Math.min(turnNumber + 1, MAX_ENERGY_CAP);
  side.maxEnergy = value;
  side.energy = value;

  // onDawn for every card on the board (Sigilsworn Champion: gain 1 score).
  for (const slot of DEPLOY_SLOT_IDS) {
    fireDawn(side, side.deployed[slot]);
  }
  for (const slot of RESERVE_SLOT_IDS) {
    fireDawn(side, side.reserve[slot]);
  }

  // Re-arm every body so deployed challengers can act this turn.
  for (const slot of DEPLOY_SLOT_IDS) {
    if (side.deployed[slot] !== null) side.deployed[slot].canChallengeThisTurn = true;
  }
  for (const slot of RESERVE_SLOT_IDS) {
    if (side.reserve[slot] !== null) side.reserve[slot].canChallengeThisTurn = true;
  }

  // Draw for the turn.
  for (let i = 0; i < DRAW_PER_TURN; i += 1) {
    const card = side.deck.shift();
    if (card !== undefined) side.hand.push(card);
  }
}

function fireDawn(side, card) {
  if (card === null || card === undefined) return;
  const cardModel = starterCardModels.get(card.cardNumber);
  if (cardModel?.onDawn !== undefined) {
    const view = ownBoardModel(side);
    cardModel.onDawn(view, card);
    side.score = view.aiScore;
  }
}

/** Effective spark of a side's deployed slot, including its own support. */
function deployedEffectiveSpark(side, slot, support) {
  const card = side.deployed[slot];
  if (card === null) return 0;
  const base = card.basePrintedSpark * card.figmentCount + card.sparkDelta;
  return base + (support.get(card.battleCardId) ?? 0);
}

/**
 * Resolves the Challenge for the ACTIVE side over the World (battle_rules.md).
 * Each ready deployed challenger faces the body in the SAME deploy slot of the
 * opponent: lower effective spark dissolves, a tie dissolves both, an unpaired
 * challenger scores its spark. Reserve bodies do not defend the front rank
 * directly here -- a defender is the opponent's deployed body in that lane.
 */
function resolveChallenge(world, activeSide) {
  const active = world[activeSide];
  const opponent = world[activeSide === "a" ? "b" : "a"];
  const activeSupport = supportContributionForSide(active);
  const opponentSupport = supportContributionForSide(opponent);

  const dissolvedActive = [];
  const dissolvedOpponent = [];

  for (const slot of DEPLOY_SLOT_IDS) {
    const challenger = active.deployed[slot];
    if (challenger === null || !challenger.canChallengeThisTurn) continue;
    const cSpark = deployedEffectiveSpark(active, slot, activeSupport);
    const defender = opponent.deployed[slot];
    if (defender === null) {
      // Unpaired: scores its spark.
      active.score += cSpark;
      continue;
    }
    const dSpark = deployedEffectiveSpark(opponent, slot, opponentSupport);
    if (cSpark < dSpark) {
      dissolvedActive.push(slot);
    } else if (cSpark > dSpark) {
      dissolvedOpponent.push(slot);
    } else {
      dissolvedActive.push(slot);
      dissolvedOpponent.push(slot);
    }
  }

  for (const slot of dissolvedActive) {
    const card = active.deployed[slot];
    active.deployed[slot] = null;
    if (card !== null) {
      fireDissolved(active, card);
      active.void.push(card);
    }
  }
  for (const slot of dissolvedOpponent) {
    const card = opponent.deployed[slot];
    opponent.deployed[slot] = null;
    if (card !== null) {
      fireDissolved(opponent, card);
      opponent.void.push(card);
    }
  }
}

// --- One game -------------------------------------------------------------
const ACTORS = {
  planner: { build: () => "planner" },
  random: { build: () => "random" },
  greedy: { build: () => "greedy" },
  mirror: { build: () => "planner" },
};

/**
 * Plays one seeded game: side "a" uses actor `aKind`, side "b" the planner
 * (or the named opponent). Returns { winner: "a"|"b"|"draw", turns, decisions }
 * where decisions is an array of per-decision latencies (ms) for the PLANNER
 * side only (side a, which is always the planner under test).
 */
function playGame(aKind, bKind, seed) {
  const rng = createRng(seed);
  const world = {
    a: buildSide("a", createRng(seed ^ 0x1111)),
    b: buildSide("b", createRng(seed ^ 0x2222)),
  };
  const actorKind = { a: aKind, b: bKind };
  const decisionMs = []; // planner-side (a) decision latencies

  let active = "a";
  let turnNumber = 1;
  let decisionSeed = seed;

  for (let turn = 1; turn <= TURN_LIMIT * 2; turn += 1) {
    const side = world[active];
    startTurn(side, turnNumber);

    // Win can trigger on Dawn (Sigilsworn Champion).
    if (side.score >= SCORE_TO_WIN) {
      return result(world, active, turnNumber, decisionMs);
    }

    // Action loop for the active side.
    const kind = actorKind[active];
    let guard = 0;
    while (guard < 64) {
      guard += 1;
      const model = projectFromWorld(world, active);
      const preSlots = opponentSlotSet(world, active);

      let action;
      decisionSeed = (decisionSeed * 1664525 + 1013904223) >>> 0;
      if (kind === "planner") {
        const t0 = performance.now();
        action = plannerActor(model, decisionSeed);
        const dt = performance.now() - t0;
        if (active === "a") decisionMs.push(dt);
      } else if (kind === "random") {
        action = randomActor(model, rng);
      } else {
        action = greedyActor(model);
      }

      if (action.kind === "END_TURN") break;

      applyActionToModel(model, action);
      commitToWorld(world, active, model, preSlots);
    }

    // End of active turn: resolve the Challenge.
    resolveChallenge(world, active);

    if (world[active].score >= SCORE_TO_WIN) {
      return result(world, active, turnNumber, decisionMs);
    }
    // The opposing side losing all relevance is not a loss; only score wins.

    // Hand off.
    active = active === "a" ? "b" : "a";
    if (active === "a") turnNumber += 1;
    if (turnNumber > TURN_LIMIT) {
      return result(world, "draw", turnNumber, decisionMs);
    }
  }
  return result(world, "draw", turnNumber, decisionMs);
}

function result(world, winner, turns, decisionMs) {
  return { winner, turns, decisionMs };
}

// --- Matchup runner -------------------------------------------------------
const SEEDS = Array.from({ length: 100 }, (_, i) => 1000 + i * 7);

function runMatchup(label, opponentKind) {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let turnsSum = 0;
  let decided = 0;
  const allDecisionMs = [];

  for (const seed of SEEDS) {
    const { winner, turns, decisionMs } = playGame("planner", opponentKind, seed);
    if (winner === "a") wins += 1;
    else if (winner === "b") losses += 1;
    else draws += 1;
    if (winner !== "draw") {
      turnsSum += turns;
      decided += 1;
    }
    for (const ms of decisionMs) allDecisionMs.push(ms);
  }

  const n = SEEDS.length;
  const winRate = wins / n;
  const avgTurns = decided > 0 ? turnsSum / decided : NaN;
  const meanMs =
    allDecisionMs.length > 0
      ? allDecisionMs.reduce((s, x) => s + x, 0) / allDecisionMs.length
      : 0;
  const maxMs = allDecisionMs.length > 0 ? Math.max(...allDecisionMs) : 0;

  return { label, wins, losses, draws, winRate, avgTurns, meanMs, maxMs, decisions: allDecisionMs.length };
}

// --- Run + report ---------------------------------------------------------
console.log(
  `Battle AI self-play harness -- planner vs baselines over ${SEEDS.length} seeded games each.\n` +
    `Planner: beamWidth=${PLANNER_OPTS.beamWidth}, sampleCap=${PLANNER_OPTS.sampleCap}, ` +
    `mode=${PLANNER_OPTS.opponentMode}. Score-to-win ${SCORE_TO_WIN}, turn limit ${TURN_LIMIT}.\n`,
);

const matchups = [
  ["planner vs random", "random"],
  ["planner vs greedy", "greedy"],
  ["planner vs mirror", "mirror"],
];

const rows = [];
for (const [label, opp] of matchups) {
  rows.push(runMatchup(label, opp));
}

const W = [20, 6, 6, 6, 9, 9, 9, 9];
const head = ["matchup", "win", "loss", "draw", "winRate", "avgTurns", "meanMs", "maxMs"];
console.log(
  head.map((h, i) => (i === 0 ? h.padEnd(W[i]) : h.padStart(W[i]))).join(""),
);
console.log("-".repeat(W.reduce((a, b) => a + b, 0)));
for (const r of rows) {
  console.log(
    r.label.padEnd(W[0]) +
      String(r.wins).padStart(W[1]) +
      String(r.losses).padStart(W[2]) +
      String(r.draws).padStart(W[3]) +
      `${(r.winRate * 100).toFixed(1)}%`.padStart(W[4]) +
      (Number.isNaN(r.avgTurns) ? "  -  " : r.avgTurns.toFixed(1)).padStart(W[5]) +
      r.meanMs.toFixed(3).padStart(W[6]) +
      r.maxMs.toFixed(2).padStart(W[7]),
  );
}

console.log("");

// --- Assertions / flags ---------------------------------------------------
const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
const vsRandom = byLabel["planner vs random"];
const vsGreedy = byLabel["planner vs greedy"];
const vsMirror = byLabel["planner vs mirror"];

const globalMaxMs = Math.max(...rows.map((r) => r.maxMs));

let ok = true;
const check = (cond, pass, fail) => {
  if (cond) {
    console.log(`  PASS  ${pass}`);
  } else {
    console.log(`  FAIL  ${fail}`);
    ok = false;
  }
};

console.log("Competence + budget checks:");
check(
  vsRandom.winRate > 0.5,
  `planner beats random-legal (${(vsRandom.winRate * 100).toFixed(1)}% > 50%)`,
  `planner does NOT clearly beat random-legal (${(vsRandom.winRate * 100).toFixed(1)}%)`,
);
check(
  vsGreedy.winRate > 0.5,
  `planner beats greedy one-ply (${(vsGreedy.winRate * 100).toFixed(1)}% > 50%)`,
  `planner does NOT clearly beat greedy one-ply (${(vsGreedy.winRate * 100).toFixed(1)}%)`,
);
check(
  globalMaxMs < 100,
  `every per-decision time under the 100ms ceiling (max ${globalMaxMs.toFixed(2)}ms)`,
  `a per-decision time EXCEEDED the 100ms ceiling (max ${globalMaxMs.toFixed(2)}ms)`,
);
console.log(
  `  INFO  mirror (planner vs planner) win rate ${(vsMirror.winRate * 100).toFixed(1)}% ` +
    `(first-player side a; near 50% +/- first-move advantage is expected).`,
);

console.log("");
console.log(ok ? "RESULT: planner is competent and within the timing budget." : "RESULT: one or more checks FAILED -- tune evaluate.ts weights and re-run.");
process.exitCode = ok ? 0 : 1;
