/** D20: Whisper's void trigger pays before Dreamwell and retains its physical source beside another copy. */
import { expect } from "vitest";
import type { Side } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule, ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import whisper from "../cards/whisper-of-the-past-5931e388";

const WHISPER = parseCardId(whisper.id);
const deck = Array.from({ length: 6 }, () => SYNTHETIC.vanilla1.id);
const pass = (side: Side): ScenarioStep => ({ side, action: { kind: "pass" } });

const scenarios: NamedScenario[] = (["player", "enemy"] as const).flatMap((side) => {
  const other = side === "player" ? "enemy" : "player";
  const payment: NamedScenario[] = (["pay", "decline", "short"] as const).map((choice) => ({
    name: `${whisper.id} ${side} start-turn ${choice} preserves physical source and resolves before Dreamwell`,
    spec: {
      board: {
        active: other,
        phase: "night",
        [side]: { void: [WHISPER], hand: [WHISPER], deck: choice === "short" ? deck.slice(0, 2) : deck },
        [other]: { deck },
      },
      steps: () => [pass(other)],
      answers: () => choice === "short" ? [] : [choice === "pay"],
    },
    check: ({ state, ids, events, answers }) => {
      const source = ids[side].void[0];
      const copy = ids[side].hand[0];
      const turn = events.findIndex((event) => event.kind === "turnStarted" && event.side === side);
      const resolved = events.findIndex((event) => event.kind === "triggerResolved" && event.source === source && event.applied);
      const dreamwell = events.findIndex((event) => event.kind === "phaseChanged" && event.phase === "dreamwell" && event.active === side);
      const eroded = events.flatMap((event, index) => event.kind === "eroded" && event.side === side ? [{ instance: event.instance, index }] : []);
      const placed = events.flatMap((event, index) => event.kind === "cardsPlaced" && event.side === side ? [{ event, index }] : []);
      const drawn = events.flatMap((event, index) => event.kind === "cardDrawn" && event.side === side ? [{ instance: event.instance, index }] : []);
      expect(resolved).toBeGreaterThan(turn);
      expect(turn).toBeGreaterThanOrEqual(0);
      expect(dreamwell).toBeGreaterThan(resolved);
      expect(state.instances[copy]?.zone).toBe("hand");
      expect(state.sides[side].hand).toContain(copy);
      expect(answers.map((answer) => answer.value)).toEqual(choice === "short" ? [] : [choice === "pay"]);
      if (choice === "pay") {
        expect(eroded.map((event) => event.instance)).toEqual(ids[side].deck.slice(0, 3));
        expect(placed).toHaveLength(1);
        expect(placed[0].event).toMatchObject({ to: "deckTop", cards: [source] });
        for (const event of eroded) {
          expect(event.index).toBeGreaterThan(resolved);
          expect(event.index).toBeLessThan(placed[0].index);
        }
        expect(placed[0].index).toBeLessThan(dreamwell);
        expect(drawn.map((event) => event.instance)).toEqual([source]);
        expect(state.sides[side].hand).toEqual([copy, source]);
        expect(state.sides[side].void).toEqual(ids[side].deck.slice(0, 3).reverse());
        expect(state.sides[side].deck).toEqual(ids[side].deck.slice(3));
      } else {
        expect(eroded).toEqual([]);
        expect(placed).toEqual([]);
        expect(state.instances[source]?.zone).toBe("void");
        expect(state.sides[side].void).toEqual([source]);
        expect(drawn.map((event) => event.instance)).toEqual([ids[side].deck[0]]);
        expect(state.sides[side].deck).toEqual(ids[side].deck.slice(1));
      }
      for (const event of drawn) expect(event.index).toBeGreaterThan(dreamwell);
    },
  }));
  const reclaim: NamedScenario = {
    name: `${whisper.id} ${side} grants another physical copy plain Reclaim, whose event grants the first source before banishment`,
    spec: {
      board: {
        active: side,
        phase: "day",
        [side]: { hand: [WHISPER], void: [WHISPER, SYNTHETIC.vanilla1.id], deck, energy: 3 },
        [other]: { void: [SYNTHETIC.event0.id], deck },
      },
      steps: (ids) => [
        { side, action: { kind: "play", card: ids[side].hand[0], from: "hand" } },
        { side, action: { kind: "play", card: ids[side].void[0], from: "void" } },
      ],
      // The sole eligible event on the first play is chosen automatically.
      answers: (ids) => [[ids[side].hand[0]]],
    },
    check: ({ state, ids, events }) => {
      const source = ids[side].hand[0];
      const reclaimed = ids[side].void[0];
      const character = ids[side].void[1];
      const foreign = ids[other].void[0];
      const grants = events.flatMap((event) => event.kind === "effectStarted" && event.change.kind === "keyword" ? [event] : []);
      expect(grants.map((event) => event.change)).toEqual([
        { kind: "keyword", instance: reclaimed, keyword: "reclaim", gains: true },
        { kind: "keyword", instance: source, keyword: "reclaim", gains: true },
      ]);
      expect(events.flatMap((event) => event.kind === "cardPlayed" && event.side === side ? [event.instance] : [])).toEqual([source, reclaimed]);
      expect(state.sides[side].currentEnergy).toBe(1);
      expect(state.instances[reclaimed]).toMatchObject({ zone: "banished", status: { reclaimed: true, playedViaReclaim: true } });
      expect(state.sides[side].banished).toEqual([reclaimed]);
      expect(state.sides[side].void).toEqual([source, character]);
      expect(state.sides[other].void).toEqual([foreign]);
      expect(events.some((event) => event.kind === "triggerQueued" && (event.source === source || event.source === reclaimed))).toBe(false);
    },
  };
  return [...payment, reclaim];
});

export default { slug: "cards-44", scenarios } satisfies ScenarioModule;
