/** Simultaneous threshold callbacks use public source order, independently of entry timestamps. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { all, characterYouControl, everyIn, staticAbility } from "../../../dsl/builders";
import type { PlayerRef } from "../../../dsl/types";
import { onDawn, triggered } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { stateHash } from "../../../state/hash";
import { SIDES, opponent, sourceKey, type AbilitySource, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { boardState } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { parseAvatarId, parseDreamsignId } from "../../../../types/identifiers";
import { gainEnergy } from "../gain-energy";
import { gainPoints } from "../gain-points";
import { materialize } from "../materialize";
import { returnToHand } from "../return-to-hand";
import { ruleModifier } from "../rule-modifier";
import { sequence } from "../sequence";
import { triggerAbility } from "../trigger-ability";
import { deck, restored, sliceOf, step } from "./rule-modifier-support";

const avatarIds = ["01", "02"].map(suffix => parseAvatarId(`00000000-0000-4000-8000-0000001740${suffix}`));
const signIds = ["01", "02", "03", "04"].map(suffix => parseDreamsignId(`00000000-0000-4000-8000-0000001741${suffix}`));
type Occasion = "phase" | "named";

function fixture(side: Side, occasion: Occasion, hidden = false, count = occasion === "phase" ? 2 : 3) {
  const held = (player: PlayerRef = "you") => [1, 2].map(amount => staticAbility(ruleModifier({
    rule: "dawnThreshold", count, effect: gainPoints(amount),
  }, player)));
  const mage = all(characterYouControl({ subtype: "Mage" }));
  const ancient = all(characterYouControl({ subtype: "Ancient" }));
  const starter: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x174001), status: "authored", abilities: () => [
    triggered(onDawn(), occasion === "phase" ? sequence() : sequence(
      returnToHand(mage), materialize(everyIn("hand", { subtype: "Mage" })), triggerAbility(ancient, "dawn"),
    )),
  ] };
  const front: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x174002), status: "authored", subtype: "Ancient",
    abilities: () => [triggered(onDawn(), gainEnergy(1)), ...held()] };
  const back: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x174003), status: "authored", subtype: "Mage", abilities: () => held() };
  const other: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x174004), status: "authored", abilities: () => held("opponent") };
  const inactive: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x174005), status: "authored", abilities: () => held() };
  const secret: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x174006), status: "authored",
    abilities: () => held().map(ability => ({ ...ability, zone: "hand" as const })) };
  const engine = createEngine(testCatalog([starter, front, back, other, inactive, secret], {
    avatars: avatarIds.map((id, index) => ({ id, status: "authored", abilities: () => held(index === 0 ? "you" : "opponent") })),
    dreamsigns: signIds.map((id, index) => ({ id, status: "authored", abilities: () => held(index < 2 ? "you" : "opponent") })),
  }));
  const w = boardState(engine.catalog, { active: side, phase: "draw", scoreToWin: 1000,
    [side]: { avatar: avatarIds[0], dreamsigns: signIds.slice(0, 2), back: [starter.id, back.id], front: [front.id], hand: hidden ? [secret.id] : [], deck },
    [opponent(side)]: { avatar: avatarIds[1], dreamsigns: signIds.slice(2), back: [other.id, inactive.id], front: [other.id], deck },
  });
  const backId = w.ids[side].back[1]!, frontId = w.ids[side].front[0]!;
  const expected = [side, opponent(side)].flatMap(owner => {
    const sources: AbilitySource[] = [{ kind: "avatar", side: owner },
      { kind: "dreamsign", side: owner, index: 0 }, { kind: "dreamsign", side: owner, index: 1 },
      owner === side ? backId : w.ids[owner].back[0]!, owner === side ? frontId : w.ids[owner].front[0]!,
      ...(owner === side && hidden ? [w.ids[side].hand[0]] : [])];
    return sources.flatMap(source => [0, 1].map(index => ({ source, ability: source === frontId ? index + 1 : index })));
  });
  return { ...w, engine, expected, backId, frontId, starterId: w.ids[side].back[0]! };
}

function queued(events: readonly EngineEvent[]) {
  return events.flatMap(event => event.kind === "triggerQueued" ? [{ source: event.source, ability: event.ability }] : []);
}
function reactions(state: BattleState) {
  return state.triggerQueue.filter(entry => entry.kind === "ruleReaction").map(({ source, ability }) => ({ source, ability }));
}
function finish(engine: ReturnType<typeof fixture>["engine"], initial: BattleState) {
  let state = initial;
  const events: EngineEvent[] = [];
  for (let i = 0; state.triggerQueue.length > 0; i++) {
    if (i > 40) throw new Error("Synthetic reaction queue did not drain");
    const result = step(engine, state, { kind: "resolveTrigger" });
    events.push(...result.events);
    state = result.state;
  }
  return { state, events };
}

const cases = SIDES.flatMap(side => (["phase", "named"] as const).map(occasion => ({ side, occasion })));
describe("threshold reaction source order", () => {
  it.each(cases)("orders the complete $occasion batch by source and ability for $side", ({ side, occasion }) => {
    const w = fixture(side, occasion), before = stateHash(w.state);
    const opening = step(w.engine, w.state, { kind: "advancePhase" });
    expect(opening.state.turnLog.dawnProgress?.total).toBe(2);
    const admitted = occasion === "phase" ? opening : step(w.engine, opening.state, { kind: "resolveTrigger" });
    if (occasion === "named") {
      expect(reactions(opening.state)).toEqual([]);
      expect(admitted.state.instances[w.backId].enteredZoneAt).toBeGreaterThan(admitted.state.instances[w.frontId].enteredZoneAt);
      expect(admitted.state.sides[side].backRank[1]).toBe(w.backId);
      expect(admitted.state.turnLog.dawnProgress?.total).toBe(3);
    }
    const ordinary = occasion === "phase" ? [{ source: w.starterId, ability: 0 }, { source: w.frontId, ability: 0 }] : [{ source: w.frontId, ability: 0 }];
    expect(queued(admitted.events)).toEqual([...ordinary, ...w.expected]);
    expect(reactions(admitted.state)).toEqual(w.expected);
    expect(stateHash(w.state)).toBe(before);
    const snapshot = stateHash(admitted.state);
    const loaded = restored(sliceOf(admitted.state)).committed;
    expect(reactions(loaded)).toEqual(w.expected);
    for (const viewer of SIDES) {
      expect(w.engine.view(loaded, viewer).triggerQueue.filter(entry => entry.kind === "ruleReaction").map(({ source, ability }) => ({ source, ability }))).toEqual(w.expected);
      expect(queued(admitted.events.flatMap(event => {
        const seen = eventSeenBy(event, viewer, admitted.state);
        return seen === null ? [] : [seen];
      }))).toEqual([...ordinary, ...w.expected]);
    }
    const resolved = finish(w.engine, admitted.state), replayed = finish(w.engine, loaded);
    expect(replayed.events).toEqual(resolved.events);
    expect(stateHash(replayed.state)).toBe(stateHash(resolved.state));
    expect(resolved.events.flatMap(event => event.kind === "triggerResolved" ? [{ source: event.source, ability: event.ability }] : [])).toEqual([
      ...admitted.state.triggerQueue.filter(entry => entry.kind !== "ruleReaction").map(({ source, ability }) => ({ source, ability })), ...w.expected,
    ]);
    expect(resolved.state.sides[side].score).toBe(30);
    expect(resolved.state.sides[opponent(side)].score).toBe(0);
    expect(stateHash(admitted.state)).toBe(snapshot);
  });

  it.each(SIDES)("keeps a hidden hand carrier private within the ordered queue for %s", side => {
    const w = fixture(side, "named", true);
    const opening = step(w.engine, w.state, { kind: "advancePhase" });
    const admitted = step(w.engine, opening.state, { kind: "resolveTrigger" });
    const hidden = w.ids[side].hand[0], other = opponent(side);
    const publicExpected = w.expected.filter(entry => sourceKey(entry.source) !== sourceKey(hidden));
    expect(reactions(admitted.state)).toEqual(w.expected);
    expect(w.engine.view(admitted.state, side).triggerQueue.filter(entry => entry.kind === "ruleReaction").map(({ source, ability }) => ({ source, ability }))).toEqual(w.expected);
    expect(w.engine.view(admitted.state, other).triggerQueue.filter(entry => entry.kind === "ruleReaction").map(({ source, ability }) => ({ source, ability }))).toEqual(publicExpected);
    const publicEvents = admitted.events.flatMap(event => {
      const seen = eventSeenBy(event, other, admitted.state);
      return seen === null ? [] : [seen];
    });
    expect(queued(publicEvents)).toEqual([{ source: w.frontId, ability: 0 }, ...publicExpected]);
    expect(finish(w.engine, restored(sliceOf(admitted.state)).committed).state.sides[side].score).toBe(33);
  });

  it.each(SIDES)("queues no callback before the threshold for %s", side => {
    const w = fixture(side, "named", false, 4);
    const opening = step(w.engine, w.state, { kind: "advancePhase" });
    const admitted = step(w.engine, opening.state, { kind: "resolveTrigger" });
    expect(admitted.state.turnLog.dawnProgress?.total).toBe(3);
    expect(reactions(admitted.state)).toEqual([]);
    expect(queued(admitted.events)).toEqual([{ source: w.frontId, ability: 0 }]);
  });
});
