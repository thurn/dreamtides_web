import { describe, expect, it } from "vitest";
import { everyIn, thisCardIn } from "../../../dsl/builders";
import { playPermission } from "../../../continuous/permissions";
import { playRoutes } from "../../../rules/timing";
import type { BattleState } from "../../../state/types";
import { at, passUntil } from "../../../testing/trigger-harness";
import { ZONE } from "../../../testing/zone-cards";
import { playFromZone } from "../play-from-zone";
import { v } from "./cards-support";
import { act, activate, Answering, engine, fromVoid, PERMIT, placed, resolveStack, voidPlays, zoneOf } from "./play-from-zone-support";

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
