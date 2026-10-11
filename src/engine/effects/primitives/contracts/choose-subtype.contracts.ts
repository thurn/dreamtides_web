import { describe, expect, it } from "vitest";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import type { CardSubtype } from "../../../../types/card-identity";
import type { EngineCardDefinition } from "../../../catalog";
import { all, anyCharacter, characterYouControl, energy, event, self, staticAbility } from "../../../dsl/builders";
import { onMaterialized, triggered } from "../../../dsl/triggers";
import { matchingCharacters } from "../../../dsl/selectors";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import { greedyAnswer, stateSubtypeCounts } from "../../../policy/prompts";
import type { ChooseModePrompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { effectiveSpark } from "../../../rules/spark";
import { instanceOf } from "../../../rules/zones";
import { characteristics } from "../../../continuous/characteristics";
import type { CardId, InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { boardState, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { promptView } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { CHOSEN_SUBTYPE, chooseSubtype } from "../choose-subtype";
import { discover } from "../discover";
import { dissolve } from "../dissolve";
import { giveAllTypes } from "../give-all-types";
import { gainPoints } from "../gain-points";
import { sparkModifier } from "../spark-modifier";

const character = (index: number, subtype: CardSubtype, abilities: EngineCardDefinition["abilities"] = () => []): EngineCardDefinition => ({
  id: syntheticId(index), cardType: "character", costs: [energy(1)], spark: 1,
  subtype, speed: "standard", status: abilities.length === 0 ? "vanilla" : "authored", abilities,
});
const fastEvent = (index: number, abilities: EngineCardDefinition["abilities"], synthetic?: EngineCardDefinition["synthetic"]): EngineCardDefinition => ({
  id: syntheticId(index), cardType: "event", costs: [energy(1)], spark: null,
  subtype: "", speed: "fast", status: "authored", abilities, ...(synthetic === undefined ? {} : { synthetic }),
});

/** "▸Materialized: Choose a character type. This character is that character type. Characters of the chosen type have +1✦." */
const edge: EngineCardDefinition = {
  ...character(0x5c00, "Explorer", () => [
    triggered(onMaterialized(), chooseSubtype({ self: true })),
    staticAbility(sparkModifier(all(anyCharacter({ subtype: CHOSEN_SUBTYPE })), 1)),
  ]),
  spark: 2,
};
/** "Choose a character type. Discover a character of that type and put it on top of your deck." */
const rift = fastEvent(0x5c01, () => [event(chooseSubtype({ then: discover({ cardType: "character", subtype: CHOSEN_SUBTYPE }, {}, "deckTop") }))]);
const mage = character(0x5c02, "Mage");
const survivor = character(0x5c03, "Survivor");
/** A character printing an untyped placeholder that has all character types. */
const shifter = character(0x5c04, "*", () => [staticAbility(giveAllTypes(self()))]);
/** "Dissolve each character you control." */
const unmake = fastEvent(0x5c05, () => [event(dissolve(all(characterYouControl())))]);
/** Rift's choice and Discover, then a failure after both. */
const failing = fastEvent(0x5c06, () => [], {
  resolve(ctx, item) {
    resolveEffect(ctx, chooseSubtype({ then: discover({ cardType: "character", subtype: CHOSEN_SUBTYPE }, {}, "deckTop") }), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("synthetic chosen-subtype failure after the discovery");
  },
});
/** "This character is that character type" for a source on the stack, not in play. */
const offBoard = fastEvent(0x5c07, () => [], {
  resolve(ctx, item) {
    resolveEffect(ctx, chooseSubtype({ self: true }), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
  },
});
/** Edge's own ability again, resolved for the player's Edge in play: a second choice. */
const rechoose = fastEvent(0x5c08, () => [], {
  resolve(ctx, item) {
    const source = ctx.state.sides[item.controller].backRank.find((id) => {
      const printing = id === null ? undefined : ctx.state.instances[id]?.printing;
      return printing?.kind === "card" && printing.cardId === edge.id;
    });
    if (source === undefined || source === null) throw new Error("no Edge in play");
    resolveEffect(ctx, chooseSubtype({ self: true }), {
      source, origin: instanceOrigin(instanceOf(ctx.state, source)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
  },
});

const allTypes = fastEvent(0x5c09, () => [event(giveAllTypes(all(characterYouControl())))]);
const survivorAnthem = character(0x5c0a, "Survivor", () => [staticAbility(sparkModifier(all(anyCharacter({ subtype: "Survivor" })), 2))]);
function hiddenChoice(index: number, zone: "hand" | "deck") {
  return fastEvent(index, () => [], {
    resolve(ctx, item) {
      const source = ctx.state.sides[item.controller][zone][0];
      if (source === undefined) throw new Error("missing hidden source");
      resolveEffect(ctx, chooseSubtype({ then: gainPoints(1) }), {
        source, origin: instanceOrigin(instanceOf(ctx.state, source)), ability: 0,
        controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
    },
  });
}
const hiddenHand = hiddenChoice(0x5c0b, "hand");
const hiddenDeck = hiddenChoice(0x5c0c, "deck");

const engine = createEngine(testCatalog([edge, rift, mage, survivor, shifter, unmake, failing, offBoard, rechoose, allTypes, survivorAnthem, hiddenHand, hiddenDeck]));
const types = engine.catalog.characterTypes;
const modeOf = (type: CardSubtype): number => {
  const mode = types.indexOf(type);
  if (mode < 0) throw new Error(`${type} is not offered`);
  return mode;
};
const deck = [v.vanilla1.id, mage.id, v.vanilla1.id, survivor.id, mage.id, v.vanilla1.id];
const riftBoard = (enemyHand: readonly CardId[] = []): BoardSetup => ({
  active: "player", phase: "day",
  player: { hand: [rift.id], energy: 3, deck },
  enemy: { hand: enemyHand, energy: 3, deck: [v.vanilla1.id, v.vanilla1.id] },
});
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
}
function opened(board: BoardSetup, records: EngineLogRecord[] = []) {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true, log: (record) => records.push(record) });
  const { state, ids } = boardState(engine.catalog, board);
  const slice = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: board.active, action: playFromHand(ids, board.active).action }));
  return { fold, slice, ids, state };
}
const chosen = (events: readonly EngineEvent[]) => events.filter((event) => event.kind === "subtypeChosen");
const subtypeOf = (state: BattleState, id: InstanceId) => characteristics(state, engine.catalog).of(id).subtype;

describe("chooseSubtype", () => {
  it("sets only the chosen type after all types, and grants all types when that effect is later", () => {
    for (const allTypesLast of [false, true]) {
      const result = runScenario(engine, {
        board: { active: "player", phase: "day", player: { back: [edge.id, survivorAnthem.id], hand: [allTypes.id, rechoose.id], energy: 3, deck }, enemy: { deck } },
        steps: (ids) => (allTypesLast ? [1, 0] : [0, 1]).map((index) => playFromHand(ids, "player", index)),
        answers: () => [modeOf("Mage")],
      });
      const source = result.ids.player.back[0]!;
      expect(characteristics(result.state, engine.catalog).of(source)).toMatchObject({ subtype: "Mage", allTypes: allTypesLast });
      const matching = (subtype: CardSubtype) => matchingCharacters(result.state, engine.catalog, anyCharacter({ subtype }), "player", source);
      expect(matching("Mage")).toContain(source);
      if (allTypesLast) expect(matching("Survivor")).toContain(source);
      else expect(matching("Survivor")).not.toContain(source);
      expect(effectiveSpark(result.state, engine.catalog, source)).toBe(allTypesLast ? 5 : 3);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    }
  });

  it("announces a hidden-zone source's choice to both sides and identifies only a known source", () => {
    for (const side of ["player", "enemy"] as const) {
      for (const zone of ["hand", "deck"] as const) {
        for (const known of [false, true]) {
          const card = zone === "hand" ? hiddenHand : hiddenDeck;
          const { state, ids } = boardState(engine.catalog, {
            active: side, phase: "day", [side]: { hand: [card.id, mage.id], energy: 2, deck },
          });
          const source = ids[side][zone][zone === "hand" ? 1 : 0];
          if (known) for (const viewer of ["player", "enemy"] as const) state.knownTo[viewer].push(source);
          const fold = createFoldAdapter(engine, { checkEventPrefix: true });
          const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side, action: playFromHand(ids, side).action }));
          const prompt = fold.pending(opened)!.prompt;
          const answered = fold.reduce(opened, { kind: "answer", side, promptId: prompt.id, value: modeOf("Mage") });
          const done = applied(answered);
          if (answered.kind !== "applied") throw new Error("expected published answer");
          expect(chosen(answered.published)).toEqual([{ kind: "subtypeChosen", side, source, subtype: "Mage" }]);
          for (const viewer of ["player", "enemy"] as const) {
            expect(eventSeenBy(chosen(answered.published)[0], viewer, done.committed)).toEqual({
              kind: "subtypeChosen", side, subtype: "Mage", source: known || (zone === "hand" && viewer === side) ? source : null,
            });
          }
          expect(done.committed.instances[source]?.zone).toBe(zone);
        }
      }
    }
  });

  it("offers every catalog character type but the untyped placeholders in a public prompt", () => {
    expect(types).toEqual(expect.arrayContaining(["Warrior", "Mage", "Survivor", "Explorer"]));
    expect(types).not.toContain("*");
    expect(types).not.toContain("");
    expect(types).not.toContain(CHOSEN_SUBTYPE);
    expect([...types].sort()).toEqual(types);
    const { fold, slice, ids } = opened(riftBoard());
    const prompt = fold.pending(slice)!.prompt as ChooseModePrompt;
    expect(prompt).toMatchObject({ kind: "chooseMode", side: "player", cancellable: false, purpose: { role: "chooseSubtype", source: ids.player.hand[0], cardId: rift.id } });
    expect(prompt.privateTo).toBeUndefined();
    expect(prompt.subtypes).toEqual(types);
    expect(prompt.options).toEqual(types.map((_type, mode) => ({ mode, legal: true })));
    expect(promptView(prompt, "enemy", fold.pending(slice)!.display)).toEqual(prompt);
  });

  it("announces the type to both sides, then discovers privately among that type and puts the card on top after shuffling", () => {
    const { fold, slice, ids, state } = opened(riftBoard());
    const choice = fold.pending(slice)!.prompt;
    const picking = applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: choice.id, value: modeOf("Mage") }));
    const discovery = fold.pending(picking)!;
    const mages = [ids.player.deck[1], ids.player.deck[4]];
    expect(discovery.prompt).toMatchObject({ kind: "chooseCards", side: "player", privateTo: "player", purpose: { role: "discover" }, min: 1, max: 1 });
    expect([...(discovery.prompt as { candidates: readonly InstanceId[] }).candidates].sort()).toEqual([...mages].sort());
    const done = applied(fold.reduce(picking, { kind: "answer", side: "player", promptId: discovery.prompt.id, value: [mages[1]] }));
    const after = done.committed;
    expect(after.sides.player.deck[0]).toBe(mages[1]);
    expect([...after.sides.player.deck].sort()).toEqual([...ids.player.deck].sort());
    expect(after.sides.player.hand).toEqual([]);
    expect(after.knownTo.player).toContain(mages[1]);
    expect(after.knownTo.enemy).not.toContain(mages[1]);
    const result = runScenario(engine, { board: riftBoard(), steps: (board) => [playFromHand(board, "player")], answers: () => [modeOf("Mage"), [mages[1]]] });
    expect(result.state).toEqual(after);
    const events = result.events;
    expect(events.some((event) => event.kind === "cardDiscovered")).toBe(false);
    for (const viewer of ["player", "enemy"] as const) {
      expect(chosen(events).map((event) => eventSeenBy(event, viewer, after))).toEqual([{ kind: "subtypeChosen", side: "player", source: ids.player.hand[0], subtype: "Mage" }]);
    }
    const placed = events.find((event) => event.kind === "cardsPlaced");
    expect(placed).toMatchObject({ side: "player", to: "deckTop", cards: [mages[1]], from: ["deck"] });
    expect(eventSeenBy(placed!, "enemy", after)).toMatchObject({ cards: [null] });
    expect(eventSeenBy(placed!, "player", after)).toMatchObject({ cards: [mages[1]] });
    expect(invariantViolations(after, engine.catalog)).toEqual([]);
    expect(state.sides.player.deck).toEqual(ids.player.deck);
  });

  it("puts the discovered card on top whatever the shuffle does to the rest", () => {
    for (let padding = 0; padding < 8; padding++) {
      const padded = [...deck, ...Array.from({ length: padding }, () => v.vanilla2.id)];
      const result = runScenario(engine, {
        board: { ...riftBoard(), player: { hand: [rift.id], energy: 3, deck: padded } },
        steps: (ids) => [playFromHand(ids, "player")], answers: (ids) => [modeOf("Mage"), [ids.player.deck[1]]],
      });
      expect(result.state.sides.player.deck[0]).toBe(result.ids.player.deck[1]);
    }
  });

  it("only announces a type no deck character has, and leaves the deck unshuffled", () => {
    const result = runScenario(engine, { board: riftBoard(), steps: (ids) => [playFromHand(ids, "player")], answers: () => [modeOf("Explorer")] });
    expect(chosen(result.events).map((event) => event.subtype)).toEqual(["Explorer"]);
    expect(result.events.some((event) => event.kind === "cardsPlaced")).toBe(false);
    expect(result.state.sides.player.deck).toEqual(result.ids.player.deck);
  });

  it("makes its source the type while in play, gives that type +1✦ on both sides, and none before the choice", () => {
    const board: BoardSetup = {
      active: "player", phase: "day",
      player: { hand: [edge.id, unmake.id], back: [mage.id, shifter.id], energy: 4, deck },
      enemy: { back: [mage.id, survivor.id], deck },
    };
    const { fold, slice, ids } = opened(board);
    const pending = fold.pending(slice)!;
    const source = ids.player.hand[0];
    expect(pending.prompt.purpose).toMatchObject({ role: "chooseSubtype", source });
    // Before the choice the anthem names no type, so the all-types character gains nothing.
    expect(effectiveSpark(pending.display, engine.catalog, ids.player.back[1]!)).toBe(1);
    expect(effectiveSpark(pending.display, engine.catalog, source)).toBe(2);
    const done = applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: modeOf("Mage") }));
    const after = done.committed;
    expect(subtypeOf(after, source)).toBe("Mage");
    expect(after.floating).toEqual([expect.objectContaining({ source, controller: "player", expiry: { at: "sourceLeavesPlay", source }, change: { kind: "subtype", instance: source, subtype: "Mage" } })]);
    expect(effectiveSpark(after, engine.catalog, source)).toBe(3);
    expect(effectiveSpark(after, engine.catalog, ids.player.back[0]!)).toBe(2);
    expect(effectiveSpark(after, engine.catalog, ids.player.back[1]!)).toBe(2);
    expect(effectiveSpark(after, engine.catalog, ids.enemy.back[0]!)).toBe(2);
    expect(effectiveSpark(after, engine.catalog, ids.enemy.back[1]!)).toBe(1);
    // A saved battle holding the type change loads; a malformed one does not.
    const saved = (state: BattleState) => parseJourneyBattleFoldState({
      mode: { kind: "journey" },
      init: { battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
        enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
        avatarSummary: null, cardDefinitions: [] },
      engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(sliceOf(state))) as unknown },
    });
    expect(saved(after)).not.toBeNull();
    const effect = after.floating[0];
    expect(saved({ ...after, floating: [{ ...effect, change: { ...effect.change, subtype: 3 } as unknown as typeof effect.change }] })).toBeNull();
    // Leaving play ends the type and the anthem.
    const unmade = applied(fold.reduce(done, { kind: "battleAction", side: "player", action: playFromHand(ids, "player", 1).action }));
    expect(unmade.committed.instances[source]?.zone).toBe("void");
    expect(unmade.committed.floating).toEqual([]);
    expect(subtypeOf(unmade.committed, source)).toBe("Explorer");
    expect(effectiveSpark(unmade.committed, engine.catalog, ids.enemy.back[0]!)).toBe(1);
    expect(invariantViolations(unmade.committed, engine.catalog)).toEqual([]);
  });

  it("makes no choice when its source has left play before it resolves", () => {
    const result = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [offBoard.id], energy: 1, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(result.answers).toEqual([]);
    expect(chosen(result.events)).toEqual([]);
    expect(result.state.floating).toEqual([]);
  });

  it("follows the latest choice for the source's type and its anthem", () => {
    const result = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [edge.id, rechoose.id], energy: 4, deck }, enemy: { back: [mage.id, survivor.id], deck } },
      steps: (ids) => [playFromHand(ids, "player"), playFromHand(ids, "player", 1)],
      answers: () => [modeOf("Mage"), modeOf("Survivor")],
    });
    const source = result.ids.player.hand[0];
    expect(chosen(result.events).map((event) => event.subtype)).toEqual(["Mage", "Survivor"]);
    expect(subtypeOf(result.state, source)).toBe("Survivor");
    expect(effectiveSpark(result.state, engine.catalog, result.ids.enemy.back[0]!)).toBe(1);
    expect(effectiveSpark(result.state, engine.catalog, result.ids.enemy.back[1]!)).toBe(2);
    expect(effectiveSpark(result.state, engine.catalog, source)).toBe(3);
  });

  it("reloads the type choice, rejects stale, foreign and unoffered answers, and commits exactly once", () => {
    const records: EngineLogRecord[] = [];
    const { fold, slice, ids } = opened(riftBoard(), records);
    const choice = fold.pending(slice)!.prompt;
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.pending(saved)!.prompt).toEqual(choice);
    const answer = (side: Side, value: unknown, at: BattleSlice = saved) =>
      fresh.reduce(at, { kind: "answer", side, promptId: choice.id, value: value as number });
    expect(answer("enemy", modeOf("Mage"))).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    for (const unoffered of [types.length, -1, 0.5, "Mage"]) expect(answer("player", unoffered)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer("player", modeOf("Mage"), { ...saved, attempt: saved.attempt + 1 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(saved, { kind: "cancel", side: "player", promptId: choice.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(fresh.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const reloaded = applied(answer("player", modeOf("Mage")));
    expect(reloaded).toEqual(applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: choice.id, value: modeOf("Mage") })));
    expect(fresh.reduce(reloaded, { kind: "answer", side: "player", promptId: choice.id, value: modeOf("Mage") })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(records).toContainEqual(expect.objectContaining({ event: "engine.promptOpened", side: "player", role: "chooseSubtype", source: ids.player.hand[0], cardId: rift.id }));
  });

  it("chooses only after an opponent's response to the card resolves", () => {
    const { fold, slice, ids } = opened(riftBoard([v.interruptEvent.id]));
    expect(fold.pending(slice)).toBeNull();
    expect(engine.decision(slice.committed)).toEqual({ kind: "respond", side: "enemy" });
    const responded = applied(fold.reduce(slice, { kind: "battleAction", side: "enemy", action: { kind: "play", card: ids.enemy.hand[0], from: "hand" } }));
    let current = responded;
    for (let passes = 0; fold.pending(current) === null && passes < 4; passes++) {
      const decision = engine.decision(current.committed);
      if (decision === null) break;
      current = applied(fold.reduce(current, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }));
    }
    const prompt = fold.pending(current)!.prompt as ChooseModePrompt;
    expect(prompt).toMatchObject({ side: "player", purpose: { role: "chooseSubtype", source: ids.player.hand[0] }, subtypes: types });
    expect(current.committed.instances[ids.enemy.hand[0]]?.zone).toBe("void");
  });

  it("retains the published type announcement when the later discovery fails and rolls gameplay back", () => {
    const board: BoardSetup = { ...riftBoard(), player: { hand: [failing.id], energy: 3, deck } };
    const { fold, slice, ids } = opened(board);
    const choice = fold.pending(slice)!.prompt;
    const announced = fold.reduce(slice, { kind: "answer", side: "player", promptId: choice.id, value: modeOf("Mage") });
    const picking = applied(announced);
    if (announced.kind !== "applied") throw new Error("expected published announcement");
    const published = chosen(announced.published);
    expect(published).toEqual([{ kind: "subtypeChosen", side: "player", source: ids.player.hand[0], subtype: "Mage" }]);
    for (const viewer of ["player", "enemy"] as const) expect(eventSeenBy(published[0], viewer, fold.pending(picking)!.display)).toEqual(published[0]);
    const discovery = fold.pending(picking)!.prompt;
    const failed = fold.reduce(picking, { kind: "answer", side: "player", promptId: discovery.id, value: [ids.player.deck[4]] });
    if (failed.kind !== "applied" || failed.error === null) throw new Error("expected the synthetic failure");
    expect(failed.published).toEqual([]);
    expect(failed.slice.inFlight).toBeNull();
    // The published announcement remains factual; the failed run contributes no new events.
    expect(chosen([...announced.published, ...failed.published])).toEqual(published);
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const reloaded = JSON.parse(JSON.stringify(picking)) as BattleSlice;
    expect(fresh.pending(reloaded)!.prompt).toEqual(discovery);
    const replayed = fresh.reduce(reloaded, { kind: "answer", side: "player", promptId: discovery.id, value: [ids.player.deck[4]] });
    expect(replayed).toEqual(failed);
    // Published private discovery knowledge also survives at the recovered boundary.
    const committed = failed.slice.committed;
    expect({ ...committed, knownTo: picking.committed.knownTo }).toEqual(picking.committed);
    expect(committed.knownTo.enemy).toEqual(picking.committed.knownTo.enemy);
    expect(committed.sides.player.deck).toEqual(ids.player.deck);
    expect(committed.floating).toEqual([]);
  });

  it("has Greedy name the offered type it has most characters of in play and in its deck, the first offered on a tie", () => {
    const { fold, slice } = opened(riftBoard());
    const prompt = fold.pending(slice)!.prompt as ChooseModePrompt;
    const { state } = boardState(engine.catalog, {
      active: "player", phase: "day",
      player: { back: [survivor.id, survivor.id], deck: [mage.id, mage.id, mage.id, v.vanilla1.id] },
      enemy: { back: [mage.id, mage.id], deck },
    });
    const answer = (at: BattleState) => greedyAnswer(prompt, () => null, () => new Set(), 0, stateSubtypeCounts(at, engine.catalog));
    expect(answer(state)).toBe(modeOf("Mage"));
    const tied = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [survivor.id], deck: [mage.id] }, enemy: { deck } }).state;
    expect(answer(tied)).toBe(Math.min(modeOf("Mage"), modeOf("Survivor")));
    const empty = boardState(engine.catalog, { active: "player", phase: "day", player: { deck: [] }, enemy: { deck } }).state;
    expect(answer(empty)).toBe(0);
  });
});
