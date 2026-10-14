/** D20: spark emblems compose with static figment spark, departure, batches and play-entry chronology. */
import { expect } from "vitest";
import { event, keyword } from "../../engine/dsl/builders";
import { contentDreamsignDefinitions } from "../../engine/content-catalog";
import { erode } from "../../engine/effects/primitives/erode";
import { createEngine } from "../../engine/engine";
import type { EngineEvent } from "../../engine/events";
import { effectiveSpark } from "../../engine/rules/spark";
import { deserializeState, serializeState, stateHash } from "../../engine/state/hash";
import { opponent, type Side } from "../../engine/state/ids";
import { NO_PROMPTS } from "../../engine/steps/sources";
import { runScenario, playFromHand, type NamedScenario, type ScenarioModule, type ScenarioResult, type ScenarioSpec } from "../../engine/testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { parseDreamsignId } from "../../types/identifiers";
import { SYNTHETIC_ABANDONER } from "./abandonment-fixture";

const RUNE = parseDreamsignId("dec81fa2-7865-448c-95bc-622b884cea9e");
const GOLD = parseDreamsignId("adc23870-55f8-4f23-b973-a358fc257414");
const HEART = parseDreamsignId("8b87b0c7-e7d5-4c53-b99b-b1e2407cb519");
const CANDLE = parseDreamsignId("89c83d7e-5617-49b4-b6cd-214680fe0627");
const protectedCard = { ...v.vanilla2, id: syntheticId(0x66201), abilities: () => [keyword("cannotBeTargeted")] };
const erodeThree = { ...v.event0, id: syntheticId(0x66202), abilities: () => [event(erode(3))] };
const local = createEngine(testCatalog([protectedCard, erodeThree, SYNTHETIC_ABANDONER], {
  dreamsigns: contentDreamsignDefinitions().filter((entry) => [RUNE, GOLD, HEART, CANDLE].includes(entry.id)),
}));
const deck = Array.from({ length: 8 }, () => v.event0.id);
const scenarios: NamedScenario[] = [];
const gains = (events: readonly EngineEvent[]) => events.filter((e): e is Extract<EngineEvent, { kind: "sparkGained" }> => e.kind === "sparkGained");
const resolved = (events: readonly EngineEvent[], side: Side) => events.filter((e): e is Extract<EngineEvent, { kind: "triggerResolved" }> => e.kind === "triggerResolved" &&
  typeof e.source === "object" && e.source !== null && e.source.kind === "dreamsign" && e.source.side === side);
function add(id: typeof RUNE, side: Side, name: string, spec: ScenarioSpec, check: (result: ScenarioResult) => void): void {
  scenarios.push({ name: `${id} ${side} ${name}`, spec, check });
}
function goldSpec(side: Side, populated: boolean): ScenarioSpec {
  return { board: { active: side, phase: "day", [side]: { dreamsigns: [GOLD, GOLD, RUNE], back: [SYNTHETIC_ABANDONER.id],
    ...(populated ? { figments: [{ slot: { rank: "back" as const, index: 1 }, printing: { kind: "figmentCopy" as const, cardId: v.vanilla2.id, spark: null } }] } : {}), deck },
    [opponent(side)]: { back: [v.vanilla8.id], deck } },
    steps: (ids) => [{ side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } }],
    ...(populated ? { answers: (ids: ScenarioResult["ids"]) => [[ids[side].back[0]!]] } : {}),
  };
}
for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  add(RUNE, side, "static figment copies change the current maximum without gaining spark", {
    board: { active: side, phase: "day", [side]: { dreamsigns: [RUNE, RUNE, CANDLE, CANDLE], back: [v.vanilla3.id],
      figments: [{ slot: { rank: "back", index: 1 }, printing: { kind: "figmentCopy", cardId: v.vanilla2.id, spark: null } }], hand: [v.event0.id], deck },
      [other]: { figments: [{ slot: { rank: "back", index: 0 }, printing: { kind: "figmentCopy", cardId: v.vanilla2.id, spark: null } }], deck } },
    steps: (ids) => [playFromHand(ids, side)],
  }, (r) => {
    const figment = r.ids[side].back[1]!;
    expect(effectiveSpark(r.start, local.catalog, figment)).toBe(4);
    expect(r.start.instances[figment].status.gainedSpark).toBe(0);
    expect(effectiveSpark(r.start, local.catalog, r.ids[side].back[0]!)).toBe(3);
    expect(gains(r.events).map((e) => [e.instance, e.amount, e.expiry])).toEqual([[figment, 1, { at: "never" }], [figment, 1, { at: "never" }]]);
    expect(effectiveSpark(r.state, local.catalog, figment)).toBe(6);
    expect(effectiveSpark(r.state, local.catalog, r.ids[other].back[0]!)).toBe(2);
    expect(r.state.rng["random:selection"] ?? 0).toBe(0);
  });
  add(GOLD, side, "paid departure leaves a protected figment eligible for each held emblem", goldSpec(side, true), (witness) => {
    const recipient = witness.ids[side].back[1]!;
    expect(gains(witness.events).map((e) => e.instance)).toEqual([recipient, recipient]);
    expect(witness.state.instances[witness.ids[side].back[0]!].zone).toBe("void");
    const spec = goldSpec(side, true);
    const mine = spec.board[side]!;
    const r = runScenario(local, { ...spec, board: { ...spec.board, [side]: { ...mine,
      figments: [{ slot: { rank: "back", index: 1 }, printing: { kind: "figmentCopy", cardId: protectedCard.id, spark: null } }],
    } } });
    const target = r.ids[side].back[1]!;
    expect(gains(r.events).map((e) => [e.instance, e.amount, e.expiry])).toEqual([[target, 1, { at: "never" }], [target, 1, { at: "never" }]]);
    expect(effectiveSpark(r.state, local.catalog, target)).toBe(5);
    expect(r.state.rng["random:selection"]).toBe(2);
    expect(r.state.instances[r.ids[other].back[0]!].status.gainedSpark).toBe(0);
    expect(resolved(r.events, side)).toHaveLength(2);
    const ceased = runScenario(local, { ...spec, answers: (ids) => [[ids[side].back[1]!]] });
    const departed = ceased.ids[side].back[1]!;
    expect(ceased.events).toContainEqual(expect.objectContaining({ kind: "ceasedToExist", instance: departed }));
    expect(ceased.state.instances[departed]).toBeUndefined();
    expect(gains(ceased.events).map((e) => e.instance)).toEqual([ceased.ids[side].back[0], ceased.ids[side].back[0]]);
  });
  add(GOLD, side, "abandoning the sole controlled character spends no random draw", goldSpec(side, false), (r) => {
    expect(r.events.filter((e) => e.kind === "abandoned")).toHaveLength(1);
    expect(resolved(r.events, side)).toHaveLength(2);
    expect(gains(r.events)).toEqual([]);
    expect(r.state.rng["random:selection"] ?? 0).toBe(0);
    expect(r.state.instances[r.ids[side].back[0]!].zone).toBe("void");
  });
  const heartWitness: ScenarioSpec = { board: { active: side, phase: "day", [side]: {
    dreamsigns: [HEART, HEART], back: [v.vanilla1.id], hand: [v.erodeOne.id], deck: [v.event0.id],
  }, [other]: { deck } }, steps: (ids) => [playFromHand(ids, side)] };
  add(HEART, side, "batch occurrences and held copies survive reload while Fatigue erodes no card", heartWitness, (witness) => {
    expect(gains(witness.events).map((e) => e.instance)).toEqual([witness.ids[side].back[0], witness.ids[side].back[0]]);
    const r = runScenario(local, { board: { active: side, phase: "day", scoreToWin: 100, [side]: {
      dreamsigns: [HEART, HEART, RUNE], hand: [erodeThree.id, v.erodeOne.id], deck: [v.event0.id, v.event0.id],
      figments: [{ slot: { rank: "back", index: 0 }, printing: { kind: "figmentCopy", cardId: protectedCard.id, spark: null } }],
    }, [other]: { deck } }, steps: (ids) => [playFromHand(ids, side)] });
    const recipient = r.ids[side].back[0]!;
    expect(r.events.filter((e) => e.kind === "eroded").map((e) => e.kind === "eroded" ? e.instance : null)).toEqual(r.ids[side].deck);
    expect(gains(r.events).map((e) => [e.instance, e.amount])).toEqual(Array.from({ length: 4 }, () => [recipient, 1]));
    expect(resolved(r.events, side)).toHaveLength(4);
    expect(r.events.filter((e) => e.kind === "fatigue")).toHaveLength(1);
    expect(effectiveSpark(r.state, local.catalog, recipient)).toBe(7);
    expect(r.state.rng["random:selection"]).toBe(4);
    const loaded = deserializeState(serializeState(r.state));
    expect(stateHash(loaded)).toBe(stateHash(r.state));
    const next = local.apply(loaded, side, { kind: "play", card: r.ids[side].hand[1], from: "hand" }, NO_PROMPTS);
    const original = local.apply(r.state, side, { kind: "play", card: r.ids[side].hand[1], from: "hand" }, NO_PROMPTS);
    expect(stateHash(next.state)).toBe(stateHash(original.state));
    expect(next.events.filter((e) => e.kind === "eroded")).toEqual([]);
    expect(gains(next.events)).toEqual([]);
    expect(next.events.filter((e) => e.kind === "fatigue")).toHaveLength(1);
    expect(next.state.rng["random:selection"]).toBe(4);
  });
  add(HEART, side, "an Erode with an empty controlled pool never redirects to the other holder", {
    board: { active: side, phase: "day", [side]: { dreamsigns: [HEART], hand: [v.erodeOne.id], deck: [v.event0.id] },
      [other]: { dreamsigns: [HEART], back: [v.vanilla5.id], deck } }, steps: (ids) => [playFromHand(ids, side)],
  }, (r) => {
    expect(r.events.filter((e) => e.kind === "eroded")).toHaveLength(1);
    expect(resolved(r.events, side)).toHaveLength(1);
    expect(resolved(r.events, other)).toEqual([]);
    expect(gains(r.events)).toEqual([]);
    expect(r.state.rng["random:selection"] ?? 0).toBe(0);
  });
  add(CANDLE, side, "real play-entry age chooses one tied maximum for both held emblems", {
    board: { active: side, phase: "day", [side]: { dreamsigns: [CANDLE, CANDLE], energy: 10,
      hand: [v.vanilla3.id, v.vanilla3.id, v.event0.id], deck }, [other]: { deck } },
    steps: (ids) => [{ side, action: { kind: "play", card: ids[side].hand[0], from: "hand", slot: { rank: "back", index: 7 } } },
      { side, action: { kind: "play", card: ids[side].hand[1], from: "hand", slot: { rank: "back", index: 0 } } }, playFromHand(ids, side, 2)],
  }, (r) => {
    const older = r.ids[side].hand[0], younger = r.ids[side].hand[1];
    expect(r.state.instances[older].enteredZoneAt).toBeLessThan(r.state.instances[younger].enteredZoneAt);
    expect(gains(r.events).map((e) => [e.instance, e.amount])).toEqual([[older, 1], [older, 1]]);
    expect(resolved(r.events, side)).toHaveLength(2);
    expect(effectiveSpark(r.state, local.catalog, older)).toBe(5);
    expect(effectiveSpark(r.state, local.catalog, younger)).toBe(3);
    expect(r.state.rng["random:selection"] ?? 0).toBe(0);
  });
}
export default { slug: "dreamsigns-ready-245", scenarios } satisfies ScenarioModule;
