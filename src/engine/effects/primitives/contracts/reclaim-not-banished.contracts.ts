import { describe, expect, it } from "vitest";
import { characteristics } from "../../../continuous/characteristics";
import { banishedAsReclaimed } from "../../../rules/zones";
import type { InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { EngineEvent } from "../../../events";
import type { CardId } from "../../../state/ids";
import { passUntil } from "../../../testing/trigger-harness";
import { reclaimNotBanished, reclaimNotBanishedPrimitive } from "../reclaim-not-banished";
import { act, engine, fromHand, fromVoid, KEEP, placed, playOn, reclaim, resolveStack, zoneOf } from "./reclaim-not-banished-support";

const dissolvedOf = (events: readonly EngineEvent[], id: InstanceId | null | undefined) =>
  events.some((event) => event.kind === "dissolved" && event.instance === id);

/** A board with the revenant reclaimed into play from the player's void, and `hand` in the player's hand. */
function reclaimedRevenant(back: readonly (CardId | null)[], hand: readonly CardId[] = [KEEP.dissolveOne.id], energy = 3) {
  const { state, ids } = placed({ back, void: [KEEP.revenant.id], hand, energy });
  const revenant = ids.player.void[0];
  return { state: reclaim(state, revenant), revenant, ids };
}

describe("reclaimNotBanished", () => {
  it("puts a reclaimed character into its owner's void as it is dissolved while its owner's ability applies, firing ▸Dissolved and ending the reclaimed status", () => {
    const { state, revenant, ids } = reclaimedRevenant([KEEP.keeper.id]);
    expect(state.instances[revenant]?.status).toMatchObject({ reclaimed: true, playedViaReclaim: true });
    const after = playOn(state, ids.player.hand[0], revenant);
    expect(zoneOf(after.state, revenant)).toBe("void");
    expect(dissolvedOf(after.events, revenant)).toBe(true);
    expect(after.state.sides.player.score).toBe(state.sides.player.score + 1);
    // How it was played stays recorded.
    expect(after.state.instances[revenant]?.status).toMatchObject({ reclaimed: false, playedViaReclaim: true });
    // Its printed Reclaim plays it from the void again, reclaimed again.
    expect(reclaim(after.state, revenant).instances[revenant]?.status.reclaimed).toBe(true);

    // Without the ability, the dissolve is replaced by banishment: no ▸Dissolved.
    const bare = reclaimedRevenant([]);
    const banished = playOn(bare.state, bare.ids.player.hand[0], bare.revenant);
    expect(zoneOf(banished.state, bare.revenant)).toBe("banished");
    expect(dissolvedOf(banished.events, bare.revenant)).toBe(false);
    expect(banished.state.sides.player.score).toBe(bare.state.sides.player.score);
  });

  it("puts a reclaimed event into the void as it resolves, where its Reclaim plays it again", () => {
    const { state, ids } = placed({ back: [KEEP.keeper.id], void: [KEEP.spell.id], energy: 3 });
    const spell = ids.player.void[0];
    const once = reclaim(state, spell);
    expect(zoneOf(once, spell)).toBe("void");
    expect(once.sides.player.score).toBe(state.sides.player.score + 1);
    expect(once.instances[spell]?.status.reclaimed).toBe(false);
    const twice = reclaim(once, spell);
    expect(zoneOf(twice, spell)).toBe("void");
    expect(twice.sides.player.score).toBe(state.sides.player.score + 2);

    const bare = placed({ void: [KEEP.spell.id], energy: 3 });
    expect(zoneOf(reclaim(bare.state, bare.ids.player.void[0]), bare.ids.player.void[0])).toBe("banished");
  });

  it("sends a reclaimed event the opponent Prevents to its destination while its owner's ability applies, and banishes it otherwise", () => {
    for (const keeper of [true, false]) {
      const { state, ids } = placed(
        { back: keeper ? [KEEP.keeper.id] : [], void: [KEEP.spell.id], energy: 3 },
        { hand: [KEEP.preventEvent.id], energy: 1 },
      );
      const spell = ids.player.void[0];
      const played = act(state, "player", fromVoid(spell)).state;
      const prevented = act(played, "enemy", fromHand(ids.enemy.hand[0]));
      const after = resolveStack(prevented.state);
      const to = keeper ? "void" : "banished";
      expect(zoneOf(after, spell)).toBe(to);
      expect([...prevented.events, ...passUntil(engine, prevented.state, (next) => next.stack.length === 0).events]).toContainEqual(
        expect.objectContaining({ kind: "prevented", instance: spell, to }),
      );
      expect(after.sides.player.score).toBe(state.sides.player.score);
      expect(after.instances[spell]?.status.reclaimed).toBe(!keeper);
    }
  });

  it("returns a reclaimed character to its owner's hand without the reclaimed status, so a later normal play is not banished", () => {
    const { state, revenant, ids } = reclaimedRevenant([KEEP.keeper.id], [KEEP.bounce.id, KEEP.dissolveOne.id, KEEP.dissolveOne.id]);
    const [bounce, dissolveKeeper, dissolveRevenant] = ids.player.hand;
    const keeper = ids.player.back[0];
    const inHand = playOn(state, bounce, revenant).state;
    expect(zoneOf(inHand, revenant)).toBe("hand");
    expect(inHand.instances[revenant]?.status.reclaimed).toBe(false);
    const alone = playOn(inHand, dissolveKeeper, keeper).state;
    expect(zoneOf(alone, keeper)).toBe("void");
    const replayed = resolveStack(act(alone, "player", fromHand(revenant)).state);
    expect(replayed.instances[revenant]?.status).toMatchObject({ reclaimed: false, playedViaReclaim: false });
    const after = playOn(replayed, dissolveRevenant, revenant);
    expect(zoneOf(after.state, revenant)).toBe("void");
    expect(dissolvedOf(after.events, revenant)).toBe(true);
  });

  it("is read as the card leaves: it covers a card reclaimed before its source entered, and not one leaving after its source left", () => {
    const { state, revenant, ids } = reclaimedRevenant([], [KEEP.keeper.id, KEEP.dissolveOne.id], 5);
    const [keeperCard, dissolveCard] = ids.player.hand;
    const covered = resolveStack(act(state, "player", fromHand(keeperCard)).state);
    expect(zoneOf(playOn(covered, dissolveCard, revenant).state, revenant)).toBe("void");

    const late = reclaimedRevenant([KEEP.keeper.id], [KEEP.dissolveOne.id, KEEP.dissolveOne.id]);
    const gone = playOn(late.state, late.ids.player.hand[0], late.ids.player.back[0]).state;
    expect(zoneOf(gone, late.ids.player.back[0])).toBe("void");
    expect(zoneOf(playOn(gone, late.ids.player.hand[1], late.revenant).state, late.revenant)).toBe("banished");
  });

  it("dissolves each character one at a time: a reclaimed card dissolved before its owner's source keeps out of banishment, one after it is banished", () => {
    // The source in B0 is dissolved first; the reclaimed card in B1 follows it.
    const after = reclaimedRevenant([KEEP.keeper.id], [KEEP.wipe.id]);
    const first = resolveStack(act(after.state, "player", fromHand(after.ids.player.hand[0])).state);
    expect([zoneOf(first, after.ids.player.back[0]), zoneOf(first, after.revenant)]).toEqual(["void", "banished"]);

    // The reclaimed card takes B0 and is dissolved while the source in B1 is still in play.
    const before = reclaimedRevenant([null, KEEP.keeper.id], [KEEP.wipe.id]);
    expect(before.state.sides.player.backRank[0]).toBe(before.revenant);
    const second = resolveStack(act(before.state, "player", fromHand(before.ids.player.hand[0])).state);
    expect([zoneOf(second, before.ids.player.back[1]), zoneOf(second, before.revenant)]).toEqual(["void", "void"]);
  });

  it("covers its own source when that card was reclaimed, as it leaves play", () => {
    const { state, ids } = placed({ void: [KEEP.selfKeeper.id, KEEP.revenant.id], hand: [KEEP.wipe.id], energy: 4 });
    const [keeper, revenant] = ids.player.void;
    const board = reclaim(reclaim(state, keeper), revenant);
    expect(board.sides.player.backRank.slice(0, 2)).toEqual([keeper, revenant]);
    const after = resolveStack(act(board, "player", fromHand(ids.player.hand[0])).state);
    expect(zoneOf(after, keeper)).toBe("void");
    expect(after.instances[keeper]?.status.reclaimed).toBe(false);
    // Dissolved after its source, the other reclaimed card is banished.
    expect(zoneOf(after, revenant)).toBe("banished");
  });

  it("covers only the cards its controller owns, whoever controls them, and follows its source's controller", () => {
    const { state, ids } = placed({ back: [KEEP.keeper.id, KEEP.revenant.id], hand: [KEEP.wipe.id] }, { back: [KEEP.revenant.id] });
    const [keeper, mine] = ids.player.back;
    const [theirs] = ids.enemy.back;
    for (const id of [mine, theirs]) state.instances[id!].status.reclaimed = true;
    const wiped = resolveStack(act(state, "player", fromHand(ids.player.hand[0])).state);
    expect([zoneOf(wiped, keeper), zoneOf(wiped, mine), zoneOf(wiped, theirs)]).toEqual(["void", "banished", "banished"]);

    // The enemy's reclaimed card under the player's control is its owner's: the player's ability does not cover it.
    const seized = placed({ back: [KEEP.keeper.id], hand: [KEEP.seize.id, KEEP.dissolveOne.id] }, { back: [KEEP.revenant.id] });
    const [seize, dissolveCard] = seized.ids.player.hand;
    const taken = seized.ids.enemy.back[0];
    seized.state.instances[taken!].status.reclaimed = true;
    const held = playOn(seized.state, seize, taken).state;
    expect(held.instances[taken!]?.controller).toBe("player");
    expect(zoneOf(playOn(held, dissolveCard, taken).state, taken)).toBe("banished");

    // The enemy's source under the player's control covers the player's reclaimed cards, not the enemy's.
    const flipped = placed({ back: [KEEP.revenant.id], hand: [KEEP.seize.id, KEEP.dissolveOne.id] }, { back: [KEEP.keeper.id, KEEP.revenant.id] });
    const [ownRevenant] = flipped.ids.player.back;
    const [theirKeeper, theirRevenant] = flipped.ids.enemy.back;
    for (const id of [ownRevenant, theirRevenant]) flipped.state.instances[id!].status.reclaimed = true;
    const gained = playOn(flipped.state, flipped.ids.player.hand[0], theirKeeper).state;
    expect(banishedAsReclaimed(gained, engine.catalog, gained.instances[ownRevenant!])).toBe(false);
    expect(banishedAsReclaimed(gained, engine.catalog, gained.instances[theirRevenant!])).toBe(true);
    expect(zoneOf(playOn(gained, flipped.ids.player.hand[1], ownRevenant).state, ownRevenant)).toBe("void");
  });

  it("lets a reclaimed character banished by an effect return as that effect ends, as no reclaimed card does", () => {
    for (const keeper of [true, false]) {
      const { state, revenant, ids } = reclaimedRevenant(keeper ? [KEEP.keeper.id] : [], [KEEP.exile.id]);
      const exiled = playOn(state, ids.player.hand[0], revenant).state;
      expect(zoneOf(exiled, revenant)).toBe("banished");
      const later = passUntil(engine, exiled, (next: BattleState) => next.turn.active === "enemy").state;
      expect(zoneOf(later, revenant)).toBe(keeper ? "play" : "banished");
    }
  });

  it("is a static ability's layer-6 change for its controller, starting no effect and never resolving", () => {
    const { state, ids } = placed({ hand: [KEEP.keeper.id], back: [KEEP.revenant.id], energy: 2 }, { back: [KEEP.keeper.id] });
    const played = act(state, "player", fromHand(ids.player.hand[0]));
    const resolved = passUntil(engine, played.state, (next) => next.stack.length === 0);
    expect([...played.events, ...resolved.events].map((event) => event.kind)).not.toContain("effectStarted");
    expect(resolved.state.floating).toEqual([]);
    const changes = characteristics(resolved.state, engine.catalog)
      .changes(6)
      .map(({ change, effect }) => ({ change, effect }));
    expect(changes).toHaveLength(2);
    expect(changes).toEqual(
      expect.arrayContaining([
        { change: { kind: "reclaimNotBanished", player: "player" }, effect: null },
        { change: { kind: "reclaimNotBanished", player: "enemy" }, effect: null },
      ]),
    );
    expect(reclaimNotBanishedPrimitive.staticOnly).toBe(true);
    expect(() => reclaimNotBanishedPrimitive.resolve(undefined as never, reclaimNotBanished(), undefined as never)).toThrow();
  });

  it("preserves raw reclaimed status and separately shows its owner's coverage in play and on the stack", () => {
    const { state, ids } = placed({ back: [KEEP.keeper.id, KEEP.revenant.id], hand: [KEEP.dissolveOne.id] }, { back: [KEEP.revenant.id] });
    const [keeper, mine] = ids.player.back;
    const [theirs] = ids.enemy.back;
    for (const id of [mine, theirs]) state.instances[id!].status.reclaimed = true;
    for (const viewer of ["player", "enemy"] as const) {
      const seen = engine.view(state, viewer).instances;
      expect([seen[mine!]?.status.reclaimed, seen[theirs!]?.status.reclaimed]).toEqual([true, true]);
      expect([seen[mine!]?.reclaimCovered, seen[theirs!]?.reclaimCovered]).toEqual([true, false]);
    }
    // Coverage follows the source's current presence; the raw status stays set.
    const gone = playOn(state, ids.player.hand[0], keeper).state;
    for (const viewer of ["player", "enemy"] as const) {
      expect(engine.view(gone, viewer).instances[mine!]).toMatchObject({ status: { reclaimed: true }, reclaimCovered: false });
    }

    const pending = placed({ back: [KEEP.keeper.id], void: [KEEP.spell.id], energy: 3 }, { hand: [KEEP.dissolveInterrupt.id], energy: 1 });
    const spell = pending.ids.player.void[0];
    const stacked = act(pending.state, "player", fromVoid(spell)).state;
    expect(stacked.stack).toContainEqual(expect.objectContaining({ kind: "card", instance: spell }));
    for (const viewer of ["player", "enemy"] as const) {
      expect(engine.view(stacked, viewer).instances[spell]).toMatchObject({ zone: "stack", status: { reclaimed: true }, reclaimCovered: true });
    }

    const banished = placed({ back: [KEEP.keeper.id], void: [KEEP.revenant.id] });
    const card = banished.ids.player.void[0];
    banished.state.instances[card].status.reclaimed = true;
    banished.state.sides.player.void = [];
    banished.state.sides.player.banished = [card];
    banished.state.instances[card].zone = "banished";
    for (const viewer of ["player", "enemy"] as const) {
      expect(engine.view(banished.state, viewer).instances[card]).toMatchObject({ status: { reclaimed: true }, reclaimCovered: false });
    }
  });
});
