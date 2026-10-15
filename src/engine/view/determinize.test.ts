import { testCardSubtype } from "../../types/test-identities";
/**
 * Determinization (D22): sampled states are legal, match the view (with the
 * characteristics static abilities in hidden zones give the cards it shows),
 * are seeded, and never read hidden information.
 */
import { describe, expect, it, vi } from "vitest";
import * as functionalZones from "../dsl/abilities";
import type { EngineCardDefinition } from "../catalog";
import { all, characterYouControl, energy, scoredAmount, staticAbility } from "../dsl/builders";
import { triggered, whenScores, whenYouPlay } from "../dsl/triggers";
import { runStep } from "../steps/runner";
import { NO_PROMPTS } from "../steps/sources";
import type { AbilityList } from "../dsl/types";
import * as p from "../effects/primitives";
import { createEngine } from "../engine";
import { stateHash } from "../state/hash";
import type { InstanceId, Side } from "../state/ids";
import { battleSeed, opponent, SIDES } from "../state/ids";
import type { BattleState, CardInstance, DeckEntry } from "../state/types";
import { boardState, cardIdOf, type SideSetup } from "../testing/board";
import { fuzzEngineCatalog, fuzzInit, playRandomActions, playRandomGame, SYNTHETIC_FUZZ_POOL } from "../testing/fuzz";
import { invariantViolations } from "../testing/invariants";
import { comparableView, determinizationDivergences } from "../testing/determinization-fidelity";
import { PolicyRandom } from "../policy/random";
import { hiddenFrom } from "../testing/redaction";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { at, passUntil } from "../testing/trigger-harness";
import { determinize, type Decklists } from "./determinize";
import "./determinization-fidelity.contracts";

const engine = createEngine(fuzzEngineCatalog(SYNTHETIC_FUZZ_POOL));

/** Mid-game states of seeded Random games, every 40 actions up to 160, with their decklists. */
function samples(): { state: BattleState; decklists: Decklists }[] {
  const result: { state: BattleState; decklists: Decklists }[] = [];
  for (let game = 0; game < 3; game++) {
    const init = fuzzInit(battleSeed(`determinize-${String(game)}`), SYNTHETIC_FUZZ_POOL);
    playRandomGame(engine, init, {
      stop: (state, actions) => {
        if (actions > 0 && actions % 40 === 0) result.push({ state, decklists: init.decks });
        return actions >= 160;
      },
    });
  }
  return result;
}

const SAMPLES = samples();

function seeded(label: string): () => number {
  const random = new PolicyRandom(battleSeed(label));
  return () => random.next();
}

function entryLabel(entry: DeckEntry): string {
  return `${entry.cardId}|${String(entry.amplified === true)}`;
}

/** The deck-born cards `side` owns, as decklist entries. */
function ownedEntries(state: BattleState, side: Side): string[] {
  return Object.values(state.instances)
    .filter((instance: CardInstance) => instance.owner === side && !instance.status.created && instance.printing.kind === "card")
    .map((instance) => (instance.printing.kind === "card" ? entryLabel({ cardId: instance.printing.cardId, amplified: instance.variant.amplified }) : ""))
    .sort();
}

describe("determinize", () => {
  it("samples from real mid-game states, some with hidden cards in both hands", () => {
    expect(SAMPLES.length).toBeGreaterThanOrEqual(6);
    expect(SAMPLES.some(({ state }) => SIDES.every((side) => state.sides[side].hand.length > 0))).toBe(true);
  });

  it("produces legal states that the engine plays on from", () => {
    SAMPLES.forEach(({ state, decklists }, index) => {
      for (const viewer of SIDES) {
        const sampled = determinize(engine.view(state, viewer), decklists, seeded(`legal-${String(index)}-${viewer}`), engine.catalog);
        expect(invariantViolations(sampled, engine.catalog)).toEqual([]);
        expect(engine.decision(sampled) !== null || sampled.result !== null).toBe(true);
        const later = playRandomActions(engine, sampled, new PolicyRandom(battleSeed(`legal-play-${String(index)}`)), {
          stop: (current, actions) => {
            // An unknown sampled recording preserves the offer but cannot be explored.
            // The loop owner's view distinguishes it from an opponent's hidden recording.
            const loop = engine.view(current, viewer).loop;
            return actions >= 30 || (loop !== null && engine.view(current, loop.side).loop?.recording === undefined);
          },
        });
        expect(later.end).not.toBe("noDecision");
        expect(invariantViolations(later.state, engine.catalog)).toEqual([]);
      }
    });
  });

  it("looks to the viewer exactly as the real state does", () => {
    SAMPLES.forEach(({ state, decklists }, index) => {
      for (const viewer of SIDES) {
        const seen = engine.view(state, viewer);
        const sampled = determinize(seen, decklists, seeded(`view-${String(index)}-${viewer}`), engine.catalog);
        expect(comparableView(engine.view(sampled, viewer))).toEqual(comparableView(seen));
      }
    });
  });

  it("agrees with the real state on each side's legal actions, public cards, and effects", () => {
    SAMPLES.forEach(({ state, decklists }, index) => {
      expect(determinizationDivergences(engine, state, decklists, battleSeed("fidelity"), index)).toEqual([]);
    });
  });

  it("reports a sample that changes a public card's raw status or drops an anonymous play permission", () => {
    // A side with a card in its void, whose opponent holds a card hidden from it to grant the permission.
    const [found] = SAMPLES.flatMap(({ state, decklists }) =>
      SIDES.filter((side) => state.sides[side].void.length > 0 && state.sides[opponent(side)].hand.length > 0).map((holder) => ({ base: state, decklists, holder })),
    );
    if (found === undefined) throw new Error("no sample has a void card and a hidden opposing hand card");
    const { base, decklists, holder } = found;
    const state = structuredClone(base);
    const [card] = state.sides[holder].void;
    const permission = `e${state.nextEffect}` as const;
    state.floating.push({
      id: permission, controller: holder, source: state.sides[opponent(holder)].hand[0], timestamp: state.clock, expiry: { at: "endOfTurn" },
      change: { kind: "playFrom", player: holder, zone: "void", instance: null, filter: {}, next: true },
    });
    state.nextEffect += 1;
    expect(determinizationDivergences(engine, state, decklists, battleSeed("fidelity-probe"), 0)).toEqual([]);
    const lossy = {
      ...engine,
      determinize: (...args: Parameters<typeof engine.determinize>) => {
        const sampled = engine.determinize(...args);
        sampled.instances[card].status.reclaimed = !sampled.instances[card].status.reclaimed;
        sampled.floating = sampled.floating.filter((effect) => effect.id !== permission);
        return sampled;
      },
    };
    const problems = determinizationDivergences(lossy, state, decklists, battleSeed("fidelity-probe"), 0);
    for (const side of SIDES) {
      const own = problems.filter((problem) => problem.startsWith(`${side}'s`));
      expect(own.some((problem) => problem.includes(card) && problem.includes("status"))).toBe(true);
      expect(own.some((problem) => problem.includes(permission))).toBe(true);
    }
  });

  it("deals every hidden card from what each decklist has left", () => {
    SAMPLES.forEach(({ state, decklists }, index) => {
      for (const viewer of SIDES) {
        const sampled = determinize(engine.view(state, viewer), decklists, seeded(`deal-${String(index)}`), engine.catalog);
        for (const side of SIDES) {
          expect(ownedEntries(sampled, side)).toEqual(ownedEntries(state, side));
          expect(ownedEntries(sampled, side)).toEqual(decklists[side].map(entryLabel).sort());
        }
      }
    });
  });

  it("is deterministic for a seed and varies with it", () => {
    const { state, decklists } = SAMPLES[0];
    const seen = engine.view(state, "player");
    const first = determinize(seen, decklists, seeded("same"), engine.catalog);
    expect(stateHash(determinize(seen, decklists, seeded("same"), engine.catalog))).toBe(stateHash(first));
    const hashes = new Set(Array.from({ length: 5 }, (_, n) => stateHash(determinize(seen, decklists, seeded(`vary-${String(n)}`), engine.catalog))));
    expect(hashes.size).toBeGreaterThan(1);
  });

  it("never uses hidden information: swapping two hidden cards changes neither the view nor the sample", () => {
    let swapped = 0;
    SAMPLES.forEach(({ state, decklists }, index) => {
      for (const viewer of SIDES) {
        const hidden = hiddenFrom(state, viewer).filter((id) => state.instances[id]?.owner === opponent(viewer));
        const pair = pairWithDifferentCards(state, hidden);
        if (pair === null) continue;
        const altered = structuredClone(state);
        const [a, b] = pair;
        const first = altered.instances[a];
        const second = altered.instances[b];
        altered.instances[a] = { ...first, printing: second.printing, variant: second.variant };
        altered.instances[b] = { ...second, printing: first.printing, variant: first.variant };
        expect(stateHash(altered)).not.toBe(stateHash(state));
        const seen = engine.view(state, viewer);
        expect(engine.view(altered, viewer)).toEqual(seen);
        const label = `hidden-${String(index)}-${viewer}`;
        expect(stateHash(determinize(engine.view(altered, viewer), decklists, seeded(label), engine.catalog))).toBe(
          stateHash(determinize(seen, decklists, seeded(label), engine.catalog)),
        );
        swapped += 1;
      }
    });
    expect(swapped).toBeGreaterThan(0);
  });
});

describe("determinize source-independent floating costs", () => {
  const current = createEngine(testCatalog());
  function fixture(viewer: Side, ceased: boolean, cardCost: boolean) {
    const other = opponent(viewer);
    const { state, ids } = boardState(current.catalog, {
      active: viewer, phase: "day",
      [viewer]: { hand: [SYNTHETIC.vanilla2.id], energy: 2 },
      [other]: { hand: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla5.id] },
    });
    const card = ids[viewer].hand[0];
    const [source] = ids[other].hand;
    if (ceased) {
      state.sides[other].hand.shift();
      delete state.instances[source];
    }
    state.floating.push({
      id: "e1", controller: other, source, timestamp: state.clock, expiry: { at: "never" },
      change: cardCost ? { kind: "cardCost", instance: card, mode: "increase", amount: 1 }
        : { kind: "cost", player: viewer, filter: {}, amount: 1, next: true },
    });
    state.nextEffect = 2;
    const entries = (side: Side) => Object.values(state.instances).filter((item) => item.owner === side)
      .map((item) => ({ cardId: cardIdOf(state, item.id) }));
    return { state, card, source, decklists: { player: entries("player"), enemy: entries("enemy") } };
  }

  const cases = SIDES.flatMap((viewer) => [false, true].flatMap((ceased) => [false, true].map((cardCost) => ({ viewer, ceased, cardCost }))));
  it.each(cases)("preserves cost and legality for $viewer (ceased=$ceased, cardCost=$cardCost)", ({ viewer, ceased, cardCost }) => {
    const { state, card, source, decklists } = fixture(viewer, ceased, cardCost);
    const seen = current.view(state, viewer);
    const sampled = current.determinize(seen, decklists, seeded("anonymous-cost"));
    expect(seen.instances[card].characteristics.cost).toBe(3);
    expect(current.view(sampled, viewer).instances[card].characteristics.cost).toBe(3);
    expect(seen.floating).toEqual([{ ...state.floating[0], source: null }]);
    expect(current.legalActions(state, viewer).some((action) => action.kind === "play" && action.card === card)).toBe(false);
    expect(current.legalActions(sampled, viewer)).toEqual(current.legalActions(state, viewer));
    expect(determinizationDivergences(current, state, decklists, battleSeed("anonymous-cost"), 0)).toEqual([]);
    const lossy = { ...current, determinize: (...args: Parameters<typeof current.determinize>) => {
      const result = current.determinize(...args);
      result.floating = result.floating.filter((effect) => effect.id !== "e1");
      return result;
    } };
    const problems = determinizationDivergences(lossy, state, decklists, battleSeed("anonymous-cost"), 0).filter((problem) => problem.startsWith(`${viewer}'s`));
    expect(problems.some((problem) => problem.includes("floating effect e1 missing"))).toBe(true);
    expect(problems.some((problem) => problem.includes("extra legal action") && problem.includes(card))).toBe(true);
    if (!ceased) {
      const altered = structuredClone(state);
      const other = state.sides[opponent(viewer)].hand[1];
      altered.instances[source] = { ...altered.instances[source], printing: state.instances[other].printing };
      altered.instances[other] = { ...altered.instances[other], printing: state.instances[source].printing };
      expect(current.view(altered, viewer)).toEqual(seen);
      expect(stateHash(current.determinize(current.view(altered, viewer), decklists, seeded("anonymous-cost")))).toBe(stateHash(sampled));
    }
  });

  it.each(SIDES)("keeps hidden changed-card and expiry identities private for %s", (viewer) => {
    const { state, source } = fixture(viewer, false, true);
    const hiddenTarget = { ...state.floating[0], change: { kind: "cardCost", instance: source, mode: "increase", amount: 1 } } as const;
    state.floating = [hiddenTarget];
    expect(current.view(state, viewer).floating).toEqual([]);
    const { state: expiryState } = fixture(viewer, false, false);
    expiryState.floating[0] = { ...expiryState.floating[0], expiry: { at: "sourceLeavesPlay", source } };
    expect(current.view(expiryState, viewer).floating).toEqual([]);
  });
});

/** A captured scoring trigger, including neutral and legacy optional snapshots. */
function scoringQueue(scored: number | undefined) {
  const scorer: EngineCardDefinition = {
    ...SYNTHETIC.vanilla3, id: syntheticId(0x7f0), status: "authored", spark: scored === undefined || scored === 0 ? 3 : scored,
    abilities: () => [triggered(whenScores(), p.losePoints(scoredAmount(), "opponent"))],
  };
  const current = createEngine(testCatalog([scorer]));
  const { state } = boardState(current.catalog, {
    active: "player", phase: "day",
    player: { front: [scorer.id], deck: [SYNTHETIC.vanilla1.id] },
    enemy: { score: 7, deck: [SYNTHETIC.vanilla1.id] },
  });
  const result = passUntil(current, state, at(current, "enemy", "day"));
  const captured = result.steps.find((step) => step.step.kind === "challengeLane" && step.state.triggerQueue.length > 0)?.state;
  if (captured === undefined) throw new Error("no captured scoring trigger");
  const queued = structuredClone(captured);
  if (scored === undefined) {
    const { scored: _scored, ...legacy } = queued.triggerQueue[0];
    queued.triggerQueue[0] = legacy;
  } else if (scored === 0) queued.triggerQueue[0] = { ...queued.triggerQueue[0], scored };
  const decklists: Decklists = {
    player: [{ cardId: scorer.id }, { cardId: SYNTHETIC.vanilla1.id }],
    enemy: [{ cardId: SYNTHETIC.vanilla1.id }],
  };
  return { current, queued, decklists };
}

describe("determinize queued scoring snapshots", () => {
  it.each([undefined, 0, 1, 1.5, 3])("preserves the public trigger view for scored=%s", (scored) => {
    const { current, queued, decklists } = scoringQueue(scored);
    for (const viewer of SIDES) {
      const seen = current.view(queued, viewer);
      expect(seen.triggerQueue[0].scored).toBe(scored);
      const sampled = current.determinize(seen, decklists, seeded(`scored-view-${viewer}`));
      expect(current.view(sampled, viewer).triggerQueue).toEqual(seen.triggerQueue);
    }
  });

  it.each([undefined, 0, 1, 1.5, 3])("resolves the same actual point loss for scored=%s", (scored) => {
    const { current, queued, decklists } = scoringQueue(scored);
    const authoritative = runStep(queued, { kind: "resolveTrigger" }, NO_PROMPTS, current.catalog);
    if (authoritative.kind !== "done") throw new Error("a scoring trigger suspended");
    expect(authoritative.state.sides.enemy.score).toBe(7 - (scored ?? 0));
    for (const viewer of SIDES) {
      const sampled = current.determinize(current.view(queued, viewer), decklists, seeded(`scored-effect-${viewer}`));
      const simulated = runStep(sampled, { kind: "resolveTrigger" }, NO_PROMPTS, current.catalog);
      if (simulated.kind !== "done") throw new Error("a sampled trigger suspended");
      expect(simulated.events).toEqual(authoritative.events);
      expect(simulated.state.sides.enemy.score).toBe(authoritative.state.sides.enemy.score);
    }
  });
});

/** A 1● character with one static ability working from a hand. */
function handStatic(index: number, abilities: AbilityList): EngineCardDefinition {
  return {
    id: syntheticId(0x7e0 + index),
    cardType: "character",
    costs: [energy(1)],
    spark: 1,
    subtype: "Warrior",
    speed: "standard",
    status: "authored",
    abilities,
  };
}

/** "While this card is in your hand, characters you control have +1✦." */
const handAnthem = handStatic(0, () => [staticAbility(p.sparkModifier(all(characterYouControl()), 1), { zone: "hand" })]);
/** "While this card is in your hand, characters the opponent plays cost 1● more." */
const handTax = handStatic(1, () => [staticAbility(p.costModifier("opponent", { cardType: "character" }, 1), { zone: "hand" })]);
/** "While this card is in your hand, characters you control have Vengeful." */
const handVengeful = handStatic(2, () => [staticAbility(p.grant(all(characterYouControl()), "vengeful"), { zone: "hand" })]);

const hiddenCatalog = testCatalog([handAnthem, handTax, handVengeful]);
const hiddenEngine = createEngine(hiddenCatalog);
const filler = SYNTHETIC.vanilla1.id;

/**
 * The player's Day with the enemy's hand and deck hidden from it: the player
 * holds a 2● character with 2●, and the enemy has a character in play, the
 * given hand, and a deck of fillers. Returned with each side's decklist: the
 * cards each side holds.
 */
function hiddenBoard(enemyHand: SideSetup["hand"]): { state: BattleState; decklists: Decklists; ids: ReturnType<typeof boardState>["ids"] } {
  const { state, ids } = boardState(hiddenCatalog, {
    active: "player",
    phase: "day",
    player: { front: [filler], hand: [SYNTHETIC.vanilla2.id], energy: 2, deck: Array.from({ length: 6 }, () => filler) },
    enemy: { front: [filler], hand: enemyHand, deck: Array.from({ length: 12 }, () => filler) },
  });
  const decklist = (side: Side): DeckEntry[] =>
    Object.values(state.instances)
      .filter((instance) => instance.owner === side)
      .map((instance) => ({ cardId: cardIdOf(state, instance.id) }));
  return { state, decklists: { player: decklist("player"), enemy: decklist("enemy") }, ids };
}

describe("determinize with static abilities working from a hidden zone", () => {
  const SEEDS = Array.from({ length: 24 }, (_, n) => `hidden-static-${String(n)}`);

  it("reconciles deck-only statics according to the shared functional-zone predicate", () => {
    const original = functionalZones.worksInZone;
    const predicate = vi.spyOn(functionalZones, "worksInZone").mockImplementation((zone, current) => zone === "void" ? current === "deck" : original(zone, current));
    try {
      const source = handStatic(3, () => [staticAbility(p.sparkModifier(all(characterYouControl()), 1), { zone: "void" })]);
      const catalog = testCatalog([source]);
      const current = createEngine(catalog);
      const { state, ids } = boardState(catalog, {
        active: "player", phase: "day",
        enemy: { front: [filler], hand: [filler], deck: [source.id] },
      });
      const seen = current.view(state, "player");
      expect(seen.instances[ids.enemy.front[0]!]?.characteristics.spark).toBe(2);
      const decklists: Decklists = { player: [], enemy: [filler, filler, source.id].map((cardId) => ({ cardId })) };
      for (const seed of SEEDS) {
        const sampled = determinize(seen, decklists, seeded(seed), catalog);
        expect(comparableView(current.view(sampled, "player"))).toEqual(comparableView(seen));
      }
    } finally {
      predicate.mockRestore();
    }
  });

  it("collects statics from every instance zone permitted by the shared predicate", () => {
    const original = functionalZones.worksInZone;
    const predicate = vi.spyOn(functionalZones, "worksInZone").mockImplementation((zone, current) => zone === "hand" ? current === "banished" : original(zone, current));
    try {
      const { state, ids } = hiddenBoard([handAnthem.id]);
      const [source] = state.sides.enemy.hand.splice(0, 1);
      state.instances[source].zone = "banished";
      state.sides.enemy.banished.push(source);
      expect(hiddenEngine.view(state, "player").instances[ids.enemy.front[0]!]?.characteristics.spark).toBe(2);
    } finally {
      predicate.mockRestore();
    }
  });

  it("reproduces the characteristics and legal actions the view shows", () => {
    const { state, decklists, ids } = hiddenBoard([filler, handAnthem.id, filler, handTax.id]);
    const seen = hiddenEngine.view(state, "player");
    // The hand anthem and tax show on cards the player sees, though neither source does.
    expect(seen.instances[ids.enemy.front[0]!]?.characteristics.spark).toBe(2);
    expect(seen.instances[ids.player.hand[0]]?.characteristics.cost).toBe(3);
    for (const seed of SEEDS) {
      const sampled = determinize(seen, decklists, seeded(seed), hiddenCatalog);
      expect(invariantViolations(sampled, hiddenCatalog)).toEqual([]);
      expect(comparableView(hiddenEngine.view(sampled, "player"))).toEqual(comparableView(seen));
      expect(hiddenEngine.legalActions(sampled, "player")).toEqual(hiddenEngine.legalActions(state, "player"));
    }
  });

  it("dates a hidden source after a change it followed, and before one that followed it", () => {
    for (const [lostAt, vengeful] of [[3, true], [7, false]] as const) {
      const { state, decklists, ids } = hiddenBoard([filler, handVengeful.id, filler]);
      const enemy = ids.enemy.front[0]!;
      state.instances[ids.enemy.hand[1]].enteredZoneAt = 5;
      state.clock = 8;
      state.floating.push({
        id: `e${state.nextEffect}`,
        controller: "player",
        source: ids.player.front[0]!,
        timestamp: lostAt,
        expiry: { at: "endOfTurn" },
        change: { kind: "keyword", instance: enemy, keyword: "vengeful", gains: false },
      });
      state.nextEffect += 1;
      const seen = hiddenEngine.view(state, "player");
      expect(seen.instances[enemy]?.characteristics.keywords.includes("vengeful")).toBe(vengeful);
      for (const seed of SEEDS) {
        const sampled = determinize(seen, decklists, seeded(seed), hiddenCatalog);
        expect(invariantViolations(sampled, hiddenCatalog)).toEqual([]);
        expect(comparableView(hiddenEngine.view(sampled, "player"))).toEqual(comparableView(seen));
      }
    }
  });

  it("keeps the closest legal state, deterministically, when no deal from the decklists explains the view", () => {
    const { state, decklists, ids } = hiddenBoard([filler, handAnthem.id, handAnthem.id]);
    const enemy = ids.enemy.front[0]!;
    // The enemy's decklist names one hand anthem of the two the view's +2✦ needs.
    const short: Decklists = { ...decklists, enemy: [...decklists.enemy.filter((entry) => entry.cardId !== handAnthem.id), { cardId: handAnthem.id }, { cardId: filler }] };
    const seen = hiddenEngine.view(state, "player");
    expect(seen.instances[enemy]?.characteristics.spark).toBe(3);
    for (const seed of SEEDS) {
      const sampled = determinize(seen, short, seeded(seed), hiddenCatalog);
      expect(invariantViolations(sampled, hiddenCatalog)).toEqual([]);
      expect(stateHash(determinize(seen, short, seeded(seed), hiddenCatalog))).toBe(stateHash(sampled));
      expect(hiddenEngine.view(sampled, "player").instances[enemy]?.characteristics.spark).toBe(2);
    }
  });
});

function pairWithDifferentCards(state: BattleState, ids: readonly InstanceId[]): [InstanceId, InstanceId] | null {
  const card = (id: InstanceId): string => JSON.stringify(state.instances[id]?.printing);
  for (const a of ids) {
    const b = ids.find((other) => card(other) !== card(a));
    if (b !== undefined) return [a, b];
  }
  return null;
}


describe("historical plays in simulations", () => {
  it("keeps ceased and hidden public play facts and fires the same cost-bounded nth trigger", () => {
    const watcher: EngineCardDefinition = {
      ...SYNTHETIC.vanilla1, id: syntheticId(0x335), status: "authored",
      abilities: () => [triggered(whenYouPlay({ costAtLeast: 2, costAtMost: 2 }, 2), p.gainPoints(1))],
    };
    const histories = createEngine(testCatalog([watcher]));
    for (const viewer of SIDES) for (const ceased of [false, true]) {
      const { state, ids } = boardState(histories.catalog, {
        active: "player", phase: "day",
        player: { back: [watcher.id], hand: [SYNTHETIC.vanilla2.id], energy: 4, deck: [SYNTHETIC.vanilla2.id] },
        enemy: { deck: [SYNTHETIC.vanilla1.id] },
      });
      state.turnLog.played.player.push({ instance: ceased ? "i999" : ids.player.deck[0], cardType: "character", subtype: testCardSubtype("Warrior"), allTypes: false, cost: 2 });
      const seen = histories.view(state, viewer);
      expect(seen.turnLog.played.player).toEqual([{ instance: null, firstCharacterMember: null, cardType: "character", subtype: testCardSubtype("Warrior"), allTypes: false, cost: 2 }]);
      const sampled = determinize(seen, { player: [{ cardId: watcher.id }, { cardId: SYNTHETIC.vanilla2.id }, { cardId: SYNTHETIC.vanilla2.id }], enemy: [{ cardId: SYNTHETIC.vanilla1.id }] }, seeded(`history-${viewer}`), histories.catalog);
      expect(histories.view(sampled, viewer).turnLog).toEqual(seen.turnLog);
      const ghost = sampled.turnLog.played.player[0].instance;
      expect(sampled.instances[ghost]).toBeUndefined();
      expect(Number(ghost.slice(1))).toBeLessThan(sampled.nextInstance);
      const authoritative = histories.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS).state;
      const simulated = histories.apply(sampled, "player", { kind: "play", card: sampled.sides.player.hand[0], from: "hand" }, NO_PROMPTS).state;
      expect(authoritative.sides.player.score).toBe(1);
      expect(simulated.sides.player.score).toBe(authoritative.sides.player.score);
    }
  });
});
