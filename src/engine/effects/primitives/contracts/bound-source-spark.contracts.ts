/**
 * `thisCharacterSpark()` as a bound (rules § Targeting → Bounds that count,
 * § Spark → This character's ✦; RD-hv-umm2.501-1): Pastward Wanderer's
 * "Choose an event in your void with cost less than or equal to this
 * character's ✦" and Cloaked Sentinel's "Abandon this character: Dissolve an
 * enemy with ✦ less than or equal to this character's ✦". The bound reads
 * the source's effective spark while it is in play, as targets are offered
 * and again as the effect resolves, and once the source has left play the
 * effective spark it had just before it left (RD-hv-umm2.460-1). A static
 * ability cannot read it.
 */
import { describe, expect, it } from "vitest";
import type { CardSubtype } from "../../../../types/card-identity";
import type { EngineCardDefinition } from "../../../catalog";
import { characteristics } from "../../../continuous/characteristics";
import { abandonSelfCost, activated, all, characterYouControl, energy, enemyCharacter, fromVoid, staticAbility, supported, target } from "../../../dsl/builders";
import { matchingCharacters } from "../../../dsl/selectors";
import { onDawn, triggered } from "../../../dsl/triggers";
import { thisCharacterSpark } from "../../../dsl/values";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { hasKeyword } from "../../../rules/keywords";
import { effectiveSpark } from "../../../rules/spark";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations, promptRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { dissolve } from "../dissolve";
import { grantReclaim } from "../grant-reclaim";
import { sparkModifier } from "../spark-modifier";
import { decklists } from "./with-materialized-support";

function character(index: number, subtype: CardSubtype, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition {
  return { id: syntheticId(0x47100 + index), cardType: "character", costs: [energy(0)], spark: 2, subtype, speed: "standard", status: "authored", abilities };
}
function eventCosting(cost: number): EngineCardDefinition {
  return { id: syntheticId(0x47180 + cost), cardType: "event", costs: [energy(cost)], spark: null, subtype: "", speed: "standard", status: "authored", abilities: () => [] };
}

const voidEventsUpToSpark = () => grantReclaim(fromVoid({ cardType: "event" }, { costAtMost: thisCharacterSpark() }), { costs: [energy(0)] });
const G = {
  /** "▸Dawn: Choose an event in your void with cost ≤ this character's ✦. That event gains reclaim 0●." */
  wanderer: character(0, "Explorer", () => [triggered(onDawn(), voidEventsUpToSpark())]),
  /** "Abandon this character: Dissolve an enemy with ✦ ≤ this character's ✦." */
  sentinel: character(1, "Explorer", () => [activated([abandonSelfCost()], dissolve(target(enemyCharacter({ sparkAtMost: thisCharacterSpark() }))))]),
  /** "0●: Choose an event in your void with cost ≤ this character's ✦. That event gains reclaim 0●." */
  keeper: character(2, "Explorer", () => [activated([energy(0)], voidEventsUpToSpark())]),
  /** "▸Dawn: Dissolve each Explorer you control." */
  killer: character(3, "Warrior", () => [triggered(onDawn(), dissolve(all(characterYouControl({ subtype: "Explorer" }))))]),
  /** Supported characters have +3✦. */
  supporter: character(4, "Warrior", () => [staticAbility(sparkModifier(supported(), 3))]),
  /** A static ability holding the bound, which the content gate rejects. */
  staticReader: character(5, "Warrior", () => [staticAbility(sparkModifier(all(characterYouControl({ sparkAtMost: thisCharacterSpark() })), 1))]),
} as const;
const EVENTS = [1, 2, 3, 4, 5, 6].map(eventCosting);
const E = createEngine(testCatalog([...Object.values(G), ...EVENTS]));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];
const VOID = EVENTS.map((card) => card.id);

function setup(player: SideSetup, enemy: SideSetup = {}, active: Side = "player") {
  return boardState(E.catalog, { active, phase: "day", player: { deck, energy: 5, ...player }, enemy: { deck, energy: 5, ...enemy } });
}
function act(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const result = E.apply(state, side, action, answers.length === 0 ? NO_PROMPTS : source);
  if (answers.length > 0) source.assertExhausted();
  expect(invariantViolations(result.state, E.catalog)).toEqual([]);
  return result;
}
function id(value: InstanceId | null | undefined): InstanceId {
  if (value === null || value === undefined) throw new Error("missing instance");
  return value;
}
/** `state` with `instance`'s gained spark set, as a fresh object no layer evaluation has memoized. */
function gained(state: BattleState, instance: InstanceId, spark: number): BattleState {
  const card = state.instances[instance];
  return { ...state, instances: { ...state.instances, [instance]: { ...card, status: { ...card.status, gainedSpark: spark } } } };
}
const reclaimable = (state: BattleState, card: InstanceId) => hasKeyword(state, E.catalog, card, "reclaim");
const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`failed fold outcome ${JSON.stringify(outcome)}`);
  return outcome.slice;
};
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });

/** Answers each target prompt with its last candidate, the costliest void event offered, and keeps the prompts. */
class LastCandidate implements AnswerSource {
  readonly prompts: Prompt[] = [];
  answer(prompt: Prompt): Answer {
    if (prompt.kind !== "chooseTargets") throw new Error(`unexpected ${prompt.kind} prompt`);
    this.prompts.push(prompt);
    return prompt.candidates.slice(-1);
  }
}

/** Passes from the enemy's Day through the player's Dawn, answering its target prompts with `LastCandidate`. */
function throughDawn(player: SideSetup) {
  const { state, ids } = setup({ void: VOID, ...player }, {}, "enemy");
  const source = new LastCandidate();
  const run = passUntil(E, state, at(E, "player", "day"), source);
  expect(invariantViolations(run.state, E.catalog)).toEqual([]);
  return { ...run, ids, prompts: source.prompts };
}

describe("a void target bounded by this character's ✦", () => {
  it("offers events up to the in-play source's effective ✦ at Dawn, Support included", () => {
    const run = throughDawn({ back: [v.vanilla0.id, G.supporter.id], front: [G.wanderer.id] });
    const voids = run.ids.player.void;
    expect(run.prompts.map((prompt) => prompt.kind === "chooseTargets" ? prompt.candidates : null)).toEqual([voids.slice(0, 5)]);
    expect(voids.map((card) => reclaimable(run.state, card))).toEqual([false, false, false, false, true, false]);
  });

  it("offers and re-checks against the last-known ✦ when an earlier Dawn trigger dissolved its source", () => {
    const run = throughDawn({ back: [G.killer.id, G.supporter.id], front: [G.wanderer.id] });
    const wanderer = id(run.ids.player.front[0]);
    expect(run.state.instances[wanderer]?.zone).toBe("void");
    expect(run.events).toContainEqual({ kind: "leftPlay", instance: wanderer, side: "player", to: "void", spark: 5 });
    // Its effective spark in the void is 2; it offered events up to 5●, and the 5● event chosen still met the bound as it resolved.
    expect(effectiveSpark(run.state, E.catalog, wanderer)).toBe(2);
    const voids = run.ids.player.void;
    expect(run.prompts.map((prompt) => prompt.kind === "chooseTargets" ? prompt.candidates : null)).toEqual([voids.slice(0, 5)]);
    expect(voids.map((card) => reclaimable(run.state, card))).toEqual([false, false, false, false, true, false]);
    expect(run.events.filter((event) => event.kind === "noLegalTarget")).toEqual([]);
  });

  it("re-checks the bound as the effect resolves: a chosen event above the source's lowered ✦ gains nothing", () => {
    const { state, ids } = setup({ front: [G.keeper.id], void: VOID }, { hand: [v.interruptEvent.id] });
    const keeper = id(ids.player.front[0]);
    const four = id(ids.player.void[3]);
    const boosted = gained(state, keeper, 2);
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(boosted), { kind: "battleAction", side: "player", action: { kind: "activate", source: keeper, ability: 0 } }));
    const pending = fold.pending(opened);
    if (pending?.prompt.kind !== "chooseTargets") throw new Error("expected the void target prompt");
    expect(pending.prompt.candidates).toEqual(ids.player.void.slice(0, 4));
    const cast = act(boosted, "player", { kind: "activate", source: keeper, ability: 0 }, [[four]]);
    expect(cast.state.stack).toHaveLength(1);
    const kept = act(cast.state, "enemy", { kind: "pass" });
    expect(reclaimable(kept.state, four)).toBe(true);
    const lowered = act(gained(cast.state, keeper, 1), "enemy", { kind: "pass" });
    expect(lowered.events).toContainEqual({ kind: "noLegalTarget", source: keeper });
    expect(reclaimable(lowered.state, four)).toBe(false);
  });
});

describe("a character target bounded by this character's ✦", () => {
  /** Cloaked Sentinel supported to 5✦ in F0, facing 2✦, 5✦ and 8✦ enemies. */
  const sentinelBoard = (enemyBack = [v.vanilla2.id, v.vanilla5.id, v.vanilla8.id]) =>
    setup({ back: [v.vanilla0.id, G.supporter.id], front: [G.sentinel.id] }, { back: enemyBack, hand: [v.interruptEvent.id] });

  it("offers enemies up to the source's ✦ as targets are chosen, before the abandon cost removes it", () => {
    const { state, ids } = sentinelBoard();
    const sentinel = id(ids.player.front[0]);
    const [two, five] = ids.enemy.back.map(id);
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "activate", source: sentinel, ability: 0 } }));
    const pending = fold.pending(opened);
    if (pending?.prompt.kind !== "chooseTargets") throw new Error("expected the enemy target prompt");
    expect(pending.prompt.candidates).toEqual([two, five]);
    expect(promptRedactionViolations(pending.prompt, pending.display, E.catalog)).toEqual([]);
  });

  it("cannot be activated while every enemy's ✦ is above the source's", () => {
    const { state, ids } = sentinelBoard([v.vanilla8.id]);
    const sentinel = id(ids.player.front[0]);
    expect(E.legalActions(state, "player")).not.toContainEqual(expect.objectContaining({ kind: "activate", source: sentinel }));
    const reachable = sentinelBoard([v.vanilla5.id]);
    expect(E.legalActions(reachable.state, "player")).toContainEqual({ kind: "activate", source: id(reachable.ids.player.front[0]), ability: 0 });
  });

  it("re-checks the chosen enemy against the abandoned source's last-known ✦, not 0 or its ✦ in the void", () => {
    const { state, ids } = sentinelBoard();
    const sentinel = id(ids.player.front[0]);
    const five = id(ids.enemy.back[1]);
    const cast = act(state, "player", { kind: "activate", source: sentinel, ability: 0 }, [[five]]);
    expect(cast.state.instances[sentinel]?.zone).toBe("void");
    expect(effectiveSpark(cast.state, E.catalog, sentinel)).toBe(2);
    expect(cast.state.stack).toEqual([expect.objectContaining({ kind: "ability", source: sentinel, lastKnownSourceSpark: 5 })]);
    const resolved = act(cast.state, "enemy", { kind: "pass" });
    expect(resolved.state.instances[five]?.zone).toBe("void");
    expect(eventRedactionViolations(resolved.events, cast.state, resolved.state)).toEqual([]);
  });

  it("skips a chosen enemy whose ✦ rose above the retained ✦ before it resolves", () => {
    const { state, ids } = sentinelBoard();
    const sentinel = id(ids.player.front[0]);
    const five = id(ids.enemy.back[1]);
    const cast = act(state, "player", { kind: "activate", source: sentinel, ability: 0 }, [[five]]);
    const resolved = act(gained(cast.state, five, 1), "enemy", { kind: "pass" });
    expect(resolved.events).toContainEqual({ kind: "noLegalTarget", source: sentinel });
    expect(resolved.state.instances[five]?.zone).toBe("play");
  });

  it("keeps the retained bound across a saved-state reload, determinization and every view", () => {
    const { state, ids } = sentinelBoard();
    const sentinel = id(ids.player.front[0]);
    const five = id(ids.enemy.back[1]);
    const cast = act(state, "player", { kind: "activate", source: sentinel, ability: 0 }, [[five]]);
    const loaded = deserializeState(serializeState(cast.state));
    expect(stateHash(loaded)).toBe(stateHash(cast.state));
    for (const viewer of SIDES) expect(E.view(loaded, viewer).stack).toEqual([expect.objectContaining({ lastKnownSourceSpark: 5 })]);
    expect(determinizationDivergences(E, loaded, decklists(loaded), battleSeed("bound-source-spark"), 0)).toEqual([]);
    const direct = act(cast.state, "enemy", { kind: "pass" });
    const reloaded = act(loaded, "enemy", { kind: "pass" });
    expect(stateHash(reloaded.state)).toBe(stateHash(direct.state));
    expect(reloaded.state.instances[five]?.zone).toBe("void");
  });

  it("keeps its target prompt across a reload, bounces other-side, out-of-bound and stale answers, and resolves identically", () => {
    const { state, ids } = sentinelBoard();
    const sentinel = id(ids.player.front[0]);
    const [, five, eight] = ids.enemy.back.map(id);
    const action: Action = { kind: "activate", source: sentinel, ability: 0 };
    const inline = act(state, "player", action, [[five]]);
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action }));
    const reloaded: BattleSlice = { ...(JSON.parse(JSON.stringify(opened)) as BattleSlice), committed: deserializeState(serializeState(opened.committed)) };
    const fresh = createFoldAdapter(E, { checkEventPrefix: true });
    const pending = fresh.pending(reloaded);
    if (pending?.prompt.kind !== "chooseTargets") throw new Error("no target prompt after reload");
    expect(fresh.reduce(reloaded, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [five] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [eight] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const answered = applied(fresh.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [five] }));
    expect(fresh.reduce(answered, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [five] })).toMatchObject({ kind: "bounced" });
    expect(stateHash(answered.committed)).toBe(stateHash(inline.state));
  });
});

describe("this character's ✦ outside a resolving or targeting ability", () => {
  it("rejects a selector bound read with no source spark reader, as in the layer evaluation of a static ability", () => {
    const { state, ids } = setup({ back: [v.vanilla2.id] });
    const selector = characterYouControl({ sparkAtMost: thisCharacterSpark() });
    expect(() => matchingCharacters(state, E.catalog, selector, "player", id(ids.player.back[0]))).toThrow("A static ability cannot read this character's ✦");
    expect(matchingCharacters(state, E.catalog, selector, "player", id(ids.player.back[0]), undefined, () => 2)).toEqual([ids.player.back[0]]);
    const holding = setup({ back: [G.staticReader.id] });
    expect(() => characteristics(holding.state, E.catalog).of(id(holding.ids.player.back[0]))).toThrow("A static ability cannot read this character's ✦");
  });
});
