import type { CardId, InstanceId, Side } from "../state/ids";
import { opponent } from "../state/ids";
import type { BattleState, CardInstance } from "../state/types";

/** One instance as a side sees it: hidden cards carry no card identity. */
export interface InstanceView extends Omit<CardInstance, "cardId"> {
  readonly cardId: CardId | null;
}

/**
 * What one side may know about a battle: the opponent's hand contents and
 * every deck order are hidden. This is the only thing the UI and the AI read.
 */
export interface BattleView extends Omit<BattleState, "instances" | "rng" | "dreamwell"> {
  readonly viewer: Side;
  readonly instances: Readonly<Record<InstanceId, InstanceView>>;
  readonly dreamwell: { readonly remaining: number };
}

function hiddenFrom(instance: CardInstance, viewer: Side): boolean {
  if (instance.zone === "deck") {
    return true;
  }
  return instance.zone === "hand" && instance.owner === opponent(viewer);
}

export function view(state: BattleState, viewer: Side): BattleView {
  const instances: Record<InstanceId, InstanceView> = {};
  for (const instance of Object.values(state.instances)) {
    instances[instance.id] = hiddenFrom(instance, viewer)
      ? { ...instance, cardId: null }
      : instance;
  }
  const { rng: _rng, dreamwell, instances: _all, ...rest } = state;
  const deckOrderHidden = {
    player: { ...rest.sides.player, deck: [...rest.sides.player.deck].sort() },
    enemy: { ...rest.sides.enemy, deck: [...rest.sides.enemy.deck].sort() },
  };
  return {
    ...rest,
    sides: deckOrderHidden,
    viewer,
    instances,
    dreamwell: { remaining: dreamwell.deck.length - dreamwell.next },
  };
}
