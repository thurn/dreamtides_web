import { describe, expect, it } from "vitest";
import { abandonCost, activated, additionalCost, energy, everyIn, fromVoid as voidTarget, keyword, staticAbility, thisCardIn } from "../../../dsl/builders";
import { playPermission } from "../../../continuous/permissions";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { oncePerTurnKey } from "../../../rules/activation";
import { battleSeed } from "../../../state/ids";
import { stateHash } from "../../../state/hash";
import type { StepContext } from "../../../steps/types";
import { runStep } from "../../../steps/runner";
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
import { act, activate, Answering, engine, filler, fromVoid, PERMIT, placed, resolveStack, voidPlays, zoneOf } from "./play-from-zone-support";

const nextPlayerDay = (state: BattleState) => passUntil(engine, passUntil(engine, state, at(engine, "enemy", "day")).state, at(engine, "player", "day")).state;

describe("playFromZone", () => {
  it("lets a static permission's controller play matching void characters for their normal costs, as often as it likes, while its source is in play", () => {
    const { state, ids } = placed(
      { back: [PERMIT.lowCharacters.id], void: [v.vanilla2.id, v.vanilla1.id, v.vanilla3.id, v.event1.id], energy: 5 },
      { void: [v.vanilla1.id] },
    );
    const [two, one, three, spell] = ids.player.void;
    const [theirs] = ids.enemy.void;
    expect(voidPlays(state).sort()).toEqual([two, one].sort());
    // Only the void its controller owns: the opponent's matching card is never covered, by either side.
    expect(playPermission(state, engine.catalog, theirs, "player")).toBeNull();
    expect(playRoutes(state, engine.catalog, theirs, "void")).toEqual([]);
    expect(voidPlays(state).includes(three) || voidPlays(state).includes(spell)).toBe(false);

    const played = act(state, "player", fromVoid(two));
    expect(played.prompts).toEqual([]);
    expect(played.state.sides.player.currentEnergy).toBe(3);
    const resolved = resolveStack(played.state);
    const first = resolved.instances[two];
    expect([first.zone, first.status.reclaimed, first.status.playedViaReclaim]).toEqual(["play", false, false]);
    // A lasting permission is not used up.
    expect(resolved.floating).toEqual([]);
    expect(voidPlays(resolved)).toEqual([one]);
    expect(zoneOf(resolveStack(act(resolved, "player", fromVoid(one)).state), one)).toBe("play");

    // Without its source in play, nothing is covered.
    const away = placed({ void: [PERMIT.lowCharacters.id, v.vanilla2.id], energy: 5 });
    expect(voidPlays(away.state)).toEqual([]);
  });

  it("puts an event played by a permission into the void as it resolves, not banished, and replays it while the permission lasts", () => {
    const { state, ids } = placed({ back: [PERMIT.anything.id], void: [v.event1.id], energy: 2 });
    const [spell] = ids.player.void;
    const after = resolveStack(act(state, "player", fromVoid(spell)).state);
    expect(zoneOf(after, spell)).toBe("void");
    expect(after.instances[spell]?.status.reclaimed).toBe(false);
    expect(after.sides.player.currentEnergy).toBe(1);
    expect(voidPlays(after)).toEqual([spell]);
  });

  it("gives one play of an event from the void per activation, used up as that card is played and kept into later turns until then", () => {
    const { state, ids } = placed({ back: [PERMIT.technician.id], void: [v.event1.id, v.event0.id, v.vanilla1.id], energy: 3 });
    const [spell, free, character] = ids.player.void;
    expect(voidPlays(state)).toEqual([]);
    const granted = act(state, "player", activate(ids.player.back[0]));
    expect(granted.events).toContainEqual(
      expect.objectContaining({
        kind: "effectStarted",
        expiry: { at: "never" },
        change: { kind: "playFrom", player: "player", zone: "void", instance: null, filter: { cardType: "event" }, next: true },
      }),
    );
    const open = resolveStack(granted.state);
    expect(voidPlays(open).sort()).toEqual([spell, free].sort());
    expect(voidPlays(open)).not.toContain(character);

    const played = act(open, "player", fromVoid(spell));
    const permission = open.floating[0].id;
    expect(played.events).toContainEqual({ kind: "effectEnded", effect: permission });
    expect(played.state.floating).toEqual([]);
    const after = resolveStack(played.state);
    expect(zoneOf(after, spell)).toBe("void");
    expect(voidPlays(after)).toEqual([]);

    // Unused, it lasts: no duration is stated.
    const later = nextPlayerDay(open);
    expect(later.turn.turnNumber).toBeGreaterThan(open.turn.turnNumber);
    expect(voidPlays(later).sort()).toEqual([spell, free].sort());
  });

  it("uses a lasting permission ahead of a one-play permission, and one one-play permission of several", () => {
    const grantTwice = (back: readonly (typeof PERMIT)[keyof typeof PERMIT]["id"][]) => {
      const { state, ids } = placed({ back, void: [v.event0.id] });
      const once = resolveStack(act(state, "player", activate(ids.player.back[0])).state);
      return { state: resolveStack(act(once, "player", activate(ids.player.back[1])).state), spell: ids.player.void[0] };
    };
    // The static permission covers the play, so neither one-play permission is used.
    const lasting = grantTwice([PERMIT.technician.id, PERMIT.technician.id, PERMIT.anything.id]);
    expect(lasting.state.floating).toHaveLength(2);
    expect(resolveStack(act(lasting.state, "player", fromVoid(lasting.spell)).state).floating).toEqual(lasting.state.floating);
    // Without it, the play uses only the earlier one.
    const single = grantTwice([PERMIT.technician.id, PERMIT.technician.id]);
    const [earlier, later] = single.state.floating;
    expect(playPermission(single.state, engine.catalog, single.spell, "player")).toEqual({ consumes: earlier.id });
    expect(act(single.state, "player", fromVoid(single.spell)).state.floating).toEqual([later]);
  });

  it("lets the discarded card be played from the void this turn, and no other card, ending as the turn ends", () => {
    const { state, ids } = placed({ back: [PERMIT.salvager.id], hand: [PERMIT.discarder.id, v.vanilla2.id], void: [v.vanilla3.id], energy: 2 });
    const [, discarded] = ids.player.hand;
    const [other] = ids.player.void;
    const after = resolveStack(act(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new Answering(() => [discarded])).state);
    expect(zoneOf(after, discarded)).toBe("void");
    expect(after.floating.map((effect) => [effect.expiry, effect.change])).toEqual([
      [{ at: "endOfTurn" }, { kind: "playFrom", player: "player", zone: "void", instance: discarded, filter: {}, next: false }],
    ]);
    expect(voidPlays(after)).toEqual([discarded]);
    expect(voidPlays(after)).not.toContain(other);
    // The void is public: both players see the permission.
    for (const viewer of ["player", "enemy"] as const) expect(engine.view(after, viewer).floating).toHaveLength(1);
    const played = resolveStack(act(after, "player", fromVoid(discarded)).state);
    expect(zoneOf(played, discarded)).toBe("play");
    expect(played.sides.player.currentEnergy).toBe(0);
    // It lasts the turn: playing the card does not use it up.
    expect(played.floating).toEqual(after.floating);

    const ended = passUntil(engine, after, at(engine, "enemy", "day"));
    expect(ended.events.filter((event) => event.kind === "effectEnded")).toHaveLength(1);
    expect(ended.state.floating).toEqual([]);
    expect(voidPlays(passUntil(engine, ended.state, at(engine, "player", "day")).state)).toEqual([]);
  });

  it("covers no card when the discarded card is not in its owner's void: a card the opponent owns, or one that ceased to exist", () => {
    const { state, ids } = placed({ back: [PERMIT.salvager.id], hand: [PERMIT.discarder.id], energy: 2 }, { hand: [v.vanilla1.id] });
    const [theirs] = ids.enemy.hand;
    // The player holds a card the opponent owns.
    const held: BattleState = {
      ...state,
      instances: { ...state.instances, [theirs]: { ...state.instances[theirs], controller: "player" } },
      sides: { ...state.sides, player: { ...state.sides.player, hand: [...state.sides.player.hand, theirs] }, enemy: { ...state.sides.enemy, hand: [] } },
    };
    const after = resolveStack(act(held, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new Answering(() => [theirs])).state);
    expect(zoneOf(after, theirs)).toBe("void");
    expect(after.sides.enemy.void).toEqual([theirs]);
    expect(after.floating).toEqual([]);
    expect(voidPlays(after)).toEqual([]);

    const created = placed({ back: [PERMIT.salvager.id, v.vanilla1.id], hand: [ZONE.handEcho.id, PERMIT.discarder.id], energy: 5 });
    const copied = resolveStack(act(created.state, "player", { kind: "play", card: created.ids.player.hand[0], from: "hand" }).state);
    const copy = copied.sides.player.hand.find((id) => id !== created.ids.player.hand[1])!;
    expect(copied.instances[copy]?.status.created).toBe(true);
    const gone = resolveStack(act(copied, "player", { kind: "play", card: created.ids.player.hand[1], from: "hand" }, new Answering(() => [copy])).state);
    expect(gone.instances[copy]).toBeUndefined();
    expect(gone.floating).toEqual([]);
  });

  it("offers a void card both a permission and Reclaim cover the choice of route: its normal costs, or Reclaim and banishment", () => {
    const { state, ids } = placed({ back: [PERMIT.anything.id], void: [ZONE.reclaimDraw.id], energy: 3 });
    const [spell] = ids.player.void;
    expect(playRoutes(state, engine.catalog, spell, "void")).toEqual(["permission", "reclaim"]);
    const normal = act(state, "player", fromVoid(spell), new Answering(undefined, 0));
    expect(normal.prompts[0]).toMatchObject({ kind: "chooseMode", purpose: { role: "voidRoute" }, options: [{ mode: 0, legal: true }, { mode: 1, legal: true }] });
    expect(normal.state.sides.player.currentEnergy).toBe(1);
    const kept = resolveStack(normal.state);
    expect([zoneOf(kept, spell), kept.instances[spell]?.status.playedViaReclaim]).toEqual(["void", false]);

    const reclaimed = act(state, "player", fromVoid(spell), new Answering(undefined, 1)).state;
    expect(reclaimed.sides.player.currentEnergy).toBe(2);
    expect(reclaimed.instances[spell]?.status).toMatchObject({ reclaimed: true, playedViaReclaim: true });
    expect(zoneOf(resolveStack(reclaimed), spell)).toBe("banished");

    // A route its controller cannot pay for is not offered: the only payable route is taken.
    const poor = placed({ back: [PERMIT.anything.id], void: [ZONE.reclaimDraw.id], energy: 1 });
    const cheap = act(poor.state, "player", fromVoid(poor.ids.player.void[0]), new Answering(undefined, 0));
    expect(cheap.prompts).toEqual([]);
    expect(cheap.answers).toEqual([expect.objectContaining({ value: 1 })]);
    expect(cheap.state.instances[poor.ids.player.void[0]]?.status.reclaimed).toBe(true);
  });

  it("names cards in a void only", () => {
    expect(() => playFromZone("void", {}, { cards: everyIn("hand") })).toThrow(/void/);
    expect(() => playFromZone("void", {}, { cards: thisCardIn("deck") })).toThrow(/void/);
    expect(playFromZone("void", {}, { cards: everyIn("void") }).cards).toEqual(everyIn("void"));
  });
});


const once = () => staticAbility(playFromZone("void", { cardType: "event" }, { oncePerTurn: true }));
const onceCards = {
  source: { ...PERMIT.anything, id: syntheticId(0x7c80), costs: [energy(0)], abilities: () => [keyword("awakened"), once()] },
  double: { ...PERMIT.anything, id: syntheticId(0x7c81), abilities: () => [keyword("awakened"), once(), keyword("vengeful"), once()] },
  collector: { ...PERMIT.anything, id: syntheticId(0x7c82), abilities: () => [activated([], gainAbilities(banishCards([voidTarget({ cardType: "character" })])))] },
  characters: { ...PERMIT.anything, id: syntheticId(0x7c83), abilities: () => [staticAbility(playFromZone("void", { cardType: "character" }))] },
  costSource: { ...v.event0, id: syntheticId(0x7c86), status: "authored" as const, abilities: () => [additionalCost(abandonCost())] },
  afterWriteFail: { ...v.event0, id: syntheticId(0x7c87), synthetic: { play(ctx: StepContext) {
    // A deterministic fault on the final priority write, after the play's allowance and card move.
    Object.defineProperty(ctx.state, "priority", { writable: false });
    return {};
  } } },
  failing: { ...SELF.failing, id: syntheticId(0x7c84), cardType: "event" as const, subtype: "" as const, spark: null, abilities: () => [] },
};
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

  it("rolls back errors before and after the allowance write, leaving the original state and permission intact", () => {
    const { state, ids } = onceBoard({ back: [onceCards.source.id], void: [onceCards.failing.id, onceCards.afterWriteFail.id], energy: 3 });
    const [failing, spell] = ids.player.void;
    const beforeHash = stateHash(state);
    expect(() => onceAct(state, fromVoid(failing), new Answering(undefined, 1))).toThrow(/fails mid-step/);
    expect(stateHash(state)).toBe(beforeHash);
    let observedKeys: typeof state.oncePerTurn = [];
    expect(() => runStep(state, { kind: "play", card: spell, from: "void" }, new Answering(), onceEngine.catalog, {
      observeEvent(event, work) {
        if (event.kind !== "cardPlayed") return;
        observedKeys = [...work().oncePerTurn];
      },
    })).toThrow(/read only|Cannot assign/);
    expect(observedKeys).toEqual([onceKey(state, ids.player.back[0])]);
    expect(stateHash(state)).toBe(beforeHash);
    expect(permissionFor(state, spell)).toEqual({ consumes: null, oncePerTurn: onceKey(state, ids.player.back[0]) });
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
