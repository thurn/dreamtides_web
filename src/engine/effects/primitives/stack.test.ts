/** Stack primitives: prevent, its "unless the opponent pays" prompt and destinations; "cannot be prevented". */
import { describe, expect, it } from "vitest";
import { stackItem } from "../../dsl/builders";
import { matchingStackItems } from "../../dsl/selectors";
import { createEngine } from "../../engine";
import type { Answer } from "../../prompts/types";
import type { CardId, InstanceId, Side } from "../../state/ids";
import type { BattleState } from "../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../steps/sources";
import { boardState } from "../../testing/board";
import { DSL, DSL_CARDS } from "../../testing/dsl-cards";
import { invariantViolations } from "../../testing/invariants";
import { STACK, STACK_CARDS, SYNTHETIC_EMBLEMS } from "../../testing/stack-cards";
import { SYNTHETIC, testCatalog } from "../../testing/synthetic-cards";

const engine = createEngine(testCatalog([...DSL_CARDS, ...STACK_CARDS], SYNTHETIC_EMBLEMS));
const v = SYNTHETIC;
const deck = [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id];

/** The player plays its first hand card; the enemy answers with its first hand card. */
function playAndAnswer(player: CardId, enemy: CardId, answers: readonly Answer[] = [], setup: (state: BattleState, played: InstanceId) => void = () => {}) {
  const { state: start, ids } = boardState(engine.catalog, {
    active: "player",
    phase: "day",
    player: { hand: [player], energy: 3, deck },
    enemy: { hand: [enemy], energy: 3, deck },
  });
  const played = ids.player.hand[0];
  setup(start, played);
  const source = new ScriptedSource(answers);
  const first = engine.apply(start, "player", { kind: "play", card: played, from: "hand" }, source);
  const second = engine.apply(first.state, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, source);
  source.assertExhausted();
  expect(invariantViolations(second.state, engine.catalog)).toEqual([]);
  return { start, state: second.state, events: second.events, played, ids };
}

describe("prevent", () => {
  it("sends a prevented event to its owner's void without resolving it", () => {
    const { state, events, played } = playAndAnswer(DSL.drawTwo.id, STACK.preventEvent.id);
    expect(events).toContainEqual({ kind: "prevented", instance: played, side: "player", to: "void" });
    expect(events.some((event) => event.kind === "resolved" && event.instance === played)).toBe(false);
    expect(state.sides.player.void).toEqual([played]);
    expect(state.sides.player.hand).toEqual([]);
    expect(state.stack).toEqual([]);
  });

  it("puts a prevented character on top of its owner's deck, or a prevented card into its owner's hand", () => {
    const deckTop = playAndAnswer(v.vanilla1.id, STACK.preventCharacterToDeck.id);
    expect(deckTop.state.sides.player.deck[0]).toBe(deckTop.played);
    expect(deckTop.state.sides.player.backRank.every((slot) => slot === null)).toBe(true);
    const hand = playAndAnswer(DSL.drawTwo.id, STACK.preventToHand.id);
    expect(hand.state.sides.player.hand).toEqual([hand.played]);
  });

  it("lets the opponent pay to keep the card, or decline and lose it", () => {
    const paid = playAndAnswer(DSL.drawTwo.id, STACK.preventUnlessPays.id, [true]);
    expect(paid.state.sides.player.currentEnergy).toBe(0);
    expect(paid.state.sides.player.hand).toHaveLength(2);
    expect(paid.state.sides.player.void).toEqual([paid.played]);
    expect(paid.events.some((event) => event.kind === "prevented")).toBe(false);
    const declined = playAndAnswer(DSL.drawTwo.id, STACK.preventUnlessPays.id, [false]);
    expect(declined.state.sides.player.currentEnergy).toBe(2);
    expect(declined.state.sides.player.hand).toEqual([]);
    // Unable to pay, the opponent declines automatically.
    const broke = playAndAnswer(DSL.drawTwo.id, STACK.preventUnlessPays.id, [], (state) => {
      state.sides.player.currentEnergy = 1;
    });
    expect(broke.state.sides.player.hand).toEqual([]);
  });

  it("makes a prevented created card cease to exist and banishes a prevented reclaimed card", () => {
    const created = playAndAnswer(DSL.drawTwo.id, STACK.preventToHand.id, [], (state, played) => {
      state.instances[played].status.created = true;
    });
    expect(created.state.instances[created.played]).toBeUndefined();
    expect(created.events).toContainEqual({ kind: "prevented", instance: created.played, side: "player", to: null });
    expect(created.events).toContainEqual({ kind: "ceasedToExist", instance: created.played });
    expect(created.state.sides.player.hand).toEqual([]);
    expect(created.state.sides.player.void).toEqual([]);

    const reclaimed = playAndAnswer(DSL.drawTwo.id, STACK.preventToHand.id, [], (state, played) => {
      state.instances[played].status.reclaimed = true;
    });
    expect(reclaimed.state.sides.player.banished).toEqual([reclaimed.played]);
    expect(reclaimed.state.sides.player.hand).toEqual([]);
  });

  it("cannot target a card that cannot be prevented, so it offers no response", () => {
    const { state: start, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [STACK.unpreventableDraw.id], energy: 1, deck },
      enemy: { hand: [STACK.preventEvent.id], energy: 3, deck },
    });
    const { state } = engine.apply(start, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(state.stack).toEqual([]);
    expect(state.sides.player.hand).toHaveLength(1);
    expect(state.sides.enemy.hand).toEqual(ids.enemy.hand);
  });

  it("matches stack cards by controller and card type, never activated abilities", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [v.event1.id], back: [STACK.fastPump.id], deck },
      enemy: { hand: [v.vanilla1.id], deck },
    });
    const put = (id: InstanceId, controller: Side) => {
      state.sides[controller].hand = [];
      state.instances[id].zone = "stack";
      state.stack.push({ kind: "card", instance: id, controller, targets: [], x: null });
    };
    const event = ids.player.hand[0];
    const character = ids.enemy.hand[0];
    put(event, "player");
    put(character, "enemy");
    state.stack.push({ kind: "ability", source: ids.player.back[0]!, ability: 0, origin: { kind: "card", cardId: STACK.fastPump.id, variant: { amplified: false } }, controller: "player", targets: [], x: null });
    const match = (selector: ReturnType<typeof stackItem>) => matchingStackItems(state, engine.catalog, selector, "player", "i999");
    expect(match(stackItem())).toEqual([character, event]);
    expect(match(stackItem({ controller: "opponent" }))).toEqual([character]);
    expect(match(stackItem({ controller: "you" }))).toEqual([event]);
    expect(match(stackItem({ cardType: "event" }))).toEqual([event]);
    expect(matchingStackItems(state, engine.catalog, stackItem(), "player", event)).toEqual([character]);
  });

  it("does nothing and reports noLegalTarget when its target left the stack", () => {
    const { state: start, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.drawTwo.id], deck },
      enemy: { hand: [STACK.preventEvent.id, STACK.preventEvent.id], deck },
    });
    const target = ids.player.hand[0];
    const [first, second] = ids.enemy.hand;
    for (const [id, controller, targets] of [[target, "player", []], [first, "enemy", [[target]]], [second, "enemy", [[target]]]] as const) {
      const owner = start.instances[id].owner;
      start.sides[owner].hand = start.sides[owner].hand.filter((card) => card !== id);
      start.instances[id].zone = "stack";
      start.instances[id].controller = controller;
      start.stack.push({ kind: "card", instance: id, controller, targets: targets.map((list) => [...list]), x: null });
    }
    start.priority = "player";
    const { state, events } = engine.apply(start, "player", { kind: "pass" }, NO_PROMPTS);
    expect(events.filter((event) => event.kind === "prevented")).toHaveLength(1);
    expect(events).toContainEqual({ kind: "noLegalTarget", source: first });
    expect(state.stack).toEqual([]);
    expect(state.sides.player.void).toEqual([target]);
  });
});
