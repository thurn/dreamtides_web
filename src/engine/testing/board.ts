import type { EngineCatalog } from "../catalog";
import { freshStatus, initialState } from "../state/create";
import type { AvatarId, CardId, DreamsignId, InstanceId, Phase, Side, Slot } from "../state/ids";
import { battleSeed, SIDES } from "../state/ids";
import type { BattleState, CardInstance, Printing } from "../state/types";

/** Places a ready figment or figment copy directly into play at the open `slot`, for rules tests. */
export function placeFigment(state: BattleState, side: Side, slot: Slot, printing: Printing, amplified = false): InstanceId {
  const id: InstanceId = `i${state.nextInstance}`;
  state.nextInstance += 1;
  state.instances[id] = { id, printing, owner: side, controller: side, zone: "play", variant: { amplified }, status: freshStatus(true), enteredZoneAt: 0 };
  const rank = slot.rank === "front" ? state.sides[side].frontRank : state.sides[side].backRank;
  if (rank[slot.index] !== null) throw new Error(`slot ${slot.rank}${String(slot.index)} is occupied`);
  rank[slot.index] = id;
  return id;
}

/** The catalog card an instance prints, for tests; throws for a figment. */
export function cardIdOf(state: BattleState, id: InstanceId): CardId {
  const printing = state.instances[id]?.printing;
  if (printing === undefined || printing.kind === "figment") throw new Error(`${id} prints no catalog card`);
  return printing.cardId;
}

export interface SideSetup {
  /** Front-rank cards by lane index (`F0`…); `null` leaves a lane empty. */
  readonly front?: readonly (CardId | null)[];
  readonly back?: readonly (CardId | null)[];
  /** Hand cards; `{ cardId, amplified: true }` places an amplified variant. */
  readonly hand?: readonly (CardId | { readonly cardId: CardId; readonly amplified: boolean })[];
  readonly deck?: readonly CardId[];
  readonly void?: readonly CardId[];
  readonly energy?: number;
  readonly score?: number;
  readonly avatar?: AvatarId;
  readonly dreamsigns?: readonly DreamsignId[];
}

export interface BoardSetup {
  readonly active: Side;
  readonly phase: Phase;
  readonly round?: number;
  readonly scoreToWin?: number;
  readonly player?: SideSetup;
  readonly enemy?: SideSetup;
}

/**
 * A committed state with cards placed directly, for rules tests. Characters
 * placed in play are ready (not exhausted). Returned with the instance IDs
 * of every placed card, in setup order per side and zone.
 */
export function boardState(
  catalog: EngineCatalog,
  setup: BoardSetup,
): { state: BattleState; ids: Record<Side, { front: (InstanceId | null)[]; back: (InstanceId | null)[]; hand: InstanceId[]; deck: InstanceId[]; void: InstanceId[] }> } {
  const state = initialState(
    {
      seed: battleSeed("board"),
      scoreToWin: setup.scoreToWin ?? 25,
      startingSide: "player",
      decks: { player: [], enemy: [] },
      dreamwell: [],
    },
    catalog,
  );
  state.turn = {
    ...state.turn,
    active: setup.active,
    phase: setup.phase,
    round: setup.round ?? 2,
    turnNumber: (setup.round ?? 2) * 2,
    sideTurns: { player: setup.round ?? 2, enemy: setup.round ?? 2 },
    lastNormal: setup.active,
  };
  const ids = {
    player: { front: [] as (InstanceId | null)[], back: [] as (InstanceId | null)[], hand: [] as InstanceId[], deck: [] as InstanceId[], void: [] as InstanceId[] },
    enemy: { front: [] as (InstanceId | null)[], back: [] as (InstanceId | null)[], hand: [] as InstanceId[], deck: [] as InstanceId[], void: [] as InstanceId[] },
  };
  const mint = (side: Side, cardId: CardId, zone: CardInstance["zone"], amplified = false): InstanceId => {
    catalog.card(cardId);
    const id: InstanceId = `i${state.nextInstance}`;
    state.nextInstance += 1;
    state.instances[id] = {
      id,
      printing: { kind: "card", cardId },
      owner: side,
      controller: side,
      zone,
      variant: { amplified },
      status: freshStatus(),
      enteredZoneAt: 0,
    };
    return id;
  };
  for (const side of SIDES) {
    const sideSetup = setup[side] ?? {};
    const sideState = state.sides[side];
    sideState.currentEnergy = sideSetup.energy ?? 0;
    sideState.maxEnergy = sideSetup.energy ?? 0;
    sideState.score = sideSetup.score ?? 0;
    if (sideSetup.avatar !== undefined) {
      catalog.avatar(sideSetup.avatar);
      sideState.avatar = { id: sideSetup.avatar, exhausted: false };
    }
    for (const dreamsign of sideSetup.dreamsigns ?? []) {
      catalog.dreamsign(dreamsign);
      sideState.dreamsigns.push({ id: dreamsign });
    }
    (sideSetup.front ?? []).forEach((cardId, lane) => {
      const id = cardId === null ? null : mint(side, cardId, "play");
      sideState.frontRank[lane] = id;
      ids[side].front.push(id);
    });
    (sideSetup.back ?? []).forEach((cardId, index) => {
      const id = cardId === null ? null : mint(side, cardId, "play");
      sideState.backRank[index] = id;
      ids[side].back.push(id);
    });
    for (const entry of sideSetup.hand ?? []) {
      const id =
        typeof entry === "string"
          ? mint(side, entry, "hand")
          : mint(side, entry.cardId, "hand", entry.amplified);
      sideState.hand.push(id);
      ids[side].hand.push(id);
    }
    for (const cardId of sideSetup.deck ?? []) {
      const id = mint(side, cardId, "deck");
      sideState.deck.push(id);
      ids[side].deck.push(id);
    }
    for (const cardId of sideSetup.void ?? []) {
      const id = mint(side, cardId, "void");
      sideState.void.push(id);
      ids[side].void.push(id);
    }
  }
  return { state, ids };
}
