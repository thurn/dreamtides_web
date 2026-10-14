/** D20: physical void sources return only for matching own materializations. */
import { expect } from "vitest";
import { NO_DECK_MODS } from "../../engine/dsl/types";
import type { CardId, Side } from "../../engine/state/ids";
import { playFromHand, type NamedScenario, type ScenarioModule, type ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC as v } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import deathsworn from "../cards/the-deathsworn-1ce0f0f2";
import veil from "../cards/veil-of-the-wastes-409147ec";

const DEATHSWORN = parseCardId(deathsworn.id), VEIL = parseCardId(veil.id);
const deck = [v.vanilla3.id, v.vanilla3.id];
interface Row {
  readonly source: CardId;
  readonly subject: CardId;
  readonly name: string;
  readonly returns: boolean;
  readonly amplified?: boolean;
  readonly costReduction?: number;
  readonly opposing?: boolean;
  readonly held?: boolean;
}
const rows: readonly Row[] = [
  { source: DEATHSWORN, subject: v.vanilla1.id, name: "base exact one", returns: true },
  { source: DEATHSWORN, subject: v.vanilla0.id, name: "base excludes zero", returns: false },
  { source: DEATHSWORN, subject: v.vanilla2.id, name: "base excludes two", returns: false },
  { source: DEATHSWORN, subject: v.vanilla0.id, name: "amplified includes zero", amplified: true, returns: true },
  { source: DEATHSWORN, subject: v.vanilla2.id, name: "amplified excludes two", amplified: true, returns: false },
  { source: VEIL, subject: v.vanilla2.id, name: "inclusive cost two", returns: true },
  { source: VEIL, subject: v.vanilla3.id, name: "excludes cost three", returns: false },
  { source: VEIL, subject: v.vanilla3.id, name: "copiable reduced cost two", costReduction: 1, returns: true },
  { source: DEATHSWORN, subject: v.vanilla1.id, name: "opposing materialization", opposing: true, returns: false },
  { source: VEIL, subject: v.vanilla2.id, name: "opposing materialization", opposing: true, returns: false },
  { source: DEATHSWORN, subject: v.vanilla1.id, name: "source held in hand", held: true, returns: false },
  { source: VEIL, subject: v.vanilla2.id, name: "source held in hand", held: true, returns: false },
];

function scenario(side: Side, row: Row): NamedScenario {
  const other = side === "player" ? "enemy" : "player";
  const actor = row.opposing ? other : side;
  const subject = { cardId: row.subject, deckMods: { ...NO_DECK_MODS, costReduction: row.costReduction ?? 0 } };
  return {
    name: `${row.source} ${side} ${row.name}`,
    spec: {
      board: {
        active: actor, phase: "day",
        [side]: row.opposing
          ? { void: [row.source], hand: [row.source], energy: 10, deck }
          : { back: [v.discardOne.id], hand: [{ cardId: row.source, amplified: row.amplified ?? false }, subject, row.source], energy: 10, deck },
        [other]: { hand: row.opposing ? [subject] : [], void: [v.vanilla0.id], energy: 10, deck },
      },
      steps: (ids): ScenarioStep[] => [
        ...(!row.opposing && !row.held ? [{ side, action: { kind: "activate" as const, source: ids[side].back[0]!, ability: 0 } }] : []),
        playFromHand(ids, actor, row.opposing ? 0 : 1),
      ],
      answers: ids => !row.opposing && !row.held ? [[ids[side].hand[0]]] : [],
    },
    check: ({ start, state, events, ids }) => {
      const source = row.opposing ? ids[side].void[0] : ids[side].hand[0];
      const played = ids[actor].hand[row.opposing ? 0 : 1];
      const duplicate = ids[side].hand[row.opposing ? 0 : 2];
      expect(state.instances[source]).toMatchObject({ owner: side, controller: side, zone: row.returns ? "play" : row.held ? "hand" : "void" });
      expect(state.instances[source].printing).toEqual({ kind: "card", cardId: row.source });
      expect(state.instances[duplicate].zone).toBe("hand");
      expect(state.instances[played]).toMatchObject({ zone: "play", controller: actor });
      expect(state.instances[ids[other].void[0]].zone).toBe("void");
      const returns = events.filter(event => event.kind === "materialized" && event.instance === source);
      expect(returns).toHaveLength(row.returns ? 1 : 0);
      expect(events.filter(event => event.kind === "triggerQueued" && event.source === source)).toHaveLength(row.returns ? 1 : 0);
      expect(events.filter(event => event.kind === "cardPlayed" && event.instance === source)).toEqual([]);
      if (row.returns) {
        expect(state.instances[source].status.exhausted).toBe(true);
        const departure = events.findIndex(event => event.kind === "leftVoid" && event.instance === source && event.to === "play");
        expect(departure).toBeGreaterThanOrEqual(0);
        expect(events.findIndex(event => event.kind === "materialized" && event.instance === source)).toBeGreaterThan(departure);
      }
      const subjectCost = row.subject === v.vanilla0.id ? 0 : row.subject === v.vanilla1.id ? 1 : row.subject === v.vanilla2.id ? 2 : 3;
      expect(state.sides[actor].currentEnergy).toBe(start.sides[actor].currentEnergy - subjectCost + (row.costReduction ?? 0));
      expect(state.stack).toEqual([]);
      expect(state.triggerQueue).toEqual([]);
      expect(state.result).toBeNull();
    },
  };
}

function coupled(side: Side): NamedScenario {
  const other = side === "player" ? "enemy" : "player";
  return {
    name: `${DEATHSWORN} ${side} coupled void returns terminate with each physical source entering once`,
    spec: {
      board: { active: side, phase: "day", [side]: { back: [v.discardOne.id], hand: [{ cardId: DEATHSWORN, amplified: true }, VEIL, v.vanilla0.id, DEATHSWORN, VEIL], energy: 10, deck }, [other]: { void: [VEIL], deck } },
      steps: ids => [
        { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
        { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
        playFromHand(ids, side, 2),
      ],
      answers: ids => [[ids[side].hand[0]], [ids[side].hand[1]]],
    },
    check: ({ start, state, events, ids }) => {
      for (const source of ids[side].hand.slice(0, 2)) {
        expect(state.instances[source]).toMatchObject({ owner: side, controller: side, zone: "play", status: { exhausted: true } });
        expect(events.filter(event => event.kind === "materialized" && event.instance === source)).toHaveLength(1);
        expect(events.filter(event => event.kind === "cardPlayed" && event.instance === source)).toEqual([]);
      }
      for (const duplicate of ids[side].hand.slice(3)) expect(state.instances[duplicate].zone).toBe("hand");
      expect(state.instances[ids[other].void[0]].zone).toBe("void");
      // Veil can queue for both the zero-cost subject and Deathsworn's return.
      // Its later body sees the same source outside its void and moves nothing.
      expect(events.filter(event => event.kind === "triggerResolved" && event.source === ids[side].hand[1])).toHaveLength(2);
      expect(state.sides[side].currentEnergy).toBe(start.sides[side].currentEnergy);
      expect(state.stack).toEqual([]);
      expect(state.triggerQueue).toEqual([]);
      expect(state.result).toBeNull();
    },
  };
}

export default { slug: "cards-ready-148", scenarios: (["player", "enemy"] as const).flatMap(side => [...rows.map(row => scenario(side, row)), coupled(side)]) } satisfies ScenarioModule;
