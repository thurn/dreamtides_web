/** D20: Avatar costs compose with physical returns, conditional ordinals and captured turn history. */
import { expect } from "vitest";
import { createEngine } from "../../engine/engine";
import { opponent, type Side } from "../../engine/state/ids";
import { ScriptedSource } from "../../engine/steps/sources";
import { playFromHand, runScenario, type NamedScenario, type ScenarioModule, type ScenarioResult, type ScenarioSpec, type ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { ZONE_FIGMENT, ZONE_FIGMENTS } from "../../engine/testing/zone-cards";
import { H } from "../../engine/effects/primitives/contracts/turn-history.fixtures";
import { parseAvatarId } from "../../types/identifiers";
import ovanel from "../avatars/ovanel-f6208407";
import radulf from "../avatars/radulf-3ebaba62";
import serenath from "../avatars/serenath-veyl-9e19b3d1";
import yveth from "../avatars/yveth-coravel-fe2510d9";

const engine = createEngine(testCatalog(Object.values(H), { avatars: [yveth, radulf, serenath, ovanel].map(avatar => ({
  id: parseAvatarId(avatar.id), status: "authored", abilities: avatar.abilities!,
})) }, ZONE_FIGMENTS));
const deck = Array.from({ length: 12 }, () => v.vanilla0.id);
const scenarios: NamedScenario[] = [];
const activate = (side: Side): ScenarioStep => ({ side, action: { kind: "activate", source: { kind: "avatar", side }, ability: 0 } });
function add(name: string, spec: ScenarioSpec, check: (result: ScenarioResult) => void): void {
  scenarios.push({ name, spec: { board: { active: "player", phase: "day" }, steps: () => [] },
    check: () => check(runScenario(engine, spec)) });
}
function nextOwnDay(state: ScenarioResult["state"], side: Side) {
  const away = passUntil(engine, state, at(engine, opponent(side), "day"));
  return passUntil(engine, away.state, at(engine, side, "day")).state;
}

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  add(`${yveth.id} ${side} returns one physical character and replays it at its persistent reduced cost`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(yveth.id),
      back: [v.vanilla3.id, v.vanilla3.id], hand: [v.vanilla3.id], energy: 5, deck }, [other]: { deck } },
    steps: ids => [activate(side), { side, action: { kind: "play", card: ids[side].back[0]!, from: "hand" } }],
    answers: ids => [[ids[side].back[0]!]],
  }, ({ state, ids, events }) => {
    const returned = ids[side].back[0]!;
    expect(state.instances[returned].zone).toBe("play");
    expect(events).toContainEqual({ kind: "returnedToHand", instance: returned, side });
    expect(state.floating).toEqual([expect.objectContaining({ controller: side, source: { kind: "avatar", side },
      expiry: { at: "never" }, change: { kind: "cardCost", instance: returned, mode: "reduce", amount: 1 } })]);
    expect(engine.view(state, side).instances[returned].characteristics.cost).toBe(2);
    expect(engine.view(state, side).instances[ids[side].hand[0]].characteristics.cost).toBe(3);
    expect(state.instances[ids[side].back[1]!].zone).toBe("play");
    expect(state.sides[side].currentEnergy).toBe(1);
    expect(state.sides[side].avatar).toEqual({ id: parseAvatarId(yveth.id), exhausted: true });
  });
  add(`${yveth.id} ${side} returns a figment by cessation without a hand cost grant`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(yveth.id), energy: 2, deck,
      figments: [{ slot: { rank: "back", index: 0 }, printing: { kind: "figment", figment: ZONE_FIGMENT.warrior.id, spark: 1 } }] }, [other]: { deck } },
    steps: () => [activate(side)],
  }, ({ state, ids, events }) => {
    expect(state.instances[ids[side].back[0]!]).toBeUndefined();
    expect(events).toContainEqual({ kind: "ceasedToExist", instance: ids[side].back[0], side, from: "play" });
    expect(state.sides[side].hand).toEqual([]);
    expect(state.floating).toEqual([]);
    expect(state.sides[side].currentEnergy).toBe(0);
    expect(state.sides[side].avatar?.exhausted).toBe(true);
  });
  add(`${radulf.id} ${side} discounts only its first character despite an earlier Event`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(radulf.id), energy: 5, deck,
      back: [v.vanilla0.id, v.vanilla0.id, v.vanilla0.id], hand: [v.event0.id, v.vanilla3.id, v.vanilla3.id] }, [other]: { deck } },
    steps: ids => [0, 1, 2].map(index => playFromHand(ids, side, index)),
  }, ({ state, ids }) => {
    expect(state.sides[side].currentEnergy).toBe(0);
    expect(state.turnLog.played[side].map(card => card.instance)).toEqual(ids[side].hand);
    expect(state.turnLog.played[side].map(card => card.cardType)).toEqual(["event", "character", "character"]);
    for (const id of ids[side].hand.slice(1)) expect(state.instances[id].zone).toBe("play");
  });
  add(`${radulf.id} ${side} counts a first character played below the live control threshold`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(radulf.id), energy: 6, deck,
      back: [v.vanilla0.id, v.vanilla0.id], hand: [v.vanilla3.id, v.vanilla3.id] }, [other]: { deck } },
    steps: ids => [playFromHand(ids, side), playFromHand(ids, side, 1)],
  }, ({ state, ids }) => {
    expect(state.sides[side].currentEnergy).toBe(0);
    expect(state.turnLog.played[side].map(card => card.instance)).toEqual(ids[side].hand);
    expect(state.sides[side].backRank.filter(id => id !== null)).toHaveLength(4);
  });
  add(`${radulf.id} ${side} renews the first-character discount after ordinary turn transitions`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(radulf.id), energy: 8, deck,
      back: [v.vanilla0.id, v.vanilla0.id, v.vanilla0.id], hand: [v.vanilla3.id, v.vanilla3.id] }, [other]: { deck } },
    steps: ids => [playFromHand(ids, side)],
  }, ({ state, ids }) => {
    expect(state.sides[side].currentEnergy).toBe(6);
    expect(engine.view(state, side).instances[ids[side].hand[1]].characteristics.cost).toBe(3);
    const next = nextOwnDay(state, side);
    expect(next.turnLog.played[side]).toEqual([]);
    expect(engine.view(next, side).instances[ids[side].hand[1]].characteristics.cost).toBe(2);
    const played = engine.apply(next, side, { kind: "play", card: ids[side].hand[1], from: "hand" }, new ScriptedSource([]));
    expect(played.state.sides[side].currentEnergy).toBe(6);
    expect(played.state.instances[ids[side].hand[1]].zone).toBe("play");
  });
  add(`${serenath.id} ${side} pays and exhausts after only a non-figment materialization`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(serenath.id), energy: 1, deck, hand: [v.vanilla0.id] }, [other]: { deck } },
    steps: ids => [playFromHand(ids, side), activate(side)],
  }, ({ state, ids, events }) => {
    expect(state.instances[ids[side].hand[0]].zone).toBe("play");
    expect(events.filter(event => event.kind === "cardDrawn")).toEqual([]);
    expect(state.sides[side].currentEnergy).toBe(0);
    expect(state.sides[side].avatar?.exhausted).toBe(true);
  });
  add(`${serenath.id} ${side} remembers a ceased figment but not its prior turn`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(serenath.id), energy: 1, deck, hand: [H.figment.id, H.kill.id] }, [other]: { deck } },
    steps: ids => [playFromHand(ids, side), playFromHand(ids, side, 1), activate(side)],
  }, ({ state, ids, events }) => {
    const materialized = events.find(event => event.kind === "materialized");
    if (materialized?.kind !== "materialized") throw new Error("Missing actual figment materialization");
    expect(state.instances[materialized.instance]).toBeUndefined();
    expect(events.filter(event => event.kind === "cardDrawn")).toEqual([{ kind: "cardDrawn", side, instance: ids[side].deck[0] }]);
    expect(state.sides[side].avatar?.exhausted).toBe(true);
    const next = nextOwnDay(state, side);
    const activated = engine.apply(next, side, activate(side).action, new ScriptedSource([]));
    expect(activated.events.filter(event => event.kind === "cardDrawn")).toEqual([]);
    expect(activated.state.sides[side].currentEnergy).toBe(0);
    expect(activated.state.sides[side].avatar?.exhausted).toBe(true);
  });
  add(`${ovanel.id} ${side} pays and exhausts after only a character play`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(ovanel.id), energy: 2, deck, hand: [v.vanilla0.id] }, [other]: { deck } },
    steps: ids => [playFromHand(ids, side), activate(side)],
  }, ({ state, events }) => {
    expect(events.filter(event => event.kind === "cardDrawn")).toEqual([]);
    expect(state.sides[side].currentEnergy).toBe(0);
    expect(state.sides[side].avatar?.exhausted).toBe(true);
  });
  add(`${ovanel.id} ${side} draws its first matching physical Event and forgets the prior turn`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(ovanel.id), energy: 2,
      deck: [v.vanilla3.id, v.event1.id, v.event0.id, ...deck], hand: [v.event0.id] }, [other]: { deck } },
    steps: ids => [playFromHand(ids, side), activate(side)],
  }, ({ state, ids, events }) => {
    expect(events.filter(event => event.kind === "cardDrawn")).toEqual([{ kind: "cardDrawn", side, instance: ids[side].deck[1] }]);
    expect(state.sides[side].deck).toEqual(ids[side].deck.filter((_, index) => index !== 1));
    expect(state.sides[side].hand).toEqual([ids[side].deck[1]]);
    expect(state.turnLog.played[side].map(card => card.instance)).toEqual(ids[side].hand);
    expect(state.sides[side].currentEnergy).toBe(0);
    const next = nextOwnDay(state, side);
    const activated = engine.apply(next, side, activate(side).action, new ScriptedSource([]));
    expect(activated.events.filter(event => event.kind === "cardDrawn")).toEqual([]);
    expect(activated.state.sides[side].currentEnergy).toBe(0);
    expect(activated.state.sides[side].avatar?.exhausted).toBe(true);
  });
  add(`${ovanel.id} ${side} excludes an opponent Event played in response to its character`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(ovanel.id), energy: 2, deck, hand: [v.vanilla0.id] },
      [other]: { hand: [v.interruptEvent.id], energy: 1, deck } },
    steps: ids => [playFromHand(ids, side), playFromHand(ids, other), activate(side)],
  }, ({ state, ids, events }) => {
    expect(state.turnLog.played[other].map(card => card.instance)).toEqual(ids[other].hand);
    expect(state.turnLog.played[side].map(card => card.cardType)).toEqual(["character"]);
    expect(events.filter(event => event.kind === "cardDrawn")).toEqual([]);
    expect(state.sides[side].currentEnergy).toBe(0);
    expect(state.sides[side].avatar?.exhausted).toBe(true);
  });
}

export default { slug: "avatars-05", scenarios } satisfies ScenarioModule;
