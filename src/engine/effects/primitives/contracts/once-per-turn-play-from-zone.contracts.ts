import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCost, activated, additionalCost, energy, fromVoid as voidTarget, keyword, staticAbility, thisCardIn } from "../../../dsl/builders";
import { playPermission } from "../../../continuous/permissions";
import { createEngine, IllegalAction } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { oncePerTurnKey } from "../../../rules/activation";
import { cloneState } from "../../../state/clone";
import { cycleHash, loopResources, loopSignature } from "../../../loops/signature";
import { addFloating } from "../../../rules/floating";
import { registerPayable } from "../../../rules/payable";
import { parseAvatarId, parseDreamsignId } from "../../../../types/identifiers";
import { gainPoints } from "../gain-points";
import { battleSeed } from "../../../state/ids";
import { stateHash } from "../../../state/hash";
import { boardState, type SideSetup } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId } from "../../../testing/synthetic-cards";
import { zoneCatalog } from "../../../testing/zone-cards";
import { banishCards } from "../banish-cards";
import { gainAbilities } from "../gain-abilities";
import { PREVENTER, SELF } from "./play-self-from-zone-support";
import { playRoutes } from "../../../rules/timing";
import type { BattleState } from "../../../state/types";
import { at, passUntil } from "../../../testing/trigger-harness";
import { ZONE } from "../../../testing/zone-cards";
import { playFromZone } from "../play-from-zone";
import { v } from "./cards-support";
import { act, activate, Answering, filler, fromVoid, PERMIT, zoneOf } from "./play-from-zone-support";

const once = () => staticAbility(playFromZone("void", { cardType: "event" }, { oncePerTurn: true }));
const onceCards = {
  source: { ...PERMIT.anything, id: syntheticId(0x7c80), costs: [energy(0)], abilities: () => [keyword("awakened"), once()] },
  double: { ...PERMIT.anything, id: syntheticId(0x7c81), abilities: () => [keyword("awakened"), once(), keyword("vengeful"), once()] },
  collector: { ...PERMIT.anything, id: syntheticId(0x7c82), abilities: () => [activated([], gainAbilities(banishCards([voidTarget({ cardType: "character" })])))] },
  characters: { ...PERMIT.anything, id: syntheticId(0x7c83), abilities: () => [staticAbility(playFromZone("void", { cardType: "character" }))] },
  costSource: { ...v.event0, id: syntheticId(0x7c86), status: "authored" as const, abilities: () => [additionalCost(abandonCost())] },
  resolutionFail: { ...v.event0, id: syntheticId(0x7c87), synthetic: { resolve() { throw new Error("synthetic resolution failure"); } } },
  voidSource: { ...PERMIT.anything, id: syntheticId(0x7c89), abilities: () => [keyword("awakened"), staticAbility(playFromZone("void", { cardType: "event" }, { oncePerTurn: true }), { zone: "void" })] },
  donor: { ...PERMIT.anything, id: syntheticId(0x7c8a), abilities: () => [once()] },
  paidGain: { ...v.event0, id: syntheticId(0x7c8b), synthetic: { resolve(ctx, item) {
    const source = ctx.state.sides.player.backRank[0]!;
    const effect = registerPayable(ctx, "player", 0, item.instance, [source]);
    addFloating(ctx, { controller: "player", source: item.instance, expiry: { at: "paid", effect },
      change: { kind: "abilities", instance: source, cardId: syntheticId(0x7c8a), variant: { amplified: false } } });
  } } },
  failing: { ...SELF.failing, id: syntheticId(0x7c84), cardType: "event" as const, subtype: "" as const, spark: null, abilities: () => [] },
} satisfies Record<string, EngineCardDefinition>;
const onceEngine = createEngine(zoneCatalog([...Object.values(PERMIT), ...Object.values(onceCards), PREVENTER]));
const onceBoard = (player: SideSetup, enemy: SideSetup = {}) => boardState(onceEngine.catalog, {
  active: "player", phase: "day", player: { deck: filler, ...player }, enemy: { deck: filler, ...enemy },
});
const onceAct = (state: BattleState, action: Parameters<typeof act>[2], answers = new Answering(), side: "player" | "enemy" = "player") => {
  const result = onceEngine.apply(state, side, action, answers);
  expect(invariantViolations(result.state, onceEngine.catalog)).toEqual([]);
  return result.state;
};
const settle = (state: BattleState) => passUntil(onceEngine, state, (next) => next.stack.length === 0).state;
const permissionFor = (state: BattleState, card: Parameters<typeof playPermission>[2]) => playPermission(state, onceEngine.catalog, card, "player");
const onceKey = (state: BattleState, source: Parameters<typeof oncePerTurnKey>[0] | null | undefined, index = 1) => {
  if (source == null) throw new Error("missing fixture source");
  return oncePerTurnKey(source, index, typeof source === "string" ? state.instances[source].enteredZoneAt : undefined);
};
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected applied intent: ${JSON.stringify(outcome)}`);
  return outcome.slice;
};

describe("once-per-turn static playFromZone", () => {
  it("records one shared allowance on play, retains it when an event returns to the void, and renews on the next turn", () => {
    const { state, ids } = onceBoard({ back: [onceCards.source.id], void: [v.event0.id, v.event1.id, v.vanilla1.id], energy: 2 });
    const [spell, other, character] = ids.player.void;
    const key = onceKey(state, ids.player.back[0]);
    expect(permissionFor(state, spell)).toEqual({ consumes: null, oncePerTurn: key });
    expect(permissionFor(state, character)).toBeNull();
    const played = onceAct(state, fromVoid(spell));
    expect(played.oncePerTurn).toEqual([key]);
    const after = settle(played);
    expect(zoneOf(after, spell)).toBe("void");
    expect(after.instances[spell]?.status).toMatchObject({ reclaimed: false, playedViaReclaim: false });
    expect(permissionFor(after, spell)).toBeNull();
    expect(permissionFor(after, other)).toBeNull();
    expect(() => onceAct(after, fromVoid(other))).toThrow();
    const next = passUntil(onceEngine, passUntil(onceEngine, after, at(onceEngine, "enemy", "day")).state, at(onceEngine, "player", "day")).state;
    expect(next.oncePerTurn).toEqual([]);
    expect(permissionFor(next, spell)).toEqual({ consumes: null, oncePerTurn: key });
    expect(onceAct(next, fromVoid(other)).oncePerTurn).toEqual([key]);
  });

  it("expires with its source and gives the same source a fresh allowance when it enters play again", () => {
    const { state, ids } = onceBoard({ back: [onceCards.source.id, onceCards.characters.id], hand: [v.dissolveVictim.id], void: [v.event0.id] });
    const [source] = ids.player.back;
    const [spell] = ids.player.void;
    const oldKey = onceKey(state, source);
    const used = settle(onceAct(state, fromVoid(spell)));
    const away = settle(onceAct(used, { kind: "play", card: ids.player.hand[0], from: "hand" }, new Answering(() => [source!])));
    expect(zoneOf(away, source)).toBe("void");
    expect(permissionFor(away, spell)).toBeNull();
    const returned = settle(onceAct(away, fromVoid(source)));
    const freshKey = onceKey(returned, source);
    expect(returned.turn.turnNumber).toBe(state.turn.turnNumber);
    expect(freshKey).not.toBe(oldKey);
    expect(permissionFor(returned, spell)).toEqual({ consumes: null, oncePerTurn: freshKey });
    expect(onceAct(returned, fromVoid(spell)).oncePerTurn).toEqual([oldKey, freshKey]);
    // An unused permission also ends as the source leaves its functional zone.
    const unusedAway = settle(onceAct(state, { kind: "play", card: ids.player.hand[0], from: "hand" }, new Answering(() => [source!])));
    expect(unusedAway.oncePerTurn).toEqual([]);
    expect(permissionFor(unusedAway, spell)).toBeNull();
  });

  it("counts original ability indices, each copy independently, and gained abilities after the source's own list", () => {
    const { state, ids } = onceBoard({ back: [onceCards.double.id, onceCards.source.id], void: [v.event0.id] });
    const [spell] = ids.player.void;
    const [double, second] = ids.player.back;
    let played = state;
    for (const key of [onceKey(state, double, 1), onceKey(state, double, 3), onceKey(state, second, 1)]) {
      expect(permissionFor(played, spell)).toEqual({ consumes: null, oncePerTurn: key });
      played = settle(onceAct(played, fromVoid(spell)));
      expect(played.oncePerTurn).toContain(key);
    }
    expect(permissionFor(played, spell)).toBeNull();
    const gained = onceBoard({ back: [onceCards.collector.id], void: [onceCards.double.id, v.event0.id] });
    const opened = settle(onceAct(gained.state, activate(gained.ids.player.back[0])));
    const source = gained.ids.player.back[0];
    const card = gained.ids.player.void[1];
    expect(permissionFor(opened, card)).toEqual({ consumes: null, oncePerTurn: onceKey(opened, source, 2) });
    const used = settle(onceAct(opened, fromVoid(card)));
    expect(permissionFor(used, card)).toEqual({ consumes: null, oncePerTurn: onceKey(used, source, 4) });
    expect(permissionFor(settle(onceAct(used, fromVoid(card))), card)).toBeNull();
  });

  it("chooses unlimited, then earliest unused turn allowance, then earliest next permission, and Reclaim uses none", () => {
    const { state, ids } = onceBoard({ back: [PERMIT.technician.id, onceCards.source.id, PERMIT.anything.id], void: [ZONE.reclaimDraw.id], energy: 5 });
    const [spell] = ids.player.void;
    const granted = settle(onceAct(state, activate(ids.player.back[0])));
    expect(permissionFor(granted, spell)).toEqual({ consumes: null });
    const unlimited = onceAct(granted, fromVoid(spell), new Answering(undefined, 0));
    expect(unlimited.oncePerTurn).toEqual([]);
    expect(unlimited.floating).toEqual(granted.floating);
    const limited = settle(onceAct(granted, { kind: "play", card: ids.player.void[0], from: "void" }, new Answering(undefined, 1)));
    expect(zoneOf(limited, spell)).toBe("banished");
    expect(limited.oncePerTurn).toEqual([]);
    expect(limited.floating).toEqual(granted.floating);
    // With only the turn allowance and next permission, the allowance has precedence.
    const without = onceBoard({ back: [PERMIT.technician.id, onceCards.source.id], void: [ZONE.reclaimDraw.id], energy: 5 });
    const open = settle(onceAct(without.state, activate(without.ids.player.back[0])));
    const card = without.ids.player.void[0];
    const key = onceKey(open, without.ids.player.back[1]);
    expect(playRoutes(open, onceEngine.catalog, card, "void")).toEqual(["permission", "reclaim"]);
    const byReclaim = onceAct(open, fromVoid(card), new Answering(undefined, 1));
    expect(byReclaim.oncePerTurn).toEqual([]);
    expect(byReclaim.floating).toEqual(open.floating);
    const byPermission = settle(onceAct(open, fromVoid(card), new Answering(undefined, 0)));
    expect(byPermission.oncePerTurn).toEqual([key]);
    expect(byPermission.floating).toEqual(open.floating);
    expect(byPermission.sides.player.currentEnergy).toBe(3);
    expect(permissionFor(byPermission, card)).toEqual({ consumes: open.floating[0].id });
    const nextUsed = onceAct(byPermission, fromVoid(card), new Answering(undefined, 0));
    expect(nextUsed.floating).toEqual([]);
    expect(nextUsed.oncePerTurn).toEqual([key]);
  });

  it("keeps its allowance spent when a real opposing interrupt prevents the permitted card", () => {
    const { state, ids } = onceBoard({ back: [onceCards.source.id], void: [v.event0.id] }, { hand: [PREVENTER.id], energy: 1 });
    const [spell] = ids.player.void;
    const played = onceAct(state, fromVoid(spell));
    const prevented = settle(onceAct(played, { kind: "play", card: ids.enemy.hand[0], from: "hand" }, new Answering(() => [spell]), "enemy"));
    expect(zoneOf(prevented, spell)).toBe("void");
    expect(prevented.oncePerTurn).toEqual([onceKey(state, ids.player.back[0])]);
    expect(permissionFor(prevented, spell)).toBeNull();
  });

  it("cancels without spending, reloads a route choice, rejects concurrent and stale inputs, and replays to the same hash", () => {
    const { state, ids } = onceBoard({ back: [onceCards.source.id], void: [ZONE.reclaimDraw.id, v.event0.id], energy: 3 });
    const [spell, other] = ids.player.void;
    const fold = createFoldAdapter(onceEngine, { checkEventPrefix: true });
    const action = fromVoid(spell);
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action }));
    const pending = fold.pending(opened)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseMode", purpose: { role: "voidRoute" } });
    expect(stateHash(opened.committed)).toBe(stateHash(state));
    expect(opened.committed.oncePerTurn).toEqual([]);
    expect(fold.reduce(opened, { kind: "battleAction", side: "player", action: fromVoid(other) })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);
    const reopened = applied(fold.reduce(cancelled, { kind: "battleAction", side: "player", action }));
    expect(fold.reduce(reopened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: 0 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const cold = createFoldAdapter(createEngine(onceEngine.catalog), { checkEventPrefix: true });
    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    expect(cold.pending(saved)).toEqual(pending);
    expect(cold.reduce(saved, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: 0 })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: 2 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const intent = { kind: "answer", side: "player", promptId: pending.prompt.id, value: 0 } as const;
    const committed = applied(cold.reduce(saved, intent));
    expect(committed.committed.oncePerTurn).toEqual([onceKey(state, ids.player.back[0])]);
    expect(stateHash(committed.committed)).toBe(stateHash(applied(fold.reduce(opened, intent)).committed));
    expect(cold.reduce(committed, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    const after = settle(committed.committed);
    expect(cold.reduce(sliceOf(after), { kind: "battleAction", side: "player", action: fromVoid(other) })).toEqual({ kind: "bounced", reason: "illegalAction" });
    const loaded = JSON.parse(JSON.stringify(after)) as BattleState;
    expect(stateHash(loaded)).toBe(stateHash(after));
    expect(permissionFor(loaded, other)).toBeNull();
    const decklists = {
      player: Object.values(state.instances).filter((card) => card.owner === "player" && card.printing.kind === "card").flatMap((card) => card.printing.kind === "card" ? [{ cardId: card.printing.cardId }] : []),
      enemy: filler.map((cardId) => ({ cardId })),
    };
    expect(determinizationDivergences(onceEngine, loaded, decklists, battleSeed("once-per-turn"), 0)).toEqual([]);
  });

  it("preserves an unused allowance on play-choice failure and supports a valid retry", () => {
    const { state, ids } = onceBoard({ back: [onceCards.source.id], void: [onceCards.failing.id, v.event0.id], energy: 3 });
    const [failing, retry] = ids.player.void;
    const key = onceKey(state, ids.player.back[0]);
    const beforeHash = stateHash(state);
    // The failing play is legal and offered the source's allowance, so the fault below is its play hook's.
    expect(onceEngine.legalActions(state, "player")).toContainEqual(fromVoid(failing));
    expect(permissionFor(state, failing)).toEqual({ consumes: null, oncePerTurn: key });
    let fault: unknown;
    try {
      onceAct(state, fromVoid(failing), new Answering(undefined, 1));
    } catch (error) {
      fault = error;
    }
    expect(fault).not.toBeInstanceOf(IllegalAction);
    expect(fault).toEqual(new Error("the play fails mid-step"));
    expect(stateHash(state)).toBe(beforeHash);
    expect(permissionFor(state, retry)).toEqual({ consumes: null, oncePerTurn: key });
    const committed = onceAct(state, fromVoid(retry));
    expect(committed.oncePerTurn).toEqual([key]);
    const recovered = settle(committed);
    expect(recovered.oncePerTurn).toEqual([key]);
    expect(permissionFor(recovered, retry)).toBeNull();
  });

  it("preserves a committed allowance and the pending stack card when a later resolution fails", () => {
    const { state, ids } = onceBoard({ back: [onceCards.source.id], void: [onceCards.resolutionFail.id, v.event0.id] }, { hand: [PREVENTER.id], energy: 1 });
    const played = onceAct(state, fromVoid(ids.player.void[0]));
    const beforeHash = stateHash(played);
    expect(() => settle(played)).toThrow();
    expect(stateHash(played)).toBe(beforeHash);
    expect(zoneOf(played, ids.player.void[0])).toBe("stack");
    expect(permissionFor(played, ids.player.void[1])).toBeNull();
    const loaded = JSON.parse(JSON.stringify(played)) as BattleState;
    expect(stateHash(loaded)).toBe(beforeHash);
    expect(permissionFor(loaded, ids.player.void[1])).toBeNull();
    const recovered = settle(onceAct(loaded, { kind: "play", card: ids.enemy.hand[0], from: "hand" }, new Answering(() => [ids.player.void[0]]), "enemy"));
    expect(zoneOf(recovered, ids.player.void[0])).toBe("void");
    expect(permissionFor(recovered, ids.player.void[1])).toBeNull();
  });

  it("commits an announced permission play even when its additional cost abandons the permission source", () => {
    const { state, ids } = onceBoard({ back: [onceCards.source.id], void: [onceCards.costSource.id, v.event0.id] });
    const [source] = ids.player.back;
    const [spell, other] = ids.player.void;
    const played = onceAct(state, fromVoid(spell), new Answering(() => [source!]));
    expect(zoneOf(played, source)).toBe("void");
    expect(played.oncePerTurn).toEqual([onceKey(state, source)]);
    expect(played.turnLog.played.player.map((card) => card.instance)).toContain(spell);
    expect(permissionFor(settle(played), other)).toBeNull();
  });

  it.each(["hand", "deck"] as const)("rejects a once-per-turn static permission whose source works from a hidden %s", (zone) => {
    const hidden = { ...onceCards.source, id: syntheticId(0x7c88), abilities: () => [staticAbility(playFromZone("void", {}, { oncePerTurn: true }), { zone: zone === "deck" ? "any" : zone })] };
    const hiddenEngine = createEngine(zoneCatalog([hidden]));
    const { state, ids } = boardState(hiddenEngine.catalog, { active: "player", phase: "day", player: { [zone]: [hidden.id], void: [v.event0.id] } });
    expect(() => playPermission(state, hiddenEngine.catalog, ids.player.void[0], "player")).toThrow(/public-zone source/);
  });

  it("restricts the once-per-turn option to filter-based, non-next static permissions", () => {
    expect(() => playFromZone("void", {}, { cards: thisCardIn("void"), oncePerTurn: true })).toThrow(/filter/);
    expect(() => playFromZone("void", {}, { next: true, oncePerTurn: true })).toThrow(/not next/);
    const invalid = { ...PERMIT.anything, id: syntheticId(0x7c85), abilities: () => [activated([], playFromZone("void", {}, { oncePerTurn: true }))] };
    const bad = createEngine(zoneCatalog([invalid]));
    const { state, ids } = boardState(bad.catalog, { active: "player", phase: "day", player: { back: [invalid.id] } });
    expect(() => bad.apply(state, "player", activate(ids.player.back[0]), new Answering())).toThrow(/static ability/);
  });
});


describe("static allowance lifecycle consumers", () => {
  it("keeps a printed allowance spent when a paid gained-ability effect ends, while a new gain has a fresh allowance", () => {
    const { state, ids } = onceBoard({ back: [onceCards.source.id], hand: [onceCards.paidGain.id, onceCards.paidGain.id], void: [v.event0.id] });
    const [spell] = ids.player.void;
    const granted = settle(onceAct(state, { kind: "play", card: ids.player.hand[0], from: "hand" }));
    const used = settle(onceAct(settle(onceAct(granted, fromVoid(spell))), fromVoid(spell)));
    expect(permissionFor(used, spell)).toBeNull();
    const ended = onceAct(used, { kind: "payToEnd", effect: granted.payable[0].id });
    expect(ended.instances[ids.player.back[0]!].status.gainedAbilities).toBeUndefined();
    expect(onceEngine.legalActions(ended, "player")).not.toContainEqual(fromVoid(spell));
    const restored = settle(onceAct(ended, { kind: "play", card: ids.player.hand[1], from: "hand" }));
    expect(onceEngine.legalActions(restored, "player")).toContainEqual(fromVoid(spell));
    expect(permissionFor(settle(onceAct(restored, fromVoid(spell))), spell)).toBeNull();
  });

  it.each(["play", "void"] as const)("normalizes the clock of live %s-source allowances and retains spent, source, and ability distinctions", (zone) => {
    const fixture = zone === "void" ? onceBoard({ void: [onceCards.voidSource.id, v.event0.id] })
      : onceBoard({ back: [onceCards.source.id], void: [v.event0.id] });
    const source = zone === "play" ? fixture.ids.player.back[0]! : fixture.ids.player.void[0];
    const spell = zone === "play" ? fixture.ids.player.void[0] : fixture.ids.player.void[1];
    const used = settle(onceAct(fixture.state, fromVoid(spell)));
    const shifted = cloneState(used);
    shifted.clock += 100;
    for (const instance of Object.values(shifted.instances)) instance.enteredZoneAt += 100;
    shifted.oncePerTurn = [onceKey(shifted, source)];
    expect(permissionFor(shifted, spell)).toBeNull();
    expect(onceEngine.legalActions(shifted, "player")).toEqual(onceEngine.legalActions(used, "player"));
    expect(loopSignature(shifted)).toBe(loopSignature(used));
    expect(cycleHash(shifted)).toBe(cycleHash(used));
    for (const changed of [[], [onceKey(used, source, 0)], [onceKey(used, spell)]]) {
      const different = { ...used, oncePerTurn: changed };
      expect(loopSignature(different)).not.toBe(loopSignature(used));
      expect(cycleHash(different)).not.toBe(cycleHash(used));
    }
    const obsolete = { ...used, oncePerTurn: [...used.oncePerTurn, oncePerTurnKey(source, 1, used.instances[source].enteredZoneAt - 1), oncePerTurnKey("i999", 1, 0)] };
    expect(loopSignature(obsolete)).toBe(loopSignature(used));
    expect(cycleHash(obsolete)).toBe(cycleHash(used));
    const fresh = { ...used, oncePerTurn: [oncePerTurnKey(source, 1, used.instances[source].enteredZoneAt - 1)] };
    const unused = { ...fresh, oncePerTurn: [] };
    expect(permissionFor(fresh, spell)).not.toBeNull();
    expect(loopSignature(fresh)).toBe(loopSignature(unused));
    expect(cycleHash(fresh)).toBe(cycleHash(unused));
    const legacy = { ...used, oncePerTurn: [...used.oncePerTurn, oncePerTurnKey(source, 0)] };
    expect(loopSignature(legacy)).not.toBe(loopSignature(used));
    expect(cycleHash(legacy)).not.toBe(cycleHash(used));
    const resources = cloneState(used);
    resources.sides.player.score += 1;
    resources.turnLog.played.player.push(...used.turnLog.played.player);
    expect(loopResources(resources)).not.toEqual(loopResources(used));
    expect(loopSignature(resources)).toBe(loopSignature(used));
    expect(cycleHash(resources)).not.toBe(cycleHash(used));
  });

  it("keeps avatar and each dreamsign's static and activated allowances independent through reload and turn renewal", () => {
    const abilities = () => [activated([], gainPoints(1), { oncePerTurn: true }), once()];
    const avatar = { id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000007c90"), status: "authored" as const, abilities };
    const dreamsign = { id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000007c91"), status: "authored" as const, abilities };
    const catalog = { ...onceEngine.catalog, avatar: (id: typeof avatar.id) => id === avatar.id ? avatar : onceEngine.catalog.avatar(id),
      dreamsign: (id: typeof dreamsign.id) => id === dreamsign.id ? dreamsign : onceEngine.catalog.dreamsign(id) };
    const emblemEngine = createEngine(catalog);
    const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { avatar: avatar.id, dreamsigns: [dreamsign.id, dreamsign.id], void: [v.event0.id], deck: filler }, enemy: { deck: filler } });
    const sources = [{ kind: "avatar", side: "player" }, { kind: "dreamsign", side: "player", index: 0 }, { kind: "dreamsign", side: "player", index: 1 }] as const;
    const finish = (next: BattleState) => passUntil(emblemEngine, next, (work) => work.stack.length === 0).state;
    let used = state;
    for (const source of sources) {
      used = finish(emblemEngine.apply(used, "player", { kind: "activate", source, ability: 0 }, new Answering()).state);
      expect(emblemEngine.legalActions(used, "player")).toContainEqual(fromVoid(ids.player.void[0]));
      used = finish(emblemEngine.apply(used, "player", fromVoid(ids.player.void[0]), new Answering()).state);
    }
    const loaded = JSON.parse(JSON.stringify(used)) as BattleState;
    expect(emblemEngine.legalActions(loaded, "player")).not.toContainEqual(fromVoid(ids.player.void[0]));
    for (const source of sources) expect(emblemEngine.legalActions(loaded, "player")).not.toContainEqual({ kind: "activate", source, ability: 0 });
    expect(loopSignature({ ...loaded, oncePerTurn: [] })).not.toBe(loopSignature(loaded));
    expect(cycleHash({ ...loaded, oncePerTurn: [] })).not.toBe(cycleHash(loaded));
    const next = passUntil(emblemEngine, passUntil(emblemEngine, loaded, at(emblemEngine, "enemy", "day")).state, at(emblemEngine, "player", "day")).state;
    expect(emblemEngine.legalActions(next, "player")).toContainEqual(fromVoid(ids.player.void[0]));
    for (const source of sources) expect(emblemEngine.legalActions(next, "player")).toContainEqual({ kind: "activate", source, ability: 0 });
    expect(invariantViolations(next, catalog)).toEqual([]);
  });
});
