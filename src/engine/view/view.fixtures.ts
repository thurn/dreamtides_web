/**
 * Shared fixtures for the view and knowledge tests: a board holding cards in
 * every hidden and public zone, and helpers to place cards and find what a
 * side cannot see.
 */
import type { CardId, InstanceId, Side, Zone } from "../state/ids";
import type { BattleState } from "../state/types";
import { boardState } from "../testing/board";
import { fuzzEngineCatalog, SYNTHETIC_FUZZ_POOL } from "../testing/fuzz";
import { SYNTHETIC } from "../testing/synthetic-cards";
import { PROMPTING } from "../testing/synthetic-effects";
import { AVATAR, DREAMSIGN } from "../testing/stack-cards";

export const catalog = fuzzEngineCatalog(SYNTHETIC_FUZZ_POOL);
export const v = SYNTHETIC;
export const p = PROMPTING;

/** Places a new instance directly into a public zone list, or into `holder`'s hand. */
function place(state: BattleState, owner: Side, cardId: CardId, zone: Zone & ("void" | "banished" | "stack" | "hand"), holder: Side = owner): InstanceId {
  const id: InstanceId = `i${state.nextInstance}`;
  state.nextInstance += 1;
  state.instances[id] = {
    id,
    printing: { kind: "card", cardId },
    owner,
    controller: holder,
    zone,
    variant: { amplified: false },
    status: { exhausted: false, gainedSpark: 1, counters: 2, created: false, reclaimed: false, playedViaReclaim: false, offering: false, ephemeral: false, x: null },
    enteredZoneAt: 3,
  };
  if (zone === "stack") {
    state.stack.push({ kind: "card", instance: id, controller: owner, choices: [], x: null, optionalPaid: [] });
  } else {
    state.sides[holder][zone].push(id);
  }
  return id;
}

/**
 * A battle in which every card is distinct, so a card ID identifies exactly
 * one instance: both ranks, hands, decks, voids, banished cards, the stack,
 * a challenge, and a result are populated.
 */
export function fixture() {
  const { state, ids } = boardState(catalog, {
    active: "player",
    phase: "day",
    player: { front: [v.vanilla1.id], back: [v.vanilla2.id], hand: [v.vanilla3.id, v.vanilla5.id], deck: [v.vanilla8.id, v.fastCharacter.id] },
    enemy: { front: [v.vengeful1.id], back: [v.awakened2.id], hand: [v.event0.id, v.event1.id], deck: [v.fastEvent.id, v.interruptEvent.id] },
  });
  place(state, "player", v.interruptCharacter.id, "void");
  place(state, "enemy", v.vanilla0.id, "banished");
  const stacked = place(state, "player", p.discard.id, "stack");
  const enemyFront = ids.enemy.front[0];
  const playerFront = ids.player.front[0];
  if (enemyFront === null || playerFront === null) throw new Error("fixture has empty fronts");
  state.stack[0] = { kind: "card", instance: stacked, controller: "player", choices: [{ modes: [], targets: [[enemyFront, ids.enemy.hand[0]]] }], x: 2, optionalPaid: [] };
  state.stack.push({
    kind: "ability",
    source: { kind: "dreamsign", side: "player", index: 0 },
    ability: 0,
    origin: { kind: "dreamsign", id: DREAMSIGN.points.id },
    controller: "player",
    choices: { modes: [], targets: [] },
    x: null,
    optionalPaid: [true],
  });
  // A card the enemy owns, held in the player's hand.
  const held = place(state, "enemy", p.dissolveEnemy.id, "hand", "player");
  state.sides.player.avatar = { id: AVATAR.drawer.id, exhausted: true };
  state.sides.enemy.avatar = { id: AVATAR.rally.id, exhausted: false };
  state.sides.player.dreamsigns = [{ id: DREAMSIGN.points.id }];
  state.payable = [{ id: "e1", payer: "enemy", cost: 2, source: { kind: "avatar", side: "player" }, affects: [enemyFront] }];
  state.nextEffect = 2;
  state.challenge = { challengers: [playerFront], blockers: { [playerFront]: enemyFront } };
  state.result = { kind: "victory", winner: "player", reason: "score" };
  state.rng["shuffle:player"] = 4;
  return { state, ids, held };
}
