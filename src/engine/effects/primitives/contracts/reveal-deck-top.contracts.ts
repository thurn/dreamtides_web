import type { EngineEvent } from "../../../events";
import { describe, expect, it } from "vitest";
import { addFloating, endFloating } from "../../../rules/floating";
import { forgetShuffledDeck } from "../../../view/knowledge";
import { resolveEffect } from "../../interpreter";
import { instanceOrigin } from "../../../rules/activation";
import { ScriptedSource } from "../../../steps/sources";
import { loseAllAbilities } from "../lose-all-abilities";
import { foresee } from "../foresee";
import { shuffleInto } from "../shuffle-into";
import { cloneState } from "../../../state/clone";
import { battleSeed, SIDES } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { Context } from "../../../steps/context";
import { NO_PROMPTS } from "../../../steps/sources";
import { drawCard, erodeCard } from "../../../rules/resources";
import { enterPlay, moveToHand } from "../../../rules/zones";
import { revealToBoth } from "../../../view/knowledge";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { boardState } from "../../../testing/board";
import { createEngine } from "../../../engine";
import { conditionCardCounts, staticAbility } from "../../../dsl/builders";
import { parseAvatarId } from "../../../../types/identifiers";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { triggered, whenDraw } from "../../../dsl/triggers";
import { gainPoints } from "../gain-points";
import { revealDeckTop } from "../reveal-deck-top";
import { DECK_TOP, DECK_TOP_CARDS, engine, placed, v } from "./deck-top-support";

describe("revealDeckTop", () => {
  it.each(SIDES)("reveals only the current %s top in setup, with immediate pure view and legal play", (side) => {
    const setup = placed({ active: side, [side]: { back: [DECK_TOP.keeper.id, v.vanilla1.id, v.vanilla2.id], deck: [v.vanilla1.id, v.vanilla2.id], energy: 5 } });
    const before = cloneState(setup.state);
    for (const viewer of SIDES) expect(engine.view(setup.state, viewer).sides[side].deck.known).toEqual([{ id: setup.ids[side].deck[0], index: 0 }]);
    expect(engine.legalActions(setup.state, side)).toContainEqual({ kind: "play", card: setup.ids[side].deck[0], from: "deck" });
    expect(setup.state).toEqual(before);
    expect(setup.events).toContainEqual({ kind: "revealed", side, zone: "deck", instances: [setup.ids[side].deck[0]] });
  });

  it("reveals an initial emblem's remaining top at the first decision, after dealing", () => {
    const avatar = parseAvatarId("00000000-0000-4000-8000-000000051501");
    const initial = createEngine(testCatalog(DECK_TOP_CARDS, { avatars: [{ id: avatar, status: "authored", abilities: () => [staticAbility(revealDeckTop())] }] }));
    const result = initial.createBattle({ seed: battleSeed("initial-top"), scoreToWin: 25, decks: {
      player: Array.from({ length: 12 }, () => ({ cardId: v.vanilla1.id })), enemy: Array.from({ length: 12 }, () => ({ cardId: v.vanilla2.id })),
    }, dreamwell: [], avatars: { player: avatar } }, NO_PROMPTS);
    const revealed = result.events.filter((event) => event.kind === "revealed");
    expect(revealed).toEqual([{ kind: "revealed", side: "player", zone: "deck", instances: [result.state.sides.player.deck[0]] }]);
    expect(initial.view(result.state, "enemy").sides.player.hand.known).toEqual([]);
  });

  it.each(["draw", "erode"] as const)("announces each %s before its next-top reveal, with bounded observer knowledge", (kind) => {
    const { state, ids } = placed();
    const seen: { kind: EngineEvent["kind"]; state: BattleState }[] = [];
    const ctx = new Context(cloneState(state), engine.catalog, NO_PROMPTS, { observeEvent: (event, snapshot) => seen.push({ kind: event.kind, state: snapshot() }) });
    const remove = kind === "draw" ? drawCard : erodeCard;
    remove(ctx, "player"); remove(ctx, "player");
    const causal = kind === "draw" ? "cardDrawn" : "eroded";
    expect(ctx.events.map((event) => event.kind)).toEqual(kind === "draw"
      ? [causal, "revealed", causal, "revealed"]
      : ["enteredVoid", causal, "revealed", "enteredVoid", causal, "revealed"]);
    const first = seen.find((event) => event.kind === causal)!;
    const reveal = seen.find((event) => event.kind === "revealed")!;
    expect(engine.view(first.state, "enemy").sides.player.deck.known).toEqual([]);
    expect(engine.view(reveal.state, "enemy").sides.player.deck.known).toEqual([{ id: ids.player.deck[1], index: 0 }]);
    expect(reveal.state.sides).toEqual(first.state.sides);
    expect(reveal.state.instances).toEqual(first.state.instances);
    expect(invariantViolations(ctx.state, engine.catalog)).toEqual([]);
  });

  it("materializes a source before revealing and retains learned tops when the condition ends", () => {
    const { state, ids } = placed({ player: { hand: [DECK_TOP.revealer.id], deck: [v.vanilla1.id, v.vanilla2.id] } });
    const ctx = new Context(state, engine.catalog, NO_PROMPTS);
    enterPlay(ctx, ids.player.hand[0], "player", { rank: "back", index: 0 });
    expect(ctx.events.map((event) => event.kind)).toEqual(["handEmptied", "materialized", "revealed"]);
    moveToHand(ctx, ids.player.hand[0], "player");
    ctx.completeDeckTopReveals();
    expect(engine.view(cloneState(state), "enemy").sides.player.deck.known).toEqual([{ id: ids.player.deck[0], index: 0 }]);
    drawCard(ctx, "player");
    expect(engine.view(cloneState(state), "enemy").sides.player.deck.known).toEqual([]);
  });

  it("preserves the public top through private disclosure without duplicating revelation or exposing deeper cards", () => {
    const { state, ids } = placed();
    const ctx = new Context(state, engine.catalog, NO_PROMPTS);
    ctx.disclose("player", ids.player.deck.slice(0, 2));
    expect(ctx.events).toEqual([]);
    expect(engine.view(cloneState(state), "enemy").sides.player.deck.known).toEqual([{ id: ids.player.deck[0], index: 0 }]);
    expect(engine.view(state, "player").sides.player.deck.known).toHaveLength(2);
  });

  it("rebuilds identical observable views and legal moves from either side's known top", () => {
    const { state } = placed();
    const list = (side: "player" | "enemy") => Object.values(state.instances).filter((card) => card.owner === side).map((card) => ({ cardId: card.printing.kind === "card" ? card.printing.cardId : v.vanilla1.id }));
    expect(determinizationDivergences(engine, state, { player: list("player"), enemy: list("enemy") }, battleSeed("deck-top-fidelity"), 0)).toEqual([]);
  });

  it("matches every causal trigger sibling before a newly active reveal, preserving hidden subjects", () => {
    const watcher = { ...DECK_TOP.revealer, id: syntheticId(0x51520), abilities: () => [
      triggered(whenDraw(), gainPoints(0)), staticAbility(revealDeckTop(), { while: conditionCardCounts("hand", 1) }),
    ] };
    const enemyWatcher = { ...watcher, id: syntheticId(0x51521), abilities: () => [triggered(whenDraw("opponent"), gainPoints(0))] };
    const nested = createEngine(testCatalog([watcher, enemyWatcher]));
    const { state, ids } = boardState(nested.catalog, { active: "player", phase: "day", player: { back: [watcher.id], deck: [v.vanilla1.id, v.vanilla2.id] }, enemy: { back: [enemyWatcher.id] } });
    const snapshots: BattleState[] = [];
    const ctx = new Context(state, nested.catalog, NO_PROMPTS, { observeEvent: (_event, snapshot) => snapshots.push(snapshot()) });
    drawCard(ctx, "player");
    expect(ctx.events.map((event) => event.kind)).toEqual(["cardDrawn", "triggerQueued", "triggerQueued", "revealed"]);
    expect(state.triggerQueue).toHaveLength(2);
    for (const queued of state.triggerQueue) expect(queued.subjectHiddenFrom).toEqual(["enemy"]);
    for (const prefix of snapshots.slice(0, 3)) expect(nested.view(prefix, "enemy").sides.player.deck.known).toEqual([]);
    expect(nested.view(snapshots[3], "enemy").sides.player.deck.known).toEqual([{ id: ids.player.deck[1], index: 0 }]);
  });

  it.each(SIDES)("tracks %s base and amplified thresholds separately across condition changes", (side) => {
    for (const amplified of [false, true]) {
      const threshold = amplified ? 2 : 3;
      const { state, ids } = placed({ active: side, [side]: { hand: [{ cardId: DECK_TOP.keeper.id, amplified }],
        back: Array.from({ length: threshold - 1 }, () => v.vanilla1.id), deck: [v.vanilla1.id, v.vanilla2.id], energy: 5 } });
      const played = engine.apply(state, side, { kind: "play", from: "hand", card: ids[side].hand[0] }, NO_PROMPTS);
      let next = played.state;
      while (next.stack.length > 0) next = engine.apply(next, engine.decision(next)!.side, { kind: "pass" }, NO_PROMPTS).state;
      expect(engine.view(next, "player").sides[side].deck.known).toEqual([{ id: ids[side].deck[0], index: 0 }]);
      const ctx = new Context(cloneState(next), engine.catalog, NO_PROMPTS);
      moveToHand(ctx, ids[side].back[0]!, side);
      drawCard(ctx, side);
      expect(engine.view(cloneState(ctx.state), "player").sides[side].deck.known).toEqual([]);
      enterPlay(ctx, ids[side].back[0]!, side, { rank: "back", index: 0 });
      expect(ctx.events[ctx.events.length - 1]).toEqual({ kind: "revealed", side, zone: "deck", instances: [ids[side].deck[1]] });
    }
  });

  it("keeps an already-public top visible at a private arrange prompt, but reveals only its new top after reordering", () => {
    const { state, ids } = placed();
    const order = [{ card: ids.player.deck[1], to: "top" as const }, { card: ids.player.deck[0], to: "top" as const }];
    const ctx = new Context(state, engine.catalog, new ScriptedSource([order]));
    const source = ids.player.back[0]!;
    const effect = foresee(2);
    resolveEffect(ctx, effect, { source, origin: instanceOrigin(state.instances[source]), ability: 3, controller: "player", x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
    expect(ctx.events.map((event) => event.kind)).toEqual(["foresaw", "revealed"]);
    expect(engine.view(ctx.state, "enemy").sides.player.deck.known).toEqual([{ id: ids.player.deck[1], index: 0 }]);
    expect(engine.view(cloneState(ctx.state), "player").sides.player.deck.known).toHaveLength(2);
  });

  it("refreshes a shuffled active deck after its shuffle announcement, revealing no deeper identity", () => {
    const { state, ids } = placed();
    const ctx = new Context(state, engine.catalog, NO_PROMPTS);
    const source = ids.player.back[0]!;
    resolveEffect(ctx, shuffleInto(), { source, origin: instanceOrigin(state.instances[source]), ability: 0, controller: "player", x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
    expect(ctx.events.map((event) => event.kind)).toEqual(["shuffledIntoDeck", "revealed"]);
    expect(engine.view(ctx.state, "enemy").sides.player.deck.known).toEqual([{ id: ctx.state.sides.player.deck[0], index: 0 }]);
  });

  it("does not disclose a top when a departing source regains its lost abilities before detach", () => {
    const { state, ids } = placed({ player: { back: [DECK_TOP.revealer.id], deck: [v.vanilla1.id, v.vanilla2.id] } });
    const source = ids.player.back[0]!;
    const ctx = new Context(state, engine.catalog, NO_PROMPTS);
    addFloating(ctx, { controller: "player", source, expiry: { at: "endOfTurn" }, change: { kind: "loseAbilities", instance: source } });
    forgetShuffledDeck(state, state.sides.player.deck);
    const start = ctx.events.length;
    moveToHand(ctx, source, "player");
    ctx.emit({ kind: "returnedToHand", side: "player", instance: source });
    ctx.completeDeckTopReveals();
    expect(ctx.events.slice(start).map((event) => event.kind)).toEqual(["leftPlay", "effectEnded", "returnedToHand"]);
    expect(engine.view(state, "enemy").sides.player.deck.known).toEqual([]);
  });

  it("losing a source's abilities stops fresh revelation, while standalone expiry restores it", () => {
    const { state, ids } = placed({ player: { back: [DECK_TOP.revealer.id], deck: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] } });
    const source = ids.player.back[0]!;
    const ctx = new Context(state, engine.catalog, NO_PROMPTS);
    resolveEffect(ctx, loseAllAbilities({ kind: "self" }), { source, origin: instanceOrigin(state.instances[source]), ability: 0, controller: "player", x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
    drawCard(ctx, "player");
    expect(engine.view(cloneState(state), "enemy").sides.player.deck.known).toEqual([]);
    const start = ctx.events.length;
    endFloating(ctx, () => true);
    expect(ctx.events.slice(start).map((event) => event.kind)).toEqual(["effectEnded", "revealed"]);
  });

  it("handles an empty deck and grants no new knowledge from an inactive condition", () => {
    const empty = placed({ player: { back: [DECK_TOP.revealer.id], deck: [] } });
    expect(empty.events).toEqual([]);
    const hidden = placed({ player: { back: [DECK_TOP.keeper.id], deck: [v.vanilla1.id, v.vanilla2.id], energy: 5 } });
    expect(hidden.state.knownTo).toEqual({ player: [], enemy: [] });
    revealToBoth(hidden.state, [hidden.ids.player.deck[0]]);
    expect(engine.legalActions(hidden.state, "player")).toContainEqual({ kind: "play", from: "deck", card: hidden.ids.player.deck[0] });
  });
});
