// The D97 encounter contract over synthetic content: the first preview fixes
// the opponent's deck, both antes and the extra (a later preview bounces and
// changes nothing); a collection at its floor antes nothing; ante drift picks
// an active copy worth at least as much; a win pays the ante first in a
// bundle of the tier's rarity budget plus the extra and marks the opponent
// beaten; a loss removes the anted copy only above the floor; a draw changes
// nothing but the battle count.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D97_CHALLENGERS } from "../../content/d97/challengers";
import { D97_COLLECTION } from "../../content/d97/collection";
import { D97_ENCOUNTERS } from "../../content/d97/encounters";
import { copiesInZone, findCopy } from "../../d97/collection/collection";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import { parseBattleId, type DreamAnchorId } from "../../types/identifiers";
import { testAvatarId } from "../../types/test-identities";
import type { D97BattleFoldState } from "../battle/fold";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { ctx, event, GENESIS } from "../reducer-fixtures";
import { d97ContentProvider, registerD97ContentProvider } from "./d97-content";
import { syntheticD97Content } from "./d97-content.fixtures";
import {
  bundleBudget,
  encounterTier,
  endEncounterBattle,
  resolvePlayerAnte,
} from "./d97-encounters";
import type { D97Run } from "./d97-state";

const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const AVATAR = testAvatarId("d97-encounter-avatar");
const CHALLENGER = D97_CHALLENGERS.find((entry) => entry.role === "challenger")!;
const GUARDIAN = D97_CHALLENGERS.find((entry) => entry.role === "guardian")!;

function apply(state: FoldState, type: string, payload: Record<string, unknown>, seq: number) {
  return reduceGameEvent(state, event(type as never, payload), ctx({ seq, rng: eventRng(D97_GENESIS.seed, seq) }));
}

function runOf(state: FoldState): D97Run {
  const run = state.d97?.run;
  if (run === undefined || run === null) throw new Error("no D97 run");
  return run;
}

function withRun(state: FoldState, edit: (run: D97Run) => D97Run): FoldState {
  const d97 = state.d97;
  if (d97 === undefined) throw new Error("no D97 slice");
  return { ...state, d97: { ...d97, run: edit(runOf(state)) } };
}

function started(): FoldState {
  return apply(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR }, 1).state;
}

function previewed(anchorId: DreamAnchorId = CHALLENGER.anchorId, state = started()): FoldState {
  const result = apply(state, "D97_PREVIEW_ENCOUNTER", { anchorId }, 2);
  expect(result.outcome).toBe("applied");
  return result.state;
}

/** A finished D97 battle against the encounter at `anchorId`. */
function finished(state: FoldState, anchorId: DreamAnchorId, winner: "player" | "enemy" | null): FoldState {
  const encounter = runOf(state).encounters[anchorId]!;
  const battle = {
    mode: { kind: "d97" },
    init: {
      battleId: parseBattleId("d97:test"),
      opponentAbilityActive: false,
      enemyDescriptor: {},
      avatarSummary: null,
      cardDefinitions: [],
      anchorId,
      characterId: encounter.characterId,
      role: encounter.role,
      tier: encounter.tier,
      playerAnteCopyId: encounter.playerAnteCopyId,
      opponentAnteCardId: encounter.opponentAnteCardId,
    },
    engine: {
      init: {},
      slice: {
        committed: {
          result: winner === null ? { kind: "draw", reason: "turnLimit" } : { kind: "victory", winner, reason: "score" },
        },
      },
    },
  } as unknown as D97BattleFoldState;
  return { ...state, battle };
}

function end(state: FoldState) {
  const transition = endEncounterBattle(state, ctx({ seq: 9, rng: eventRng(D97_GENESIS.seed, 9) }));
  if (transition === null) throw new Error("end bounced");
  return transition;
}

beforeEach(() => {
  registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR], poolSize: 40 }));
});

afterEach(() => {
  registerD97ContentProvider(null);
});

describe("tiers and budgets", () => {
  it("fights challengers at the act tier and guardians three above, with S = floor(T/4)", () => {
    expect(encounterTier("challenger", 1)).toBe(4);
    expect(encounterTier("guardian", 1)).toBe(7);
    expect([bundleBudget(4), bundleBudget(7), bundleBudget(8), bundleBudget(13)]).toEqual([1, 1, 2, 3]);
  });
});

describe("D97_PREVIEW_ENCOUNTER", () => {
  it("fixes the deck, both antes and the extra at the first preview", () => {
    const state = previewed();
    const run = runOf(state);
    const encounter = run.encounters[CHALLENGER.anchorId]!;
    expect(encounter.tier).toBe(4);
    expect(encounter.deck).toHaveLength(D97_ENCOUNTERS.opponentDeckSize);
    expect(encounter.signatureCardIds).toHaveLength(D97_ENCOUNTERS.signatureCardCount);
    expect(findCopy(run.collection, encounter.playerAnteCopyId!)?.zone).toBe("deck");
    expect(encounter.deck).toContain(encounter.opponentAnteCardId);
    expect(encounter.extra).toEqual({ kind: "essence", amount: 10 });
    expect(encounter.beaten).toBe(false);

    const again = reduceGameEvent(state, event("D97_PREVIEW_ENCOUNTER", { anchorId: CHALLENGER.anchorId }), ctx({ seq: 5, rng: eventRng(D97_GENESIS.seed, 5) }));
    expect(again.outcome).toBe("bounced");
    expect(runOf(again.state).encounters[CHALLENGER.anchorId]).toBe(encounter);
  });

  it("gives a guardian the guardian tier, an active ability and no extra", () => {
    const encounter = runOf(previewed(GUARDIAN.anchorId)).encounters[GUARDIAN.anchorId]!;
    expect(encounter.tier).toBe(7);
    expect(encounter.abilityActive).toBe(true);
    expect(encounter.extra).toBeNull();
  });

  it("antes nothing at the collection floor and bounces unknown anchors", () => {
    const atFloor = withRun(started(), (run) => ({
      ...run,
      collection: { ...run.collection, copies: run.collection.copies.slice(0, D97_COLLECTION.collectionFloor) },
    }));
    expect(runOf(previewed(CHALLENGER.anchorId, atFloor)).encounters[CHALLENGER.anchorId]?.playerAnteCopyId).toBeNull();
    expect(apply(started(), "D97_PREVIEW_ENCOUNTER", { anchorId: "d9700000-0000-4000-8000-0000000000ff" }, 2).outcome).toBe("bounced");
  });
});

describe("resolvePlayerAnte", () => {
  it("keeps an active ante, drifts to an active copy of at least its sale value, and antes nothing at the floor", () => {
    const run = runOf(started());
    const deck = copiesInZone(run.collection, "deck");
    // Worth is the copy's sale value: only deck[2] is worth at least the original deck[0].
    const value = (copy: { copyId: unknown }) => (copy.copyId === deck[2].copyId ? 99 : copy.copyId === deck[0].copyId ? 50 : 1);
    expect(resolvePlayerAnte(run.collection, deck[0].copyId, value, () => 0)).toBe(deck[0].copyId);
    const moved = {
      ...run.collection,
      copies: run.collection.copies.map((copy) => (copy.copyId === deck[0].copyId ? { ...copy, zone: "reserve" as const } : copy)),
    };
    const drifted = resolvePlayerAnte(moved, deck[0].copyId, value, () => 0);
    expect(drifted).toBe(deck[2].copyId);
    expect(findCopy(moved, drifted!)?.zone).toBe("deck");
    const floor = { ...run.collection, copies: run.collection.copies.slice(0, D97_COLLECTION.collectionFloor) };
    expect(resolvePlayerAnte(floor, deck[0].copyId, value, () => 0)).toBeNull();
  });
});

describe("D97_END_BATTLE", () => {
  it("pays the ante first within the bundle budget, the extra, and marks the challenger beaten", () => {
    const state = previewed();
    const before = runOf(state);
    const { state: after, logRecords } = end(finished(state, CHALLENGER.anchorId, "player"));
    const run = runOf(after);
    const encounter = run.encounters[CHALLENGER.anchorId]!;
    const won = run.collection.copies.slice(before.collection.copies.length);
    expect(won[0]?.cardId).toBe(encounter.opponentAnteCardId);
    expect(won.every((copy) => copy.zone === "reserve")).toBe(true);
    // Every bundle item but the last was drawn while budget remained.
    const rarity = d97ContentProvider()!.cardRarity;
    const costs = won.map((copy) => D97_ENCOUNTERS.rarityCost[rarity(copy.cardId) ?? "Common"]);
    expect(costs.slice(0, -1).reduce((sum, cost) => sum + cost, 0)).toBeLessThan(bundleBudget(encounter.tier));
    expect(run.essence).toBe(before.essence + 10);
    expect(encounter.beaten).toBe(true);
    expect(run.battlesFought).toBe(before.battlesFought + 1);
    expect(run.returnAnchorId).toBe(CHALLENGER.anchorId);
    expect(after.battle).toBeNull();
    expect(logRecords.some((record) => record.event === "d97_battle_result")).toBe(true);
    expect(apply(after, "D97_PREVIEW_ENCOUNTER", { anchorId: CHALLENGER.anchorId }, 10).outcome).toBe("bounced");
  });

  it("fills a bundle from the bag when the opponent antes nothing", () => {
    const state = withRun(previewed(), (run) => ({
      ...run,
      encounters: { ...run.encounters, [CHALLENGER.anchorId]: { ...run.encounters[CHALLENGER.anchorId]!, opponentAnteCardId: null } },
    }));
    const before = runOf(state);
    const run = runOf(end(finished(state, CHALLENGER.anchorId, "player")).state);
    const won = run.collection.copies.slice(before.collection.copies.length);
    expect(won.length).toBeGreaterThanOrEqual(1);
    expect(won.every((copy) => copy.provenance.channel === "bundle")).toBe(true);
  });

  it("pays a guardian's ante alone", () => {
    const state = previewed(GUARDIAN.anchorId);
    const before = runOf(state);
    const run = runOf(end(finished(state, GUARDIAN.anchorId, "player")).state);
    expect(run.collection.copies.length).toBe(before.collection.copies.length + 1);
    expect(run.essence).toBe(before.essence);
  });

  it("removes the anted copy on a loss, but never below the floor", () => {
    const state = previewed();
    const ante = runOf(state).encounters[CHALLENGER.anchorId]!.playerAnteCopyId!;
    const lost = runOf(end(finished(state, CHALLENGER.anchorId, "enemy")).state);
    expect(findCopy(lost.collection, ante)).toBeNull();
    expect(lost.encounters[CHALLENGER.anchorId]?.beaten).toBe(false);

    const atFloor = withRun(state, (run) => {
      const keep = run.collection.copies.filter((copy) => copy.copyId === ante).concat(
        run.collection.copies.filter((copy) => copy.copyId !== ante).slice(0, D97_COLLECTION.collectionFloor - 1),
      );
      return { ...run, collection: { ...run.collection, copies: keep } };
    });
    const kept = runOf(end(finished(atFloor, CHALLENGER.anchorId, "enemy")).state);
    expect(findCopy(kept.collection, ante)).not.toBeNull();
  });

  it("changes nothing but the battle count on a draw", () => {
    const state = previewed();
    const before = runOf(state);
    const run = runOf(end(finished(state, CHALLENGER.anchorId, null)).state);
    expect(run.collection).toBe(before.collection);
    expect(run.essence).toBe(before.essence);
    expect(run.encounters[CHALLENGER.anchorId]?.battles).toBe(1);
    expect(run.encounters[CHALLENGER.anchorId]?.beaten).toBe(false);
  });
});
