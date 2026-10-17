// The D97 encounter cases (Appendix A §A8, §A9; Appendix B §B9–§B11):
// previewing a challenger or guardian fixes its deck, both antes and its
// extra; declining is free; beginning resolves the player's ante against the
// collection floor and drift and starts the engine battle; ending settles
// the engine result: a win pays the ante, a bundle drawn from the bag and the
// extra and marks the opponent beaten, a loss takes the anted copy, a draw
// changes nothing. Every outcome is written into state when first produced.

import { sha256 } from "js-sha256";
import { D97_CHALLENGERS, type D97ChallengerDefinition } from "../../content/d97/challengers";
import { D97_COLLECTION } from "../../content/d97/collection";
import { D97_ENCOUNTERS, type D97TierKnob } from "../../content/d97/encounters";
import { D97_ACT_CHALLENGER_TIERS } from "../../content/d97/tunables";
import {
  acquireCopy,
  copiesInZone,
  deckSize,
  findCopy,
  removeCopies,
} from "../../d97/collection/collection";
import type { D97Collection, D97OwnedCopy } from "../../d97/collection/types";
import { drawFromBag, recordAcquisition } from "../../d97/collection/reward-bag";
import type { EventContext, ReducerLogRecord } from "../../eventlog/types";
import type { CardId } from "../../types/card-identity";
import type { Rarity } from "../../types/cards";
import {
  dreamAnchorIdFromUnknown,
  parseBattleId,
  type D97OwnedCopyId,
  type DreamAnchorId,
} from "../../types/identifiers";
import { engineBattleResult, startEngineBattleWithCommits } from "../battle/engine-battle";
import { d97BattleOf } from "../battle/fold";
import { getBattleInitProvider } from "../battle/journey-battle";
import type { FoldState } from "../fold-state";
import { advanceDefeatQuest } from "./d97-quests";
import { bagDrawLogRecord, type D97Transition } from "./d97-run";
import { d97ContentProvider } from "./d97-content";
import type { D97Encounter, D97Run, D97State } from "./d97-state";

/** A D97 case over the whole fold (it starts or ends a battle). */
export interface D97FoldTransition {
  readonly state: FoldState;
  readonly logRecords: readonly ReducerLogRecord[];
}

/** A 32-bit seed from text, so seeds derive from the run seed and UUIDs. */
export function hashSeed(text: string): number {
  return Number.parseInt(sha256(text).slice(0, 8), 16) >>> 0;
}

/** The act a run is in. M1 runs are a single act (decision P7). */
function runAct(_run: D97Run): number {
  return 1;
}

/** The knob row a tier uses: the highest row at or below it. */
export function tierKnob(tier: number, knobs: readonly D97TierKnob[]): D97TierKnob {
  let row = knobs[0];
  for (const knob of knobs) if (knob.fromTier <= tier) row = knob;
  if (row === undefined) throw new Error("No D97 tier knobs");
  return row;
}

/** An encounter's tier by its role and the run's act (Appendix B §B3, §B9). */
export function encounterTier(role: D97ChallengerDefinition["role"], act: number): number {
  const challengerTier = D97_ACT_CHALLENGER_TIERS[Math.min(act, D97_ACT_CHALLENGER_TIERS.length) - 1] ?? 0;
  return role === "guardian"
    ? Math.min(challengerTier + D97_ENCOUNTERS.guardianTierOffset, D97_ENCOUNTERS.guardianTierCap)
    : challengerTier;
}

/** A victory bundle's rarity budget `S` at tier `T` (Appendix A §A8). */
export function bundleBudget(tier: number): number {
  return D97_ENCOUNTERS.bundleBase + Math.floor(tier / D97_ENCOUNTERS.bundleTierDivisor);
}

function rarityCost(rarity: Rarity | null): number {
  return rarity === null ? 1 : D97_ENCOUNTERS.rarityCost[rarity];
}

function pick<T>(items: readonly T[], random: () => number): T | null {
  return items.length === 0 ? null : (items[Math.floor(random() * items.length)] ?? null);
}

function challengerAt(anchorId: DreamAnchorId): D97ChallengerDefinition | null {
  return D97_CHALLENGERS.find((challenger) => challenger.anchorId === anchorId) ?? null;
}

/** Copies the collection may lose to an ante without dropping below its floor. */
function anteAllowance(collection: D97Collection): number {
  return collection.copies.length - D97_COLLECTION.collectionFloor;
}

/**
 * `D97_PREVIEW_ENCOUNTER { anchorId }`: the first preview of a challenger or
 * guardian builds its deck from `hash(runSeed : characterId)` and rolls both
 * antes and the extra from the event's stream; all are stored. A later
 * preview reads the stored encounter and needs no event.
 */
export function previewEncounter(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): D97Transition | null {
  const d97 = state.d97;
  const run = d97?.run ?? null;
  const anchorId = dreamAnchorIdFromUnknown(payload.anchorId);
  const content = d97ContentProvider();
  if (d97 === undefined || run === null || anchorId === null || content === null || state.battle !== null) return null;
  if (run.encounters[anchorId] !== undefined) return null;
  const challenger = challengerAt(anchorId);
  if (challenger === null) return null;
  const tier = encounterTier(challenger.role, runAct(run));
  const knob = tierKnob(tier, D97_ENCOUNTERS.tierKnobs);
  const avatarId =
    challenger.deck.kind === "generic"
      ? challenger.deck.deckSourceAvatarId
      : (challenger.deck.avatarIds.find((id) => id !== run.avatarId) ?? challenger.deck.avatarIds[0]);
  if (avatarId === undefined) return null;
  const deckSeed = hashSeed(`${run.runSeed}:${challenger.characterId}`);
  const build = content.buildOpponentDeck({
    avatarId,
    seed: deckSeed,
    knob,
    deckSize: D97_ENCOUNTERS.opponentDeckSize,
    signatureCount: D97_ENCOUNTERS.signatureCardCount,
  });
  if (build === null) return null;
  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);
  const playerAnte =
    anteAllowance(run.collection) > 0 ? pick(copiesInZone(run.collection, "deck"), random) : null;
  const opponentAnte = pick(
    build.deck.filter((cardId) => content.cardRarity(cardId) !== "Legendary"),
    random,
  );
  const encounter: D97Encounter = {
    anchorId,
    characterId: challenger.characterId,
    role: challenger.role,
    kind: challenger.deck.kind,
    tier,
    avatarId,
    abilityActive: challenger.deck.kind === "avatar" && knob.abilityActive,
    deck: build.deck,
    draftPool: build.draftPool,
    dreamsignIds: build.dreamsignIds,
    signatureCardIds: build.signatureCardIds,
    scoreToWin: D97_ENCOUNTERS.actScoreTargets[runAct(run) - 1] ?? D97_ENCOUNTERS.actScoreTargets[0] ?? 0,
    headStarts: { player: 0, opponent: knob.headStart },
    playerAnteCopyId: playerAnte?.copyId ?? null,
    opponentAnteCardId: opponentAnte,
    extra:
      challenger.role === "challenger"
        ? { kind: "essence", amount: D97_ENCOUNTERS.purseBase * (1 + Math.floor(tier / D97_ENCOUNTERS.purseTierDivisor)) }
        : null,
    battles: 0,
    beaten: false,
  };
  return {
    d97: { ...d97, run: { ...run, encounters: { ...run.encounters, [anchorId]: encounter } } },
    logRecords: [
      {
        event: "d97_encounter_previewed",
        fields: {
          runId: run.runId,
          anchorId,
          characterId: encounter.characterId,
          role: encounter.role,
          tier,
          avatarId,
          abilityActive: encounter.abilityActive,
          deckSeed,
          deckCardIds: encounter.deck,
          dreamsignIds: encounter.dreamsignIds,
          signatureCardIds: encounter.signatureCardIds,
          playerAnteCopyId: encounter.playerAnteCopyId,
          playerAnteCardId: playerAnte?.cardId ?? null,
          opponentAnteCardId: encounter.opponentAnteCardId,
          extra: encounter.extra,
          scoreToWin: encounter.scoreToWin,
          headStarts: encounter.headStarts,
        },
      },
    ],
  };
}

/** `D97_DECLINE_ENCOUNTER { anchorId }`: Not now. Free; recorded for the log. */
export function declineEncounter(d97: D97State, payload: Record<string, unknown>): D97Transition | null {
  const run = d97.run;
  const anchorId = dreamAnchorIdFromUnknown(payload.anchorId);
  if (run === null || anchorId === null) return null;
  const encounter = run.encounters[anchorId];
  if (encounter === undefined) return null;
  return {
    d97,
    logRecords: [{ event: "d97_encounter_declined", fields: { runId: run.runId, anchorId, characterId: encounter.characterId } }],
  };
}

/**
 * The player's ante when a battle starts (Appendix A §A9): nothing at the
 * collection floor; the previewed copy while it stays in the active deck;
 * otherwise a uniform pick among active copies worth at least as much (by
 * rarity cost), or the most valuable active copy.
 */
export function resolvePlayerAnte(
  collection: D97Collection,
  previewed: D97OwnedCopyId | null,
  rarity: (cardId: CardId) => Rarity | null,
  random: () => number,
): D97OwnedCopyId | null {
  if (anteAllowance(collection) <= 0) return null;
  const deck = copiesInZone(collection, "deck");
  if (deck.length === 0) return null;
  const original = previewed === null ? null : findCopy(collection, previewed);
  if (original !== null && original.zone === "deck") return original.copyId;
  const value = (copy: D97OwnedCopy) => rarityCost(rarity(copy.cardId));
  if (original !== null) {
    const floor = value(original);
    const eligible = deck.filter((copy) => value(copy) >= floor);
    const chosen = pick(eligible, random);
    if (chosen !== null) return chosen.copyId;
  }
  let best = deck[0];
  for (const copy of deck) if (best === undefined || value(copy) > value(best)) best = copy;
  return best?.copyId ?? null;
}

/**
 * `D97_BEGIN_BATTLE { anchorId }`: Fight. Requires a previewed, unbeaten
 * encounter and an active deck of at least the minimum size; resolves the
 * player's ante and starts the engine battle the content builds.
 */
export function beginEncounterBattle(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): D97FoldTransition | null {
  const d97 = state.d97;
  const run = d97?.run ?? null;
  const anchorId = dreamAnchorIdFromUnknown(payload.anchorId);
  const content = d97ContentProvider();
  if (d97 === undefined || run === null || anchorId === null || content === null || state.battle !== null) return null;
  const encounter = run.encounters[anchorId];
  if (encounter === undefined || encounter.beaten) return null;
  if (deckSize(run.collection) < D97_COLLECTION.minimumDeckSize) return null;
  const engine = getBattleInitProvider()?.engine ?? null;
  if (engine === null) return null;
  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);
  const playerAnteCopyId = resolvePlayerAnte(run.collection, encounter.playerAnteCopyId, content.cardRarity, random);
  const battleId = parseBattleId(`d97:${run.runId}:${anchorId}:${String(encounter.battles)}`);
  const seed = hashSeed(`${run.runSeed}:${anchorId}:${String(encounter.battles)}`);
  const start = content.startBattle({ run, encounter, battleId, seed, playerAnteCopyId });
  if (start === null) return null;
  const started = startEngineBattleWithCommits(start.engineInit, engine, ctx.seq);
  if (started === null) return null;
  return {
    state: { ...state, battle: { mode: { kind: "d97" }, init: start.init, engine: started.fold } },
    logRecords: [
      {
        event: "d97_battle_started",
        fields: {
          runId: run.runId,
          anchorId,
          battleId,
          seed,
          characterId: encounter.characterId,
          role: encounter.role,
          tier: encounter.tier,
          scoreToWin: start.engineInit.scoreToWin,
          playerAnteCopyId,
          playerAnteCardId: playerAnteCopyId === null ? null : findCopy(run.collection, playerAnteCopyId)?.cardId ?? null,
          opponentAnteCardId: encounter.opponentAnteCardId,
          playerDeckCardIds: copiesInZone(run.collection, "deck").map((copy) => copy.cardId),
          opponentDeckCardIds: encounter.deck,
        },
      },
    ],
  };
}

/**
 * `D97_END_BATTLE {}`: settle a finished D97 battle. A win pays the
 * opponent's ante (and, for a challenger, a bundle of bag draws up to the
 * tier's rarity budget, the ante counting first, and the extra) and marks the
 * opponent beaten; a loss removes the anted copy unless that would breach the
 * collection floor; a draw changes nothing. The player returns beside the
 * anchor.
 */
export function endEncounterBattle(
  state: FoldState,
  ctx: EventContext,
): D97FoldTransition | null {
  const d97 = state.d97;
  const run = d97?.run ?? null;
  const battle = d97BattleOf(state.battle);
  const content = d97ContentProvider();
  if (d97 === undefined || run === null || battle === null || content === null) return null;
  const result = engineBattleResult(battle);
  if (result === null) return null;
  const { anchorId, tier, role, playerAnteCopyId, opponentAnteCardId } = battle.init;
  const encounter = run.encounters[anchorId];
  if (encounter === undefined) return null;
  const won = result.kind === "victory" && result.winner === "player";
  const lost = result.kind === "victory" && result.winner !== "player";
  const battlesFought = run.battlesFought + 1;
  let collection = run.collection;
  let bag = run.bag;
  let essence = run.essence;
  const wonCardIds: CardId[] = [];
  const records: ReducerLogRecord[] = [];
  let lostCopy: D97OwnedCopy | null = null;
  if (won) {
    let drawIndex = 0;
    const random = (): number => ctx.rng(drawIndex++);
    let remaining = role === "challenger" ? bundleBudget(tier) : 0;
    if (opponentAnteCardId !== null) {
      collection = acquireCopy(collection, {
        runSeed: run.runSeed,
        cardId: opponentAnteCardId,
        provenance: { channel: "ante", battleCount: battlesFought },
        zone: "reserve",
      }).collection;
      bag = recordAcquisition(bag, opponentAnteCardId);
      wonCardIds.push(opponentAnteCardId);
      remaining -= rarityCost(content.cardRarity(opponentAnteCardId));
    }
    while (remaining > 0) {
      const draw = drawFromBag(bag, random);
      if (draw === null) break;
      bag = draw.bag;
      records.push(bagDrawLogRecord(run.runId, draw));
      collection = acquireCopy(collection, {
        runSeed: run.runSeed,
        cardId: draw.cardId,
        provenance: { channel: "bundle", battleCount: battlesFought },
        zone: "reserve",
      }).collection;
      wonCardIds.push(draw.cardId);
      remaining -= rarityCost(content.cardRarity(draw.cardId));
    }
    essence += encounter.extra?.amount ?? 0;
  } else if (lost && playerAnteCopyId !== null) {
    const copy = findCopy(collection, playerAnteCopyId);
    const removed = copy === null ? null : removeCopies(collection, [playerAnteCopyId], D97_COLLECTION.collectionFloor);
    if (copy !== null && removed !== null) {
      collection = removed;
      lostCopy = copy;
    }
  }
  const settled: D97Encounter = { ...encounter, battles: encounter.battles + 1, beaten: encounter.beaten || won };
  const nextRun: D97Run = {
    ...run,
    essence,
    battlesFought,
    collection,
    bag,
    encounters: { ...run.encounters, [anchorId]: settled },
    returnAnchorId: anchorId,
  };
  // A win does the held quest's defeat step on this opponent.
  const defeat = won ? advanceDefeatQuest(nextRun, anchorId) : null;
  return {
    state: { ...state, battle: null, d97: { ...d97, run: defeat?.run ?? nextRun } },
    logRecords: [
      ...records,
      {
        event: "d97_battle_result",
        fields: {
          runId: run.runId,
          anchorId,
          battleId: battle.init.battleId,
          characterId: encounter.characterId,
          role,
          tier,
          result: won ? "win" : lost ? "loss" : "draw",
          reason: result.reason,
          wonCardIds,
          essencePaid: won ? (encounter.extra?.amount ?? 0) : 0,
          lostCopyId: lostCopy?.copyId ?? null,
          lostCardId: lostCopy?.cardId ?? null,
          beaten: settled.beaten,
          battlesFought,
          collectionSize: collection.copies.length,
        },
      },
      ...(defeat?.logRecords ?? []),
    ],
  };
}
