/**
 * What each side knows: private prompts, disclosures and their recovery,
 * reveals, prompt views across sides, and the event redaction invariant.
 */
import { describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import type { EngineEvent } from "../events";
import { battleSeed } from "../state/ids";
import type { BattleState } from "../state/types";
import { InlineSource, NO_PROMPTS, ScriptedSource } from "../steps/sources";
import { boardState, cardIdOf } from "../testing/board";
import { DREAMSIGN, STACK } from "../testing/stack-cards";
import { eventRedactionViolations, strings } from "../testing/redaction";
import type { ArrangeAnswer, Prompt } from "../prompts/types";
import { PolicyRandom } from "../policy/random";
import { cloneState } from "../state/clone";
import { determinize } from "./determinize";
import { keepDisclosures, showPrivately } from "./knowledge";
import { promptView, view } from "./view";
import { catalog, v, p, fixture } from "./view.fixtures";

describe("knowledge", () => {
  /** The player holds Foresee 2 over a three-card deck; the enemy cannot respond. */
  function foreseeBoard() {
    return boardState(catalog, {
      active: "player",
      phase: "day",
      player: { hand: [p.foresee.id], deck: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] },
      enemy: { deck: [v.vanilla5.id] },
    });
  }

  it("shows the cards of a privateTo prompt to its chooser only, who keeps knowing where they went", () => {
    const { state, ids } = foreseeBoard();
    const [top, second] = ids.player.deck;
    const engine = createEngine(catalog);
    let checked = false;
    const source = new InlineSource({
      player: (prompt: Prompt, work: BattleState): ArrangeAnswer => {
        expect(view(work, "player", catalog).sides.player.deck.known).toEqual([{ id: top, index: 0 }, { id: second, index: 1 }]);
        expect(view(work, "enemy", catalog).sides.player.deck.known).toEqual([]);
        expect(promptView(prompt, "player", work)).toEqual(prompt);
        const redacted = strings(promptView(prompt, "enemy", work));
        expect(redacted.has(top) || redacted.has(second)).toBe(false);
        expect(strings(view(work, "enemy", catalog)).has(top)).toBe(false);
        checked = true;
        return [{ card: top, to: "top" }, { card: second, to: "void" }];
      },
      enemy: () => {
        throw new Error("the enemy has no prompt");
      },
    });
    const { state: after } = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, source);
    expect(checked).toBe(true);
    expect(after.sides.player.void).toContain(second);
    expect(view(after, "player", catalog).sides.player.deck.known).toEqual([{ id: top, index: 0 }]);
    expect(view(after, "enemy", catalog).sides.player.deck.known).toEqual([]);
    // A determinization keeps the known card where the chooser put it.
    const random = new PolicyRandom(battleSeed("knowledge-determinize"));
    const decklists = { player: [p.foresee.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id].map((cardId) => ({ cardId })), enemy: [{ cardId: v.vanilla5.id }] };
    const sampled = determinize(view(after, "player", catalog), decklists, () => random.next(), catalog);
    expect(sampled.sides.player.deck[0]).toBe(top);
    expect(sampled.instances[top]?.printing).toEqual(after.instances[top]?.printing);
  });

  it("makes the other side lose track of deck cards a privateTo prompt shows the chooser", () => {
    const { state, ids } = foreseeBoard();
    const [top, second] = ids.player.deck;
    state.knownTo.enemy = [top];
    expect(view(state, "enemy", catalog).sides.player.deck.known).toEqual([{ id: top, index: 0 }]);
    const engine = createEngine(catalog);
    const { state: after } = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([[{ card: second, to: "top" }, { card: top, to: "top" }]]));
    expect(after.sides.player.deck.slice(0, 2)).toEqual([second, top]);
    expect(view(after, "enemy", catalog).sides.player.deck.known).toEqual([]);
    expect(view(after, "player", catalog).sides.player.deck.known).toEqual([{ id: second, index: 0 }, { id: top, index: 1 }]);
  });

  it("keeps a disclosure on recovery only for cards still known where they sit, leaving the other side's knowledge alone", () => {
    const { state: committed, ids } = foreseeBoard();
    const [top, second, third] = ids.player.deck;
    committed.knownTo.enemy = [top];
    const display = cloneState(committed);
    showPrivately(display, "player", [top, second, third]);
    // `second` left the deck and came back within the step; the step's knowledge of `third` ended before it published.
    display.instances[second] = { ...display.instances[second], enteredZoneAt: display.instances[second].enteredZoneAt + 1 };
    display.knownTo.player = display.knownTo.player.filter((id) => id !== third);
    const disclosed = [{ side: "player" as const, cards: [top, second, third] }];
    const kept = keepDisclosures(committed, display, disclosed);
    expect(kept).toEqual({ ...committed, knownTo: { player: [top], enemy: [top] } });
    expect(committed.knownTo.player).toEqual([]);
    expect(keepDisclosures(kept, display, disclosed)).toBe(kept);
    expect(keepDisclosures(committed, display, [])).toBe(committed);
  });

  it("makes a card revealed from a hand known to both sides while it stays there", () => {
    const { state, ids } = boardState(catalog, {
      active: "player",
      phase: "day",
      player: { back: [STACK.revealWarrior.id], hand: [v.event1.id, v.vanilla1.id], deck: [v.vanilla2.id] },
      enemy: { hand: [v.interruptEvent.id], energy: 5, deck: [v.vanilla2.id] },
    });
    const warrior = ids.player.hand[1];
    expect(view(state, "enemy", catalog).sides.player.hand.known).toEqual([]);
    const { state: after } = createEngine(catalog).apply(state, "player", { kind: "activate", source: ids.player.back[0]!, ability: 0 }, NO_PROMPTS);
    expect(view(after, "enemy", catalog).sides.player.hand.known).toEqual([{ id: warrior, index: 1 }]);
    expect(view(after, "enemy", catalog).instances[warrior]).toMatchObject({ zone: "hand", controller: "player" });
    expect(strings(view(after, "enemy", catalog)).has(ids.player.hand[0])).toBe(false);
  });

  it("hides the cards and source of another side's prompt that the viewer cannot identify", () => {
    const { state } = fixture();
    const [first, second] = state.sides.enemy.hand;
    const prompt: Prompt = {
      kind: "chooseCards",
      side: "enemy",
      purpose: { source: first, cardId: cardIdOf(state, first), ability: 0, role: "discard" },
      cancellable: false,
      candidates: [first, second],
      min: 1,
      max: 1,
    };
    expect(promptView(prompt, "enemy", state)).toEqual(prompt);
    expect(promptView(prompt, "player", state)).toEqual({ ...prompt, purpose: { ...prompt.purpose, source: null, cardId: null }, candidates: [] });
    state.knownTo.player = [second];
    expect(promptView(prompt, "player", state)).toMatchObject({ candidates: [second] });
  });

  it("shows every viewer the emblem whose ability raised another side's prompt", () => {
    const { state } = fixture();
    const [first, second] = state.sides.enemy.hand;
    const prompt: Prompt = {
      kind: "chooseCards",
      side: "enemy",
      purpose: { source: { kind: "dreamsign", side: "enemy", index: 0, id: DREAMSIGN.points.id }, cardId: null, ability: 0, role: "discard" },
      cancellable: false,
      candidates: [first, second],
      min: 1,
      max: 1,
    };
    expect(promptView(prompt, "player", state)).toEqual({ ...prompt, candidates: [] });
  });
});

describe("event redaction invariant", () => {
  it("fails on an event a side may see that names a card hidden from it, and passes private or redacted ones", () => {
    const { state, ids } = fixture();
    const hidden = ids.enemy.hand[0];
    const shown = ids.player.front[0];
    if (hidden === undefined || shown === null) throw new Error("fixture lacks an enemy hand card or a player front card");
    const leakedInstance: EngineEvent = { kind: "discarded", side: "enemy", instance: hidden };
    const leakedCard: EngineEvent = { kind: "pendingAbility", side: "enemy", cardId: cardIdOf(state, hidden), instance: null, reason: "played" };
    for (const leak of [leakedInstance, leakedCard]) {
      const violations = eventRedactionViolations([leak], state, state);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain(leak.kind === "discarded" ? hidden : cardIdOf(state, hidden));
    }
    const drawn: EngineEvent = { kind: "cardDrawn", side: "enemy", instance: hidden };
    const queued: EngineEvent = { kind: "triggerQueued", source: shown, controller: "player", ability: 0, node: null, subject: hidden, subjectHiddenFrom: ["player"] };
    expect(strings(queued).has(hidden)).toBe(true);
    expect(eventRedactionViolations([drawn, queued], state, state)).toEqual([]);
  });
});
