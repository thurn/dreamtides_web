import type { EngineCatalog } from "../catalog";
import { initialState } from "../state/create";
import type { CardId, InstanceId, Phase, Side } from "../state/ids";
import { battleSeed, SIDES } from "../state/ids";
import type { BattleState, CardInstance } from "../state/types";

export interface SideSetup {
  /** Front-rank cards by lane index (`F0`…); `null` leaves a lane empty. */
  readonly front?: readonly (CardId | null)[];
  readonly back?: readonly (CardId | null)[];
  /** Hand cards; `{ cardId, amplified: true }` places an amplified variant. */
  readonly hand?: readonly (CardId | { readonly cardId: CardId; readonly amplified: boolean })[];
  readonly deck?: readonly CardId[];
  readonly energy?: number;
  readonly score?: number;
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
): { state: BattleState; ids: Record<Side, { front: (InstanceId | null)[]; back: (InstanceId | null)[]; hand: InstanceId[]; deck: InstanceId[] }> } {
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
    lastNormal: setup.active,
  };
  const ids = {
    player: { front: [] as (InstanceId | null)[], back: [] as (InstanceId | null)[], hand: [] as InstanceId[], deck: [] as InstanceId[] },
    enemy: { front: [] as (InstanceId | null)[], back: [] as (InstanceId | null)[], hand: [] as InstanceId[], deck: [] as InstanceId[] },
  };
  const mint = (side: Side, cardId: CardId, zone: CardInstance["zone"], amplified = false): InstanceId => {
    catalog.card(cardId);
    const id: InstanceId = `i${state.nextInstance}`;
    state.nextInstance += 1;
    state.instances[id] = {
      id,
      cardId,
      owner: side,
      controller: side,
      zone,
      variant: { amplified },
      status: { exhausted: false, gainedSpark: 0, turnSpark: 0, counters: 0, created: false },
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
  }
  return { state, ids };
}
