import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import type { ChooseCardsPrompt } from "../../../prompts/types";
import { event } from "../../../dsl/builders";
import type { PlayerRef } from "../../../dsl/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { boardState } from "../../../testing/board";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { discover } from "../discover";
import { draw } from "../draw";
import { reveal } from "../reveal";
import { sequence } from "../sequence";
import { v, deck } from "./cards-support";

/** Discovers a character, then throws: a step that fails after its Discover's answer was accepted. */
const discoverThenFail: EngineCardDefinition = {
  id: syntheticId(920),
  cardType: "event",
  costs: [],
  spark: null,
  subtype: "",
  speed: "standard",
  status: "authored",
  abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, discover({ cardType: "character" }), {
        source: item.instance,
        origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0,
        controller: item.controller,
        x: null,
        optionalPaid: [],
        choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its discovery");
    },
  },
};

/** Synthetic reveal-and-draw composition; repeated UUIDs in a hand are distinct instances. */
const revealingCard = (player: PlayerRef): EngineCardDefinition => ({
  id: syntheticId(player === "you" ? 930 : 931),
  cardType: "event",
  costs: [],
  spark: null,
  subtype: "",
  speed: "standard",
  status: "authored",
  abilities: () => [event(sequence(reveal(player), draw(1, player, { ephemeral: true })))],
});

const revealThenDiscover: EngineCardDefinition = {
  ...revealingCard("opponent"),
  id: syntheticId(932),
  abilities: () => [event(sequence(reveal("opponent"), discover({ cardType: "character" })))],
};

const revealThenFail: EngineCardDefinition = {
  ...discoverThenFail,
  id: syntheticId(933),
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, reveal("opponent"), {
        source: item.instance,
        origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0,
        controller: item.controller,
        x: null,
        optionalPaid: [],
        choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its reveal");
    },
  },
};

describe("reveal", () => {
  const cards = [revealingCard("you"), revealingCard("opponent"), revealThenDiscover, revealThenFail];
  const revealing = createEngine(testCatalog(cards));
  const applied = (outcome: IntentOutcome): BattleSlice => {
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected an applied intent");
    return outcome.slice;
  };

  it("reveals either player's entire hand in position order, without moving cards or exposing later draws", () => {
    for (const player of ["you", "opponent"] as const) {
      const side = player === "you" ? "player" : "enemy";
      const observer = player === "you" ? "enemy" : "player";
      const card = revealingCard(player);
      const result = runScenario(revealing, {
        board: {
          active: "player", phase: "day",
          player: { hand: [card.id, v.vanilla1.id, v.vanilla1.id], deck },
          enemy: { hand: [v.vanilla1.id, v.vanilla1.id], deck },
        },
        steps: (ids) => [playFromHand(ids, "player")],
      });
      const hand = side === "player" ? result.ids.player.hand.slice(1) : result.ids.enemy.hand;
      expect(view(result.start, observer, revealing.catalog).sides[side].hand.known).toEqual([]);
      expect(result.state.sides[side].hand).toEqual([...hand, result.ids[side].deck[0]]);
      const seen = view(result.state, observer, revealing.catalog);
      expect(seen.sides[side].hand.known).toEqual(hand.map((id, index) => ({ id, index })));
      for (const id of hand) expect(seen.instances[id]).toMatchObject({ zone: "hand", printing: { cardId: v.vanilla1.id } });
      expect(seen.instances[result.ids[side].deck[0]]).toBeUndefined();
      const published = { kind: "revealed", side, instances: hand } as const;
      expect(result.events.filter((item) => item.kind === "revealed")).toEqual([published]);
      for (const viewer of ["player", "enemy"] as const) expect(eventSeenBy(published, viewer, result.state)).toEqual(published);
      expect(result.answers).toEqual([]);
    }
  });

  it("reveals an empty hand without a prompt and continues the sequence", () => {
    const result = runScenario(revealing, {
      board: { active: "player", phase: "day", player: { hand: [cards[1].id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(result.events.some((item) => item.kind === "revealed")).toBe(false);
    expect(result.state.sides.enemy.hand).toEqual([result.ids.enemy.deck[0]]);
    expect(result.answers).toEqual([]);
  });

  it("reads the hand at resolution after an opponent response draws a card", () => {
    const response: EngineCardDefinition = { ...DSL.drawTwo, id: syntheticId(934), speed: "interrupt" };
    const combined = createEngine(testCatalog([...cards, response]));
    const result = runScenario(combined, {
      board: {
        active: "player", phase: "day",
        player: { hand: [cards[1].id], deck },
        enemy: { hand: [response.id], energy: 1, deck },
      },
      steps: (ids) => [playFromHand(ids, "player"), playFromHand(ids, "enemy"), { side: "player", action: { kind: "pass" } }, { side: "enemy", action: { kind: "pass" } }],
    });
    expect(result.events.filter((item) => item.kind === "revealed")).toEqual([{ kind: "revealed", side: "enemy", instances: result.ids.enemy.deck.slice(0, 2) }]);
  });

  it("replays a reveal before a suspended choice after reload, rejects foreign/stale input, and publishes one reveal", () => {
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(revealing, { checkEventPrefix: true, log: (record) => records.push(record) });
    const { state, ids } = boardState(revealing.catalog, {
      active: "player", phase: "day",
      player: { hand: [revealThenDiscover.id], deck }, enemy: { hand: [v.vanilla1.id], deck },
    });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opening = fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action });
    const suspended = applied(opening);
    if (opening.kind !== "applied") throw new Error("expected activation to apply");
    expect(suspended.committed.knownTo.player).toEqual([]);
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(revealing, { checkEventPrefix: true, log: (record) => records.push(record) });
    const pending = fresh.pending(reloaded)!;
    expect(pending.prompt.id).toBe(fold.pending(suspended)!.prompt.id);
    expect(view(pending.display, "player", revealing.catalog).sides.enemy.hand.known).toEqual([{ id: ids.enemy.hand[0], index: 0 }]);
    const chosen = (pending.prompt as ChooseCardsPrompt).candidates[0];
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [chosen] } as const;
    expect(fresh.reduce(reloaded, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(reloaded, { ...answer, value: ids.enemy.hand })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(reloaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toMatchObject({ kind: "bounced" });
    const outcome = fresh.reduce(reloaded, answer);
    const done = applied(outcome);
    if (outcome.kind !== "applied") throw new Error("expected answer to apply");
    expect([...opening.published, ...outcome.published].filter((item) => item.kind === "revealed")).toHaveLength(1);
    expect(done.committed.knownTo.player).toContain(ids.enemy.hand[0]);
    expect(fresh.reduce(done, answer)).toMatchObject({ kind: "bounced" });
    expect(records.some((record) => record.event === "engine.action")).toBe(true);
  });

  it("commits no knowledge or reveal event when the resolving step throws after the reveal", () => {
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(revealing, { log: (record) => records.push(record) });
    const { state, ids } = boardState(revealing.catalog, {
      active: "player", phase: "day",
      player: { hand: [revealThenFail.id], deck }, enemy: { hand: [v.vanilla1.id], deck },
    });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const beforeHash = stateHash(state);
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected a resolution error");
    expect(outcome.slice.committed.knownTo).toEqual(state.knownTo);
    expect(outcome.published.some((item) => item.kind === "revealed")).toBe(false);
    expect(records.some((record) => record.event === "engine.error")).toBe(true);
    expect(outcome.slice.inFlight).toBeNull();
    expect(stateHash(state)).toBe(beforeHash);
  });
});
