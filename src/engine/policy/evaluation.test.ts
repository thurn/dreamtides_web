/**
 * Contracts of the Phase 7 position evaluation: it is monotonic in each
 * obvious feature, for both sides and whichever side is active, and the
 * opponent's evaluation of the same change moves the other way.
 */
import { describe, expect, it } from "vitest";
import type { CardId, Side } from "../state/ids";
import { opponent, SIDES } from "../state/ids";
import type { BattleState, DeckEntry } from "../state/types";
import type { SideSetup } from "../testing/board";
import { SYNTHETIC } from "../testing/synthetic-cards";
import { evaluate, type EvaluationFeature } from "./evaluation";
import { board, engine, entries } from "./policy.fixtures";

const { vanilla1, vanilla2, vanilla3, vanilla5, interruptEvent, dissolveVictim } = SYNTHETIC;

const PLAIN_DECK: readonly CardId[] = Array.from({ length: 8 }, () => vanilla1.id);
const THREAT_DECK: readonly CardId[] = [interruptEvent.id, dissolveVictim.id, interruptEvent.id, dissolveVictim.id, ...PLAIN_DECK.slice(4)];

/** A middling position: each side has a front and a back character, cards in hand and deck, energy and points. */
const BASE: SideSetup = {
  front: [null, null, vanilla2.id],
  back: [null, null, null, null, vanilla1.id],
  hand: [vanilla1.id, vanilla1.id],
  deck: [vanilla1.id, vanilla1.id, vanilla1.id],
  energy: 3,
  score: 5,
};

interface Position {
  readonly sides?: Partial<Record<Side, SideSetup>>;
  readonly decklists?: Partial<Record<Side, readonly CardId[]>>;
  readonly edit?: (state: BattleState) => void;
}

function value(position: Position, active: Side, viewer: Side, feature?: EvaluationFeature): number {
  const { state } = board({
    active,
    phase: "day",
    player: position.sides?.player ?? BASE,
    enemy: position.sides?.enemy ?? BASE,
  });
  position.edit?.(state);
  const decklists: Record<Side, DeckEntry[]> = {
    player: entries([...(position.decklists?.player ?? PLAIN_DECK)]),
    enemy: entries([...(position.decklists?.enemy ?? PLAIN_DECK)]),
  };
  const evaluation = evaluate(engine.view(state, viewer), viewer, { catalog: engine.catalog, decklists });
  return feature === undefined ? evaluation.total : evaluation.features[feature];
}

/** One improvement for `side`, with the feature it improves. */
interface Improvement {
  readonly name: string;
  readonly feature: EvaluationFeature;
  readonly worse: (side: Side) => Position;
  readonly better: (side: Side) => Position;
  /** A change to hidden-hand estimates the opponent's view already settles or cannot see, so its value stays put. */
  readonly unchangedForOpponent?: boolean;
}

const setup = (side: Side, own: SideSetup, theirs: SideSetup = BASE): Position => ({ sides: { [side]: own, [opponent(side)]: theirs } });

const IMPROVEMENTS: readonly Improvement[] = [
  { name: "more points", feature: "score", worse: (side) => setup(side, BASE), better: (side) => setup(side, { ...BASE, score: 9 }) },
  { name: "points near the threshold", feature: "race", worse: (side) => setup(side, BASE), better: (side) => setup(side, { ...BASE, score: 20 }) },
  { name: "another front-rank character", feature: "frontSpark", worse: (side) => setup(side, BASE), better: (side) => setup(side, { ...BASE, front: [null, null, vanilla2.id, null, null, null, null, vanilla1.id] }) },
  { name: "another back-rank character", feature: "backSpark", worse: (side) => setup(side, BASE), better: (side) => setup(side, { ...BASE, back: [null, null, null, null, vanilla1.id, null, null, null, vanilla1.id] }) },
  { name: "more front-rank spark", feature: "frontSpark", worse: (side) => setup(side, BASE), better: (side) => setup(side, { ...BASE, front: [null, null, vanilla5.id] }) },
  { name: "a supported front-rank character", feature: "support", worse: (side) => setup(side, BASE), better: (side) => setup(side, { ...BASE, back: [null, null, vanilla1.id, null, null] }) },
  { name: "more characters in play", feature: "tempo", worse: (side) => setup(side, BASE), better: (side) => setup(side, { ...BASE, back: [vanilla1.id, null, null, null, vanilla1.id] }) },
  { name: "more cards in hand", feature: "hand", worse: (side) => setup(side, BASE), better: (side) => setup(side, { ...BASE, hand: [vanilla1.id, vanilla1.id, vanilla1.id, vanilla1.id] }) },
  { name: "a deeper deck", feature: "deck", worse: (side) => setup(side, BASE), better: (side) => setup(side, { ...BASE, deck: [...PLAIN_DECK] }) },
  { name: "more current energy", feature: "currentEnergy", worse: (side) => setup(side, BASE), better: (side) => setup(side, { ...BASE, energy: 6 }) },
  {
    name: "more maximum energy",
    feature: "maxEnergy",
    worse: (side) => setup(side, BASE),
    better: (side) => ({ ...setup(side, BASE), edit: (state) => { state.sides[side].maxEnergy = 6; } }),
  },
  {
    name: "fewer threats in the opposing decklist",
    feature: "threats",
    unchangedForOpponent: true,
    worse: (side) => ({ decklists: { [opponent(side)]: THREAT_DECK } }),
    better: (side) => ({ decklists: { [opponent(side)]: PLAIN_DECK } }),
  },
  {
    name: "opposing threats already seen in the void",
    feature: "threats",
    unchangedForOpponent: true,
    worse: (side) => ({ decklists: { [opponent(side)]: THREAT_DECK } }),
    better: (side) => ({ decklists: { [opponent(side)]: THREAT_DECK }, sides: { [opponent(side)]: { ...BASE, void: [interruptEvent.id, dissolveVictim.id] } } }),
  },
  {
    name: "threats in its own hand",
    feature: "threats",
    unchangedForOpponent: true,
    worse: (side) => ({ decklists: { [side]: THREAT_DECK } }),
    better: (side) => ({ decklists: { [side]: THREAT_DECK }, sides: { [side]: { ...BASE, hand: [interruptEvent.id, dissolveVictim.id] } } }),
  },
];

describe("the position evaluation", () => {
  for (const improvement of IMPROVEMENTS) {
    for (const side of SIDES) {
      for (const active of SIDES) {
        it(`values ${improvement.name} for ${side} with ${active} active, and the opponent the reverse`, () => {
          const worse = improvement.worse(side), better = improvement.better(side);
          expect(value(better, active, side, improvement.feature)).toBeGreaterThan(value(worse, active, side, improvement.feature));
          expect(value(better, active, side)).toBeGreaterThan(value(worse, active, side));
          if (improvement.unchangedForOpponent === true) expect(value(better, active, opponent(side))).toBe(value(worse, active, opponent(side)));
          else expect(value(better, active, opponent(side))).toBeLessThan(value(worse, active, opponent(side)));
        });
      }
    }
  }

  for (const side of SIDES) {
    it(`never lowers ${side}'s value as its challenger or its blocker grows, across every spark`, () => {
      const attacker = (spark: CardId): Position => setup(side, { ...BASE, front: [null, null, spark] }, { ...BASE, front: [null, null, vanilla3.id] });
      const ladder = [vanilla1.id, vanilla2.id, vanilla3.id, vanilla5.id];
      for (const active of SIDES) {
        const values = ladder.map((card) => value(attacker(card), active, side));
        for (let index = 1; index < values.length; index += 1) expect(values[index]).toBeGreaterThan(values[index - 1] ?? Infinity);
      }
    });

    it(`projects the challenge of the side whose Day it is, for ${side}`, () => {
      const unblocked = setup(side, { ...BASE, front: [null, null, null, null, null, vanilla5.id] }, { ...BASE, front: [] });
      expect(value(unblocked, side, side, "challengePoints")).toBeGreaterThan(0);
      expect(value(unblocked, opponent(side), side, "challengePoints")).toBe(0);
      expect(value(unblocked, side, opponent(side), "challengePoints")).toBeLessThan(0);
    });
  }

  it("scores a finished battle by its result alone", () => {
    const won: Position = { edit: (state) => { state.result = { kind: "victory", winner: "player", reason: "score" }; } };
    const drawn: Position = { edit: (state) => { state.result = { kind: "draw", reason: "turnLimit" }; } };
    expect(value(won, "player", "player")).toBeGreaterThan(value(BASE_POSITION, "player", "player"));
    expect(value(won, "player", "enemy")).toBeLessThan(value(BASE_POSITION, "player", "enemy"));
    expect(value(won, "player", "player")).toBe(-value(won, "player", "enemy"));
    expect(value(drawn, "player", "player")).toBe(0);
  });
});

const BASE_POSITION: Position = {};
