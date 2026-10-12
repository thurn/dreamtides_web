/**
 * "When you erode a card" (`whenErode`) and "When you erode this card"
 * (`whenErodeSelf`; rules § Ability Types → When you discard or erode this
 * card; RD-hv-umm2.87-1): each card Erode puts from a player's deck into
 * their void, matched once `eroded` announces it there, whoever's effect
 * made them erode. The self form works from the void, alone or as a branch
 * of "When you discard or erode this card".
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { energy, event, everyIn, keyword, thisCardIn } from "../../../dsl/builders";
import { either, onMaterialized, triggered, untilEndOfTurn, whenDiscardSelf, whenErode, whenErodeSelf } from "../../../dsl/triggers";
import { PolicyRandom } from "../../../policy/random";
import { createEngine, IllegalAction } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { hasKeyword } from "../../../rules/keywords";
import { erodeCard } from "../../../rules/resources";
import { routeCosts } from "../../../rules/timing";
import { cloneState } from "../../../state/clone";
import { deserializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, type AbilitySource, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type BoardSetup } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import type { Decklists } from "../../../view/determinize";
import { discard } from "../discard";
import { draw } from "../draw";
import { erode } from "../erode";
import { gainEnergy } from "../gain-energy";
import { grantReclaim } from "../grant-reclaim";
import { optional } from "../optional";
import { putInDeck } from "../put-in-deck";

function card(index: number, cardType: "character" | "event", cost: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition {
  return {
    id: syntheticId(0x8700 + index),
    cardType,
    costs: [energy(cost)],
    spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "",
    speed: "standard",
    status: "authored",
    abilities,
  };
}

const D = {
  /** "Gain 1●. When you discard or erode this card, it gains reclaim 3●." */
  barrow: card(0, "event", 5, () => [
    event(gainEnergy(1)),
    triggered(either(whenDiscardSelf(), whenErodeSelf()), grantReclaim(thisCardIn("void"), { costs: [energy(3)] }), { zone: "void" }),
  ]),
  /** "When you erode this card, it gains reclaim." */
  erodeOnly: card(1, "character", 2, () => [triggered(whenErodeSelf(), grantReclaim(thisCardIn("void")), { zone: "void" })]),
  /** "When you erode a card, gain 1●." */
  erodeWatch: card(2, "character", 5, () => [triggered(whenErode(), gainEnergy(1))]),
  /** "When the opponent erodes an event, gain 1●." */
  opponentEventWatch: card(3, "character", 5, () => [triggered(whenErode("opponent", { cardType: "event" }), gainEnergy(1))]),
  /** "When you erode a card, put each card in your void on the bottom of your deck." */
  voidToDeck: card(4, "character", 5, () => [triggered(whenErode(), putInDeck([everyIn("void")], "bottom"))]),
  /** "When you erode a card, you may draw a card." */
  mayDraw: card(5, "character", 5, () => [triggered(whenErode(), optional(draw(1)))]),
  /** "Until end of turn, events in your void gain reclaim." */
  eventsGainReclaim: card(6, "event", 0, () => [event(grantReclaim(everyIn("void", { cardType: "event" }), { duration: untilEndOfTurn() }))]),
  reclaimVoid: card(7, "event", 5, () => [keyword("reclaim"), event(gainEnergy(0))]),
  plainVoid: card(8, "event", 5, () => [event(gainEnergy(0))]),
} as const;
const S = {
  erodeOne: card(10, "event", 0, () => [event(erode(1))]),
  erodeThree: card(11, "event", 0, () => [event(erode(3))]),
  opponentErodes: card(12, "event", 0, () => [event(erode(1, "opponent"))]),
  discardOne: card(13, "event", 0, () => [event(discard(1))]),
  /** Erodes its controller's top card, then fails. */
  failing: { ...card(14, "event", 0, () => []), synthetic: {
    resolve(ctx, item) {
      erodeCard(ctx, item.controller);
      throw new Error("synthetic failure after an erode");
    },
  } } satisfies EngineCardDefinition,
} as const;

const E = createEngine(testCatalog([...Object.values(D), ...Object.values(S)]));
const filler = Array.from({ length: 6 }, () => v.vanilla3.id);

function setup(board: Omit<BoardSetup, "phase" | "active">) {
  return boardState(E.catalog, { active: "player", phase: "day", ...board });
}
function act(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const result = E.apply(state, side, action, answers.length === 0 ? NO_PROMPTS : source);
  if (answers.length > 0) source.assertExhausted();
  expect(invariantViolations(result.state, E.catalog)).toEqual([]);
  return result;
}
function cast(state: BattleState, side: Side, card: InstanceId | undefined, answers: readonly Answer[] = []) {
  if (card === undefined) throw new Error("no card");
  return act(state, side, { kind: "play", card, from: "hand" }, answers);
}
function queued(events: readonly EngineEvent[]): (AbilitySource | null)[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.source] : []));
}
function subjects(events: readonly EngineEvent[]): (InstanceId | null)[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.subject] : []));
}
function controllers(events: readonly EngineEvent[]): Side[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.controller] : []));
}
const reclaimable = (state: BattleState, id: InstanceId) => hasKeyword(state, E.catalog, id, "reclaim");
const reclaimCosts = (state: BattleState, id: InstanceId) => routeCosts(state, E.catalog, id, "reclaim");

describe("whenErodeSelf", () => {
  it("triggers from the void on its own erode only, one card at a time, and grants Reclaim at the stated or printed cost", () => {
    const { state, ids } = setup({
      player: { back: [D.erodeWatch.id], hand: [S.erodeThree.id], void: [D.barrow.id], deck: [D.barrow.id, v.vanilla1.id, D.erodeOnly.id, ...filler], energy: 0 },
      enemy: { deck: filler },
    });
    const [watch] = ids.player.back;
    const [resting] = ids.player.void;
    const [barrow, vanilla, erodeOnly] = ids.player.deck;
    const result = cast(state, "player", ids.player.hand[0]);
    // Each eroded card: the in-play watcher first, then the eroded card itself in the void; the copy already there sees nothing.
    expect(queued(result.events)).toEqual([watch, barrow, watch, watch, erodeOnly]);
    expect(subjects(result.events)).toEqual([barrow, barrow, vanilla, erodeOnly, erodeOnly]);
    const kinds = result.events.map((entry) => `${entry.kind}:${"instance" in entry ? String(entry.instance) : ""}`);
    expect(kinds.indexOf(`eroded:${barrow}`)).toBeLessThan(kinds.indexOf(`eroded:${vanilla}`));
    expect(result.state.sides.player.currentEnergy).toBe(3);
    expect(reclaimCosts(result.state, barrow)).toEqual([energy(3)]);
    expect(reclaimCosts(result.state, erodeOnly)).toEqual([energy(2)]);
    expect([resting, vanilla].map((id) => reclaimable(result.state, id))).toEqual([false, false]);

    // Reclaim 3●: played from the void for 3●, and reclaimed.
    const funded = { ...result.state, sides: { ...result.state.sides, player: { ...result.state.sides.player, currentEnergy: 3 } } };
    const played = act(funded, "player", { kind: "play", card: barrow, from: "void" });
    expect(played.state.sides.player.banished).toContain(barrow);
    expect(played.state.sides.player.currentEnergy).toBe(1);
  });

  it("triggers whatever made its owner erode it, for its owner, and \"discard or erode\" triggers on a discard too", () => {
    const { state, ids } = setup({
      player: { hand: [S.opponentErodes.id, S.discardOne.id, D.barrow.id], energy: 0, deck: filler },
      enemy: { deck: [D.barrow.id, ...filler] },
    });
    const [opponentErodes, discardOne, held] = ids.player.hand;
    const [enemyBarrow] = ids.enemy.deck;
    const made = cast(state, "player", opponentErodes);
    expect(queued(made.events)).toEqual([enemyBarrow]);
    expect(controllers(made.events)).toEqual(["enemy"]);
    expect(reclaimCosts(made.state, enemyBarrow)).toEqual([energy(3)]);

    const discarded = cast(made.state, "player", discardOne);
    expect(queued(discarded.events)).toEqual([held]);
    expect(reclaimCosts(discarded.state, held)).toEqual([energy(3)]);
  });

  it("works only from the void, and the self form alone ignores a discard", () => {
    expect(() => triggered(whenErodeSelf(), gainEnergy(1))).toThrow();
    expect(() => triggered(whenErodeSelf(), gainEnergy(1), { zone: "any" })).toThrow();
    expect(() => triggered(either(onMaterialized(), whenErodeSelf()), gainEnergy(1), { zone: "hand" })).toThrow();
    expect(triggered(whenErodeSelf(), gainEnergy(1), { zone: "void" }).zone).toBe("void");
    // The general form names no card of its own, so it works wherever its ability says.
    expect(triggered(whenErode(), gainEnergy(1)).zone).toBe("play");

    const { state, ids } = setup({ player: { hand: [S.discardOne.id, D.erodeOnly.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [discardOne, erodeOnly] = ids.player.hand;
    const result = cast(state, "player", discardOne);
    expect(result.state.instances[erodeOnly]?.zone).toBe("void");
    expect(queued(result.events)).toEqual([]);
    expect(reclaimable(result.state, erodeOnly)).toBe(false);
  });

  it("names its card to both sides when it is eroded from a hidden deck, with nothing redacted", () => {
    const { state, ids } = setup({ player: { hand: [S.erodeOne.id], energy: 0, deck: [D.barrow.id, ...filler] }, enemy: { deck: filler } });
    const [barrow] = ids.player.deck;
    for (const viewer of ["player", "enemy"] as const) expect(E.view(state, viewer).instances[barrow]).toBeUndefined();
    const result = cast(state, "player", ids.player.hand[0]);
    for (const viewer of ["player", "enemy"] as const) {
      const seen = result.events.flatMap((entry) => {
        const shown = eventSeenBy(entry, viewer, result.state);
        return shown === null ? [] : [shown];
      });
      expect(seen).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: barrow, subject: barrow }));
      expect(E.view(result.state, viewer).instances[barrow]?.characteristics.keywords).toContain("reclaim");
    }
    expect(result.events.filter((entry) => entry.kind === "triggerQueued" && entry.subjectHiddenFrom !== undefined)).toEqual([]);
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
  });

  it("grants nothing when its card leaves the void before the trigger resolves", () => {
    const { state, ids } = setup({ player: { back: [D.voidToDeck.id], hand: [S.erodeOne.id], energy: 0, deck: [D.barrow.id, ...filler] }, enemy: { deck: filler } });
    const [watch] = ids.player.back;
    const [barrow] = ids.player.deck;
    const result = cast(state, "player", ids.player.hand[0]);
    // The in-play watcher resolves first and puts the eroded card back into the deck.
    expect(queued(result.events)).toEqual([watch, barrow]);
    expect(result.state.instances[barrow]?.zone).toBe("deck");
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "triggerResolved", source: barrow, applied: true }));
    expect(result.events.some((entry) => entry.kind === "effectStarted")).toBe(false);
    expect(reclaimable(result.state, barrow)).toBe(false);
  });
});

describe("whenErode", () => {
  it("matches only the named player's erodes, by the eroded card's characteristics in the void, and nothing on Fatigue", () => {
    const { state, ids } = setup({
      player: { back: [D.erodeWatch.id, D.opponentEventWatch.id], hand: [S.erodeOne.id, S.opponentErodes.id, S.opponentErodes.id, S.discardOne.id, v.vanilla1.id], energy: 0, deck: [v.vanilla1.id] },
      enemy: { deck: [v.event0.id, v.vanilla1.id] },
    });
    const [watch, eventWatch] = ids.player.back;
    const [erodeOne, firstOpponent, secondOpponent, discardOne] = ids.player.hand;
    const own = cast(state, "player", erodeOne);
    expect(queued(own.events)).toEqual([watch]);
    // The enemy's event matches the opponent watcher; the enemy's character after it does not, and neither triggers "you".
    const theirEvent = cast(own.state, "player", firstOpponent);
    expect(queued(theirEvent.events)).toEqual([eventWatch]);
    const theirCharacter = cast(theirEvent.state, "player", secondOpponent);
    expect(queued(theirCharacter.events)).toEqual([]);
    expect(theirCharacter.state.sides.player.currentEnergy).toBe(2);
    // A discard (of the only card left in hand, so no choice) is not an erode.
    const discarded = cast(theirCharacter.state, "player", discardOne);
    expect(queued(discarded.events)).toEqual([]);
    // The player's deck is empty: Erode causes Fatigue instead, and nothing is eroded.
    const fatigue = setup({ player: { back: [D.erodeWatch.id], hand: [S.erodeOne.id], energy: 0, deck: [] }, enemy: { deck: filler } });
    const tired = cast(fatigue.state, "player", fatigue.ids.player.hand[0]);
    expect(tired.events.some((entry) => entry.kind === "fatigue")).toBe(true);
    expect(tired.events.some((entry) => entry.kind === "eroded")).toBe(false);
    expect(queued(tired.events)).toEqual([]);
  });

  it("keeps a queued self-trigger across a reload and resolves it identically through the fold", () => {
    const { state, ids } = setup({ player: { back: [D.mayDraw.id], hand: [S.erodeOne.id], energy: 0, deck: [D.barrow.id, ...filler] }, enemy: { deck: filler } });
    const [mayDraw] = ids.player.back;
    const [barrow] = ids.player.deck;
    const action = { kind: "play", card: ids.player.hand[0], from: "hand" } as const;
    const inline = E.apply(state, "player", action, new ScriptedSource([true]));
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: "player", action });
    if (opened.kind !== "applied" || opened.error !== null) throw new Error("bounced");
    const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const reloaded: BattleSlice = { ...saved, committed: deserializeState(JSON.stringify(opened.slice.committed)) };
    const pending = createFoldAdapter(E, { checkEventPrefix: true }).pending(reloaded);
    if (pending === null) throw new Error("no trigger prompt after reload");
    expect(pending.prompt).toMatchObject({ side: "player", purpose: { role: "youMay", source: mayDraw } });
    expect(pending.display.triggerQueue.map((entry) => entry.source)).toEqual([barrow]);
    const answered = createFoldAdapter(E, { checkEventPrefix: true }).reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true });
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("answer failed");
    expect(stateHash(answered.slice.committed)).toBe(stateHash(inline.state));
    expect([...opened.published, ...answered.published]).toEqual(inline.events);
    expect(reclaimCosts(answered.slice.committed, barrow)).toEqual([energy(3)]);
  });

  it("queues nothing from a step that fails after its card was eroded", () => {
    const { state, ids } = setup({ player: { back: [D.erodeWatch.id], hand: [S.failing.id], energy: 0, deck: [D.barrow.id, ...filler] }, enemy: { deck: filler } });
    const [barrow] = ids.player.deck;
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected synthetic failure");
    expect(outcome.error.message).toContain("synthetic failure after an erode");
    expect(outcome.published.some((entry) => entry.kind === "eroded" || entry.kind === "triggerQueued")).toBe(false);
    expect(outcome.slice.committed.triggerQueue).toEqual([]);
    expect(outcome.slice.committed.sides.player.deck[0]).toBe(barrow);
    expect(reclaimable(outcome.slice.committed, barrow)).toBe(false);
  });
});

describe("a group Reclaim grant whose source ceased to exist", () => {
  it("stays in every view and determinization, so the void card stays playable for both", () => {
    const { state, ids } = setup({ player: { hand: [D.eventsGainReclaim.id], void: [S.erodeOne.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [grant] = ids.player.hand;
    const [voidEvent] = ids.player.void;
    // A created card (as a copy of an event is) ceases to exist once it resolves; its grant outlives it.
    state.instances[grant].status.created = true;
    const result = cast(state, "player", grant);
    expect(result.state.instances[grant]).toBeUndefined();
    expect(reclaimable(result.state, voidEvent)).toBe(true);
    expect(E.legalActions(result.state, "player")).toContainEqual({ kind: "play", card: voidEvent, from: "void" });
    for (const viewer of ["player", "enemy"] as const) {
      const kept = E.view(result.state, viewer).floating.filter((effect) => effect.change.kind === "keyword" && effect.change.instance === voidEvent);
      expect(kept.map((effect) => [effect.source, effect.change.kind === "keyword" ? effect.change.keyword : null])).toEqual([[null, "reclaim"]]);
    }
    const decklists = {
      player: [D.eventsGainReclaim.id, S.erodeOne.id, ...filler].map((cardId) => ({ cardId })),
      enemy: filler.map((cardId) => ({ cardId })),
    };
    expect(determinizationDivergences(E, result.state, decklists, battleSeed("ceased-grant"), 0)).toEqual([]);
  });
});


// The source is blind or absent before this temporary effect starts. Neither
// source identity nor remembered permanent observations can carry the change.
const reclaimMatrix = (["player", "enemy"] as const).flatMap((owner) =>
  (["hidden", "ceased"] as const).flatMap((sourceState) =>
    [true, false].map((gains) => ({ owner, sourceState, gains, operation: gains ? "gained" : "lost" })),
  ),
);

describe("Reclaim legality independent of source identity", () => {
  it.each(reclaimMatrix)("preserves $operation Reclaim for $owner from a $sourceState source in both views and samples", ({ owner, sourceState, gains }) => {
    const targetDefinition = gains ? D.plainVoid : D.reclaimVoid;
    const other = opponent(owner);
    const { state, ids } = boardState(E.catalog, {
      active: owner, phase: "day",
      [owner]: { void: [targetDefinition.id], deck: [v.vanilla2.id, ...filler], energy: 5 },
      [other]: { deck: filler },
    });
    const [source] = ids[owner].deck;
    const [target] = ids[owner].void;
    if (sourceState === "ceased") {
      state.sides[owner].deck.shift();
      delete state.instances[source];
    }
    const play = { kind: "play", card: target, from: "void" } as const;
    expect(E.legalActions(cloneState(state), owner).some((action) => JSON.stringify(action) === JSON.stringify(play))).toBe(!gains);
    state.floating.push({
      id: "e1", source, controller: owner, timestamp: state.clock,
      expiry: { at: "endOfTurn" },
      change: { kind: "keyword", instance: target, keyword: "reclaim", gains,
        ...(gains ? { reclaimCosts: [energy(1)] } : {}) },
    });
    state.nextEffect = 2;
    const entries = [targetDefinition.id, ...(sourceState === "hidden" ? [v.vanilla2.id] : []), ...filler].map((cardId) => ({ cardId }));
    const decklists: Decklists = {
      player: owner === "player" ? entries : filler.map((cardId) => ({ cardId })),
      enemy: owner === "enemy" ? entries : filler.map((cardId) => ({ cardId })),
    };
    const expectedCosts = [energy(gains ? 1 : 5)];
    const checkPlay = (candidate: BattleState) => {
      expect(reclaimable(candidate, target)).toBe(gains);
      expect(reclaimCosts(candidate, target)).toEqual(expectedCosts);
      expect(E.legalActions(candidate, owner).some((action) => JSON.stringify(action) === JSON.stringify(play))).toBe(gains);
      if (gains) {
        const played = act(candidate, owner, play);
        expect(played.state.sides[owner].currentEnergy).toBe(4);
        expect(played.state.sides[owner].banished).toContain(target);
      } else {
        expect(() => E.apply(candidate, owner, play, NO_PROMPTS)).toThrow(IllegalAction);
      }
    };
    checkPlay(state);
    for (const viewer of ["player", "enemy"] as const) {
      const seen = E.view(state, viewer);
      expect(seen.instances[source]).toBeUndefined();
      const kept = seen.floating.filter((effect) => effect.change.kind === "keyword" && effect.change.instance === target);
      expect(kept).toEqual([expect.objectContaining({
        source: null, expiry: { at: "endOfTurn" },
        change: { kind: "keyword", instance: target, keyword: "reclaim", gains,
          ...(gains ? { reclaimCosts: [energy(1)] } : {}) },
      })]);
      // The real source's ID is absent even if the sample happens to mint the same number.
      expect(JSON.stringify(seen)).not.toContain(JSON.stringify(source));
      const random = new PolicyRandom(battleSeed(`reclaim-${owner}-${sourceState}-${gains}-${viewer}`));
      const sampled = E.determinize(seen, decklists, () => random.next());
      expect(invariantViolations(sampled, E.catalog)).toEqual([]);
      checkPlay(sampled);
    }
    expect(determinizationDivergences(E, state, decklists, battleSeed(`reclaim-${owner}-${sourceState}-${gains}`), 0)).toEqual([]);
  });
});
