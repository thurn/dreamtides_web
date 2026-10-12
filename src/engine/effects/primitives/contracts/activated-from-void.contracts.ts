/**
 * Contracts for `ActivatedAbility.zone` "void" (rules § Ability Types →
 * Where activated abilities work, RD-hv-umm2.490-1): which sources list,
 * who may activate, which costs are payable from the void, the back-rank
 * refusal, and resolution after the card has left the void.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { abandonCost, abandonSelfCost, activated, banishFromVoidCost, energy, event, exhaustSelf, fromVoid, thisCardIn, winCondition } from "../../../dsl/builders";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Action } from "../../../rules/actions";
import { abilitySources } from "../../../rules/activation";
import { winConditionSources } from "../../../rules/victory";
import { stateHash } from "../../../state/hash";
import { BACK_RANK_SIZE, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { zoneCatalog } from "../../../testing/zone-cards";
import { banishCards } from "../banish-cards";
import { draw } from "../draw";
import { gainPoints } from "../gain-points";
import { materialize } from "../materialize";
import { v } from "./cards-support";
import { Answering, filler } from "./play-from-zone-support";

function character(index: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition {
  return {
    id: syntheticId(0x9a00 + index),
    cardType: "character",
    costs: [energy(3)],
    spark: 2,
    subtype: "Ancient",
    speed: "standard",
    status: "authored",
    abilities,
  };
}

const fromTheVoid = materialize(thisCardIn("void"));

const C = {
  /** "Abandon a character: Materialize this character from your void." */
  revenant: character(0, () => [activated([abandonCost()], fromTheVoid, { zone: "void" })]),
  /** "2●, Banish a card from your void: Materialize this character from your void." */
  reaper: character(1, () => [activated([energy(2), banishFromVoidCost(1)], fromTheVoid, { zone: "void" })]),
  /** "☾: Materialize this character from your void." ☾ is never payable from the void. */
  exhauster: character(2, () => [activated([exhaustSelf()], fromTheVoid, { zone: "void" })]),
  /** "Abandon this character: Draw a card." from the void: only a character in play can be abandoned. */
  selfAbandoner: character(3, () => [activated([abandonSelfCost()], draw(1), { zone: "void" })]),
  /** "1●: Draw a card." from the void: puts no character into play. */
  voidDrawer: character(4, () => [activated([energy(1)], draw(1), { zone: "void" })]),
  /** "1●: Draw a card." in play, then "1●: Gain 1⍟." from the void. */
  hybrid: character(5, () => [activated([energy(1)], draw(1)), activated([energy(1)], gainPoints(1), { zone: "void" })]),
  /** A void activation beside "If you have 0● or more, you win the game", which works only in play (C15). */
  winner: character(6, () => [activated([energy(1)], draw(1), { zone: "void" }), winCondition({ cond: "energyAtLeast", amount: 0 })]),
} as const satisfies Record<string, EngineCardDefinition>;

/** ❖❖ "Banish a card from the opponent's void." */
const VOID_BANISHER: EngineCardDefinition = {
  id: syntheticId(0x9a0f),
  cardType: "event",
  costs: [energy(0)],
  spark: null,
  subtype: "",
  speed: "interrupt",
  status: "authored",
  abilities: () => [event(banishCards([fromVoid({}, { player: "opponent" })]))],
};

const engine = createEngine(zoneCatalog([...Object.values(C), VOID_BANISHER]));

function placed(player: SideSetup, enemy: SideSetup = {}, active: Side = "player") {
  return boardState(engine.catalog, { active, phase: "day", player: { deck: filler, ...player }, enemy: { deck: filler, ...enemy } });
}

const activate = (source: InstanceId | null | undefined, ability = 0): Action => ({ kind: "activate", source: source!, ability });

/** The card sources `side` may activate now, with their ability indices. */
function activations(state: BattleState, side: Side = "player"): [InstanceId, number][] {
  return engine.legalActions(state, side).flatMap((action) =>
    action.kind === "activate" && typeof action.source === "string" ? [[action.source, action.ability] as [InstanceId, number]] : [],
  );
}

function act(state: BattleState, side: Side, action: Action, source = new Answering()) {
  const result = engine.apply(state, side, action, source);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return { ...result, prompts: source.prompts };
}

const resolveStack = (state: BattleState): BattleState => passUntil(engine, state, (next) => next.stack.length === 0).state;

describe("activated abilities that work from the void", () => {
  it("lists only abilities that work where their card is, for the side owning that void", () => {
    const { state, ids } = placed({ back: [v.vanilla1.id, C.revenant.id, C.hybrid.id], void: [C.revenant.id, C.hybrid.id, C.voidDrawer.id], energy: 3 });
    const [, revenantInPlay, hybridInPlay] = ids.player.back;
    const [revenant, hybrid, drawer] = ids.player.void;
    expect(activations(state)).toEqual([[hybridInPlay, 0], [revenant, 0], [hybrid, 1], [drawer, 0]]);
    // The zone check refuses a void ability in play and a play ability in the void, even when asked directly.
    expect(() => engine.apply(state, "player", activate(revenantInPlay), new Answering())).toThrow();
    expect(() => engine.apply(state, "player", activate(hybridInPlay, 1), new Answering())).toThrow();
    expect(() => engine.apply(state, "player", activate(hybrid, 0), new Answering())).toThrow();
    // The opponent never activates the player's void cards.
    expect(activations(state, "enemy")).toEqual([]);
  });

  it("is activated by the owner of the void, on the owner's own turn, for the opponent too", () => {
    const { state, ids } = placed({ void: [C.voidDrawer.id], energy: 3 }, { back: [v.vanilla1.id], void: [C.revenant.id], energy: 3 }, "enemy");
    const [revenant] = ids.enemy.void;
    expect(abilitySources(state, engine.catalog, "enemy")).toEqual([ids.enemy.back[0], revenant]);
    expect(activations(state, "enemy")).toEqual([[revenant, 0]]);
    // Standard timing: the player's void drawer waits for the player's own Day.
    expect(activations(state, "player")).toEqual([]);
  });

  it("orders void sources by creation, after the characters in play, whatever the void's order", () => {
    const { state, ids } = placed({ back: [C.hybrid.id], void: [C.revenant.id, C.reaper.id], energy: 2 });
    const [revenant, reaper] = ids.player.void;
    const reordered: BattleState = { ...state, sides: { ...state.sides, player: { ...state.sides.player, void: [reaper, revenant] } } };
    expect(abilitySources(reordered, engine.catalog, "player")).toEqual([ids.player.back[0], revenant, reaper]);
    expect(activations(reordered)).toEqual([[ids.player.back[0], 0], [revenant, 0], [reaper, 0]]);
  });

  it("pays its costs, goes on the stack with its origin, and materializes its card under its owner's control", () => {
    const { state, ids } = placed({ back: [v.vanilla1.id, v.vanilla2.id], void: [C.revenant.id], energy: 0 }, { hand: [VOID_BANISHER.id] });
    const payer = ids.player.back[0]!;
    const [revenant] = ids.player.void;
    const paid = act(state, "player", activate(revenant));
    expect(paid.prompts.map((prompt) => prompt.purpose.role)).toEqual(["abandonCost"]);
    expect(paid.state.instances[payer]?.zone).toBe("void");
    expect(paid.state.stack).toHaveLength(1);
    expect(paid.state.stack[0]).toMatchObject({ kind: "ability", source: revenant, ability: 0, controller: "player", origin: { kind: "card", cardId: C.revenant.id } });
    expect(paid.events).toContainEqual({ kind: "abilityActivated", side: "player", source: revenant, ability: 0 });
    expect(paid.state.priority).toBe("enemy");
    const resolved = resolveStack(paid.state);
    expect(resolved.instances[revenant]).toMatchObject({ zone: "play", controller: "player" });
    expect(resolved.sides.player.backRank).toContain(revenant);
  });

  it("pays energy and a banished void card, its own card included", () => {
    const energyShort = placed({ void: [C.reaper.id, v.vanilla1.id], energy: 1 });
    expect(activations(energyShort.state)).toEqual([]);

    const { state, ids } = placed({ void: [C.reaper.id, v.vanilla1.id], energy: 2 });
    const [reaper, other] = ids.player.void;
    const paid = act(state, "player", activate(reaper), new Answering(() => [other]));
    const [banishPrompt] = paid.prompts;
    expect(banishPrompt).toMatchObject({ kind: "chooseCards", purpose: { role: "banishCost" } });
    if (banishPrompt?.kind !== "chooseCards") throw new Error("expected a card choice");
    expect([...banishPrompt.candidates].sort()).toEqual([reaper, other].sort());
    expect(paid.state.sides.player).toMatchObject({ currentEnergy: 0, banished: [other] });
    expect(resolveStack(paid.state).instances[reaper]?.zone).toBe("play");

    // Banishing its own card pays the cost; the ability then finds no card in the void and does nothing.
    const self = resolveStack(act(state, "player", activate(reaper), new Answering(() => [reaper])).state);
    expect(self.instances[reaper]?.zone).toBe("banished");
    expect(self.sides.player.backRank.every((slot) => slot === null)).toBe(true);
  });

  it("never pays ☾ or abandons its own card from the void", () => {
    const { state, ids } = placed({ back: [v.vanilla1.id], void: [C.exhauster.id, C.selfAbandoner.id], energy: 5 });
    expect(activations(state)).toEqual([]);
    for (const source of ids.player.void) expect(() => engine.apply(state, "player", activate(source), new Answering())).toThrow();
  });

  it("is refused with a full back rank when it would put a character into play, even when its cost would free a position", () => {
    const full = Array.from({ length: BACK_RANK_SIZE }, () => v.vanilla1.id);
    const { state, ids } = placed({ back: full, void: [C.revenant.id, C.voidDrawer.id], energy: 3 });
    const [revenant, drawer] = ids.player.void;
    expect(activations(state)).toEqual([[drawer, 0]]);
    expect(() => engine.apply(state, "player", activate(revenant), new Answering())).toThrow();
    const open = placed({ back: full.slice(1), void: [C.revenant.id], energy: 3 });
    expect(activations(open.state)).toEqual([[open.ids.player.void[0], 0]]);
  });

  it("does nothing to its card when an Interrupt in the response window banishes it from the void", () => {
    const { state, ids } = placed({ back: [v.vanilla1.id], void: [C.revenant.id] }, { hand: [VOID_BANISHER.id] });
    const payer = ids.player.back[0]!;
    const [revenant] = ids.player.void;
    const paid = act(state, "player", activate(revenant));
    expect(paid.state.priority).toBe("enemy");
    const response = act(paid.state, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, new Answering(() => [revenant]));
    // The player has no response, so the Interrupt resolves first, then the ability.
    const kinds = response.events.map((event) => event.kind);
    expect(kinds.indexOf("banished")).toBeGreaterThan(kinds.indexOf("cardPlayed"));
    expect(kinds.indexOf("abilityResolved")).toBeGreaterThan(kinds.indexOf("banished"));
    const resolved = resolveStack(response.state);
    expect(resolved.instances[revenant]?.zone).toBe("banished");
    // The cost stays paid, and nothing enters play.
    expect(resolved.instances[payer]?.zone).toBe("void");
    expect(resolved.sides.player.backRank.every((slot) => slot === null)).toBe(true);
  });

  it("resolves from its origin snapshot after its card has left the void", () => {
    const { state, ids } = placed({ void: [C.voidDrawer.id], energy: 1 }, { hand: [VOID_BANISHER.id] });
    const [drawer] = ids.player.void;
    const hand = state.sides.player.hand.length;
    const paid = act(state, "player", activate(drawer));
    const response = act(paid.state, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, new Answering(() => [drawer]));
    const resolved = resolveStack(response.state);
    expect(resolved.instances[drawer]?.zone).toBe("banished");
    expect(resolved.sides.player.hand).toHaveLength(hand + 1);
  });

  it("has no win condition in effect from the void (C15)", () => {
    const inVoid = placed({ void: [C.winner.id], energy: 1 });
    expect(activations(inVoid.state)).toEqual([[inVoid.ids.player.void[0], 0]]);
    expect(winConditionSources(inVoid.state, engine.catalog, "player")).toEqual([]);
    const activated = resolveStack(act(inVoid.state, "player", activate(inVoid.ids.player.void[0])).state);
    expect(activated.result).toBeNull();
    const inPlay = placed({ back: [C.winner.id] });
    expect(winConditionSources(inPlay.state, engine.catalog, "player")).toEqual(inPlay.ids.player.back);
  });
});

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });

describe("activated abilities that work from the void: recovery", () => {
  it("commits nothing before the cost is chosen, survives a reload mid-choice, and bounces a stale activation", () => {
    const { state, ids } = placed({ back: [v.vanilla1.id, v.vanilla2.id], void: [C.revenant.id] }, { hand: [VOID_BANISHER.id] });
    const payer = ids.player.back[0]!;
    const [revenant] = ids.player.void;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fold.reduce(sliceOf(state), { kind: "battleAction", side: "enemy", action: activate(revenant) })).toMatchObject({ kind: "bounced" });

    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: activate(revenant) }));
    const pending = fold.pending(opened)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", side: "player", purpose: { role: "abandonCost" } });
    expect(stateHash(opened.committed)).toBe(stateHash(state));
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);
    expect(activations(cancelled.committed)).toEqual([[revenant, 0]]);

    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    expect(cold.pending(saved)).toEqual(pending);
    const after = applied(cold.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [payer] }));
    expect(after.committed.stack).toHaveLength(1);
    expect(engine.legalActions(JSON.parse(JSON.stringify(after.committed)) as BattleState, "enemy")).toEqual(engine.legalActions(after.committed, "enemy"));
    const resolved = resolveStack(after.committed);
    expect(resolved.instances[revenant]?.zone).toBe("play");
    // Its card is in play now, where its void ability does not work.
    expect(cold.reduce(sliceOf(resolved), { kind: "battleAction", side: "player", action: activate(revenant) })).toMatchObject({ kind: "bounced" });
  });
});
