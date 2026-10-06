/** Determinization (D22): sampled states are legal, match the view, are seeded, and never read hidden information. */
import { describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import { randomLegalAnswer } from "../prompts/answers";
import { stateHash } from "../state/hash";
import type { InstanceId, Side } from "../state/ids";
import { battleSeed, opponent, SIDES } from "../state/ids";
import type { BattleState, CardInstance, DeckEntry } from "../state/types";
import { InlineSource } from "../steps/sources";
import { fuzzEngineCatalog, fuzzInit, SYNTHETIC_FUZZ_POOL } from "../testing/fuzz";
import { invariantViolations } from "../testing/invariants";
import { PolicyRandom, randomAction } from "../testing/random-policy";
import { hiddenFrom } from "../testing/redaction";
import { determinize, type Decklists } from "./determinize";
import type { BattleView } from "./view";

const engine = createEngine(fuzzEngineCatalog(SYNTHETIC_FUZZ_POOL));

function randomSource(random: PolicyRandom): InlineSource {
  const answer = (prompt: Parameters<typeof randomLegalAnswer>[0]) => randomLegalAnswer(prompt, () => random.next());
  return new InlineSource({ player: answer, enemy: answer });
}

/** Plays up to `actions` Random-policy actions from `state`, checking invariants at the end. */
function playOn(state: BattleState, random: PolicyRandom, actions: number): BattleState {
  let current = state;
  for (let count = 0; count < actions && current.result === null; count++) {
    const pending = engine.decision(current);
    if (pending === null) throw new Error("no decision and no result");
    const action = randomAction(engine.legalActions(current, pending.side), random);
    current = engine.apply(current, pending.side, action, randomSource(random)).state;
  }
  return current;
}

/** Mid-game states of seeded Random games, with their decklists. */
function samples(): { state: BattleState; decklists: Decklists }[] {
  const result: { state: BattleState; decklists: Decklists }[] = [];
  for (let game = 0; game < 3; game++) {
    const init = fuzzInit(battleSeed(`determinize-${String(game)}`), SYNTHETIC_FUZZ_POOL);
    const random = new PolicyRandom(battleSeed(`determinize-policy-${String(game)}`));
    let state = engine.createBattle(init, randomSource(random)).state;
    for (let round = 0; round < 4 && state.result === null; round++) {
      state = playOn(state, random, 40);
      if (state.result === null) result.push({ state, decklists: init.decks });
    }
  }
  return result;
}

const SAMPLES = samples();

function seeded(label: string): () => number {
  const random = new PolicyRandom(battleSeed(label));
  return () => random.next();
}

/** A view without the parts determinization rebuilds approximately (see determinize.ts). */
function comparable(seen: BattleView): unknown {
  const { triggerQueue, payable, instances, ...rest } = seen;
  return {
    ...rest,
    instances: Object.fromEntries(Object.entries(instances).map(([id, { characteristics: _characteristics, ...instance }]) => [id, instance])),
    triggerQueue: triggerQueue.filter((trigger) => trigger.source !== null),
    payable: payable.map(({ source: _source, ...effect }) => effect),
  };
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
        const later = playOn(sampled, new PolicyRandom(battleSeed(`legal-play-${String(index)}`)), 30);
        expect(invariantViolations(later, engine.catalog)).toEqual([]);
      }
    });
  });

  it("looks to the viewer exactly as the real state does", () => {
    SAMPLES.forEach(({ state, decklists }, index) => {
      for (const viewer of SIDES) {
        const seen = engine.view(state, viewer);
        const sampled = determinize(seen, decklists, seeded(`view-${String(index)}-${viewer}`), engine.catalog);
        expect(comparable(engine.view(sampled, viewer))).toEqual(comparable(seen));
      }
    });
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

function pairWithDifferentCards(state: BattleState, ids: readonly InstanceId[]): [InstanceId, InstanceId] | null {
  const card = (id: InstanceId): string => JSON.stringify(state.instances[id]?.printing);
  for (const a of ids) {
    const b = ids.find((other) => card(other) !== card(a));
    if (b !== undefined) return [a, b];
  }
  return null;
}

