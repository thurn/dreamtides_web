import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { activated, energy, event, everyIn, exhaustSelf, fromVoid } from "../../../dsl/builders";
import { NO_DECK_MODS, type CardCost } from "../../../dsl/types";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import type { Action } from "../../../rules/actions";
import { hasKeyword } from "../../../rules/keywords";
import { routeCosts } from "../../../rules/timing";
import { instanceOf, moveToHand } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, FloatingEffect } from "../../../state/types";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand } from "../../../testing/scenario";
import { syntheticId } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { ZONE, zoneCatalog } from "../../../testing/zone-cards";
import { resolveEffect } from "../../interpreter";
import { erode } from "../erode";
import { forDuration } from "../for-duration";
import { grantReclaim, reclaimMovedBy } from "../grant-reclaim";
import { v } from "./cards-support";

function card(index: number, cardType: "character" | "event", cost: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition {
  return {
    id: syntheticId(0x7a10 + index),
    cardType,
    costs: [energy(cost)],
    spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "",
    speed: cardType === "character" ? "standard" : "interrupt",
    status: "authored",
    abilities,
  };
}

const G = {
  /** "☾: Choose a card in your void to gain reclaim." */
  tracer: card(0, "character", 3, () => [activated([exhaustSelf()], grantReclaim(fromVoid()))]),
  /** "2●: Choose an event in your void to gain reclaim." */
  eventTracer: card(1, "character", 2, () => [activated([energy(2)], grantReclaim(fromVoid({ cardType: "event" })))]),
  /** "1●: Erode 1. That card gains reclaim 0●." */
  speaker: card(2, "character", 3, () => [activated([energy(1)], grantReclaim(reclaimMovedBy(erode(1)), { costs: [energy(0)] }))]),
  /** ❖❖ "Until end of turn, cards in your void gain reclaim." */
  voidUntilEndOfTurn: card(3, "event", 0, () => [event(forDuration("untilEndOfTurn", grantReclaim(everyIn("void"))))]),
} as const;

/** ❖❖ A synthetic response: each card in the opponent's void goes to its owner's hand. */
const voidToHand: EngineCardDefinition = {
  ...card(4, "event", 0, () => []),
  synthetic: {
    resolve(ctx, item) {
      for (const id of [...ctx.state.sides[opponent(item.controller)].void]) moveToHand(ctx, id, instanceOf(ctx.state, id).owner);
    },
  },
};

/** Grants Reclaim to every card in its controller's void, then throws: a step that fails after its grant. */
const grantThenFail: EngineCardDefinition = {
  ...card(5, "event", 0, () => []),
  speed: "standard",
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, grantReclaim(everyIn("void"), { costs: [energy(0)] }), {
        source: item.instance,
        origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0,
        controller: item.controller,
        x: null,
        optionalPaid: [],
        choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its grant");
    },
  },
};

/** Answers target and card prompts with `pick` over their candidates, keeping each prompt. */
class Picking implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (candidates: readonly InstanceId[]) => readonly InstanceId[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    if (prompt.kind !== "chooseTargets" && prompt.kind !== "chooseCards") throw new Error(`unexpected ${prompt.kind} prompt`);
    return this.pick(prompt.candidates);
  }
}

describe("grantReclaim", () => {
  const engine = createEngine(zoneCatalog([...Object.values(G), voidToHand, grantThenFail]));
  const filler = Array.from({ length: 4 }, () => v.vanilla1.id);
  const placed = (player: SideSetup, enemy: SideSetup = {}) =>
    boardState(engine.catalog, { active: "player", phase: "day", player: { deck: filler, ...player }, enemy: { deck: filler, ...enemy } });
  const act = (state: BattleState, side: Side, action: Action, pick: (candidates: readonly InstanceId[]) => readonly InstanceId[] = (c) => [c[0]]) => {
    const source = new Picking(pick);
    const result = engine.apply(state, side, action, source);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    return { ...result, prompts: source.prompts };
  };
  const activate = (source: InstanceId | null | undefined): Action => ({ kind: "activate", source: source!, ability: 0 });
  const fromVoidPlay = (id: InstanceId | null | undefined): Action => ({ kind: "play", card: id!, from: "void" });
  const canReclaim = (state: BattleState, id: InstanceId | null | undefined, side: Side = "player") =>
    engine.legalActions(state, side).some((action) => action.kind === "play" && action.card === id && action.from === "void");
  const reclaimCosts = (state: BattleState, id: InstanceId | null | undefined) => routeCosts(state, engine.catalog, id!, "reclaim");
  const has = (state: BattleState, id: InstanceId | null | undefined) => hasKeyword(state, engine.catalog, id!, "reclaim");
  const nextPlayerDay = (state: BattleState) => passUntil(engine, passUntil(engine, state, at(engine, "enemy", "day")).state, at(engine, "player", "day")).state;
  const zoneOf = (state: BattleState, id: InstanceId | null | undefined) => state.instances[id!]?.zone ?? null;

  it("gives a chosen card in its controller's void plain Reclaim permanently, played for its normal cost and banished as it leaves", () => {
    const { state, ids } = placed({ back: [G.tracer.id], void: [v.event1.id, v.vanilla2.id], energy: 3 }, { void: [v.event0.id] });
    const [spell, other] = ids.player.void;
    expect(canReclaim(state, spell)).toBe(false);
    const granted = act(state, "player", activate(ids.player.back[0]));
    // Any card in the controller's own void is a candidate; the opponent's void is not.
    expect(granted.prompts[0]).toMatchObject({ kind: "chooseTargets", candidates: [spell, other] });
    const after = granted.state;
    expect(granted.events).toContainEqual(
      expect.objectContaining({ kind: "effectStarted", expiry: { at: "never" }, change: { kind: "keyword", instance: spell, keyword: "reclaim", gains: true } }),
    );
    expect(has(after, spell)).toBe(true);
    expect(canReclaim(after, spell)).toBe(true);
    expect(canReclaim(after, other)).toBe(false);
    expect(reclaimCosts(after, spell)).toEqual([energy(1)]);
    // The void is public: both views show the granted keyword.
    for (const viewer of ["player", "enemy"] as const) expect(engine.view(after, viewer).instances[spell]?.characteristics.keywords).toContain("reclaim");
    // The opponent can never play it.
    expect(canReclaim(after, spell, "enemy")).toBe(false);
    const played = act(after, "player", fromVoidPlay(spell)).state;
    expect(played.sides.player.currentEnergy).toBe(2);
    expect(played.instances[spell]?.status.reclaimed).toBe(true);
    expect(zoneOf(played, spell)).toBe("banished");
    expect(zoneOf(nextPlayerDay(played), spell)).toBe("banished");
  });

  it("names only matching cards, cannot be activated with none, and lasts into later turns", () => {
    const none = placed({ back: [G.eventTracer.id], void: [v.vanilla2.id], energy: 2 });
    expect(engine.legalActions(none.state, "player").some((action) => action.kind === "activate")).toBe(false);
    const { state, ids } = placed({ back: [G.eventTracer.id], void: [v.vanilla2.id, v.event1.id], energy: 2 });
    const [character, spell] = ids.player.void;
    const granted = act(state, "player", activate(ids.player.back[0]));
    expect(granted.prompts.every((prompt) => prompt.kind !== "chooseTargets" || !prompt.candidates.includes(character))).toBe(true);
    expect(has(granted.state, spell)).toBe(true);
    expect(has(granted.state, character)).toBe(false);
    const later = nextPlayerDay(granted.state);
    expect(later.turn.turnNumber).toBeGreaterThan(granted.state.turn.turnNumber);
    expect(canReclaim(later, spell)).toBe(true);
  });

  it("grants 'that card' Reclaim 0●: the card its own Erode put into the void, ahead of a printed Reclaim cost", () => {
    const { state, ids } = placed({ back: [G.speaker.id, G.tracer.id], deck: [ZONE.reclaimDraw.id, ...filler], void: [ZONE.reclaimDraw.id, v.event0.id], energy: 1 });
    const [eroded] = ids.player.deck;
    const [printed, already] = ids.player.void;
    const after = act(state, "player", activate(ids.player.back[0])).state;
    expect(zoneOf(after, eroded)).toBe("void");
    expect(after.floating).toEqual([expect.objectContaining({ change: { kind: "keyword", instance: eroded, keyword: "reclaim", gains: true, reclaimCosts: [energy(0)] } })]);
    expect(has(after, already)).toBe(false);
    expect(reclaimCosts(after, eroded)).toEqual([energy(0)]);
    expect(reclaimCosts(after, printed)).toEqual([energy(1)]);
    // A later plain grant adds the keyword and keeps the card's cost, granted or printed.
    const tracer = ids.player.back[1];
    const plain = act(after, "player", activate(tracer), (candidates) => [candidates.find((id) => id === eroded)!]).state;
    expect(reclaimCosts(plain, eroded)).toEqual([energy(0)]);
    expect(plain.sides.player.currentEnergy).toBe(0);
    const played = act(plain, "player", fromVoidPlay(eroded)).state;
    expect(played.sides.player.currentEnergy).toBe(0);
    expect(zoneOf(played, eroded)).toBe("banished");
    expect(canReclaim(played, printed)).toBe(false);
  });

  it("orders granted costs by timestamp over a deck-entry Reclaim, and a loss of Reclaim clears them", () => {
    const { state, ids } = placed({ back: [G.speaker.id], deck: [v.event1.id, ...filler], energy: 1 });
    const [eroded] = ids.player.deck;
    const after = act(state, "player", activate(ids.player.back[0])).state;
    const base = after.floating[0];
    const later = (offset: number, change: Partial<Extract<FloatingEffect["change"], { kind: "keyword" }>>): FloatingEffect => ({
      ...base,
      id: `e${100 + offset}`,
      timestamp: base.timestamp + offset,
      change: { kind: "keyword", instance: eroded, keyword: "reclaim", gains: true, ...change },
    });
    const withMods: BattleState = {
      ...after,
      instances: { ...after.instances, [eroded]: { ...after.instances[eroded], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, reclaim: 3 } } } },
    };
    expect(reclaimCosts(withMods, eroded)).toEqual([energy(0)]);
    const costs = (...effects: FloatingEffect[]) => reclaimCosts({ ...withMods, floating: [...withMods.floating, ...effects] }, eroded);
    const two: CardCost[] = [energy(2)];
    expect(costs(later(1, { reclaimCosts: two }))).toEqual(two);
    expect(costs(later(1, { reclaimCosts: two }), later(2, {}))).toEqual(two);
    // A loss clears the granted cost: the deck-entry Reclaim cost applies again, and a later granted cost replaces it.
    expect(costs(later(1, { gains: false }))).toEqual([energy(3)]);
    expect(costs(later(1, { gains: false }), later(2, { reclaimCosts: two }))).toEqual(two);
    const lost = { ...after, floating: [...after.floating, later(1, { gains: false })] };
    expect(canReclaim(lost, eroded)).toBe(false);
  });

  it("names nothing when its Erode causes Fatigue, and only the cards its own effect moved", () => {
    const { state, ids } = placed({ back: [G.speaker.id], deck: [], void: [v.event1.id], energy: 1 });
    const { state: after, events } = act(state, "player", activate(ids.player.back[0]));
    expect(after.sides.player.fatigueCount).toBe(1);
    expect(after.floating).toEqual([]);
    expect(events.some((event) => event.kind === "effectStarted")).toBe(false);
    expect(canReclaim(after, ids.player.void[0])).toBe(false);
  });

  it("ends an until-end-of-turn grant at the turn's end, wherever the cards are, and covers only cards in the void as it resolves", () => {
    const { state, ids } = placed({ hand: [G.voidUntilEndOfTurn.id], void: [v.event1.id, v.vanilla2.id], energy: 3 });
    const [spell, character] = ids.player.void;
    const [grant] = ids.player.hand;
    const after = act(state, "player", playFromHand(ids, "player").action).state;
    expect(after.floating.map((effect) => [effect.expiry, effect.change])).toEqual(
      [spell, character].map((instance) => [{ at: "endOfTurn" }, { kind: "keyword", instance, keyword: "reclaim", gains: true }]),
    );
    // The event was on the stack as it resolved, so it did not gain Reclaim.
    expect(zoneOf(after, grant)).toBe("void");
    expect(canReclaim(after, grant)).toBe(false);
    expect(canReclaim(after, spell) && canReclaim(after, character)).toBe(true);
    const ended = passUntil(engine, after, at(engine, "enemy", "day"));
    expect(ended.events.filter((event) => event.kind === "effectEnded")).toHaveLength(2);
    expect(ended.state.floating).toEqual([]);
    for (const id of [spell, character]) expect(has(ended.state, id)).toBe(false);
    expect(canReclaim(passUntil(engine, ended.state, at(engine, "player", "day")).state, spell)).toBe(false);
  });

  it("skips a chosen card that left the void before resolution, while an earlier grant travels with its card into the hand", () => {
    const { state, ids } = placed(
      { back: [G.speaker.id, G.tracer.id], deck: [v.event1.id, ...filler], void: [v.vanilla2.id], energy: 1 },
      { hand: [voidToHand.id], energy: 1 },
    );
    const [eroded] = ids.player.deck;
    const [target] = ids.player.void;
    // The Speaker's own ability resolves while the opponent passes.
    const spoken = act(state, "player", activate(ids.player.back[0])).state;
    const spokenRest = passUntil(engine, spoken, (next) => next.stack.length === 0).state;
    expect(reclaimCosts(spokenRest, eroded)).toEqual([energy(0)]);
    // The tracer chooses the vanilla, then the opponent returns the whole void to hand in response.
    const chosen = act(spokenRest, "player", activate(ids.player.back[1]), (candidates) => [candidates.find((id) => id === target)!]).state;
    expect(chosen.stack).toHaveLength(1);
    const responded = act(chosen, "enemy", playFromHand(ids, "enemy").action);
    const rest = passUntil(engine, responded.state, (next) => next.stack.length === 0);
    expect([...responded.events, ...rest.events]).toContainEqual({ kind: "noLegalTarget", source: ids.player.back[1] });
    const after = rest.state;
    expect(after.floating).toHaveLength(1);
    expect(zoneOf(after, target)).toBe("hand");
    expect(has(after, target)).toBe(false);
    // The permanent grant travels: the card in hand still has Reclaim 0●, which both players saw it gain and leave the void with.
    expect(zoneOf(after, eroded)).toBe("hand");
    expect(has(after, eroded)).toBe(true);
    expect(reclaimCosts(after, eroded)).toEqual([energy(0)]);
    for (const viewer of ["player", "enemy"] as const) {
      expect(engine.view(after, viewer).instances[eroded]?.characteristics.keywords).toContain("reclaim");
      expect(engine.view(after, viewer).floating).toHaveLength(1);
    }
  });

  it("stores only its floating change: a reloaded state reads the same costs, and its target prompt survives a reload", () => {
    const { state, ids } = placed({ back: [G.speaker.id, G.tracer.id], deck: [v.event1.id, ...filler], void: [v.vanilla2.id], energy: 1 });
    const [eroded] = ids.player.deck;
    const after = act(state, "player", activate(ids.player.back[0])).state;
    const reloaded = JSON.parse(JSON.stringify(after)) as BattleState;
    expect(stateHash(reloaded)).toBe(stateHash(after));
    expect(reclaimCosts(reloaded, eroded)).toEqual(reclaimCosts(after, eroded));
    expect(engine.legalActions(reloaded, "player")).toEqual(engine.legalActions(after, "player"));

    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const start: BattleSlice = { committed: after, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: activate(ids.player.back[1]) });
    if (outcome.kind !== "applied") throw new Error("bounced");
    const pending = fold.pending(outcome.slice)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseTargets", purpose: { role: "target" } });
    const saved = JSON.parse(JSON.stringify(outcome.slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.pending(saved)!.prompt.id).toBe(pending.prompt.id);
    const answer = (side: Side, value: Answer) => fresh.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value });
    expect(answer("enemy", [ids.player.void[0]])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer("player", [ids.player.back[0]!])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const granted = answer("player", [ids.player.void[0]]);
    if (granted.kind !== "applied" || granted.error !== null) throw new Error("the grant did not apply");
    expect(has(granted.slice.committed, ids.player.void[0])).toBe(true);
    expect(granted.slice.committed.floating).toHaveLength(2);
  });

  it("commits and publishes no grant when its step fails after granting", () => {
    const { state, ids } = placed({ hand: [grantThenFail.id], void: [v.event1.id] });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error.message).toMatch(/after its grant/);
    expect(outcome.published.map((event) => event.kind)).toEqual(["cardPlayed"]);
    expect(outcome.slice.committed.floating).toEqual([]);
    expect(has(outcome.slice.committed, ids.player.void[0])).toBe(false);
  });

  it("names cards in a void only", () => {
    expect(() => grantReclaim(everyIn("hand"))).toThrow(/void/);
    expect(() => grantReclaim(everyIn("deck"))).toThrow(/void/);
  });
});
