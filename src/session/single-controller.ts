// Single-controller phases (the standalone tutorial and its battle) record a
// controller in the fold, and the rules accept their intents only from that
// controller. A local game has one player, so that player is always the
// controller: whenever the fold names anyone else (a loaded save, an earlier
// local player id), the local player takes control through an ordinary
// TAKE_PLAYTEST_CONTROL intent. An unowned battle is claimed only on a direct
// tutorial-battle entry; otherwise the player's first tutorial intent claims
// it in the fold.

import { logEvent } from "../logging";
import type { FoldState } from "../rules/fold-state";
import type { ClientId } from "../types/identifiers";
import { makeActions } from "./actions";
import type { LocalGame } from "./local-game";

/** A controller change the local player must make. */
export interface ControllerClaim {
  /** The controller the claim replaces; `null` for an unowned battle. */
  previousControllerClientId: ClientId | null;
  source: "local_player" | "direct_tutorial_battle";
}

export interface SingleControllerOptions {
  /** Claim a single-controller battle nobody controls (a direct tutorial-battle entry). */
  claimUnownedBattle: boolean;
}

/** The claim `state` needs for `localPlayerId` to control it, or null. */
export function planControllerClaim(
  state: FoldState,
  localPlayerId: ClientId,
  { claimUnownedBattle }: SingleControllerOptions,
): ControllerClaim | null {
  const control = state.playtestControl;
  if (control?.mode !== "single-controller") return null;
  const controllerClientId = control.controllerClientId;
  if (controllerClientId === localPlayerId) return null;
  if (controllerClientId !== null) {
    return { previousControllerClientId: controllerClientId, source: "local_player" };
  }
  if (claimUnownedBattle && state.battle !== null) {
    return { previousControllerClientId: null, source: "direct_tutorial_battle" };
  }
  return null;
}

/**
 * Keeps `game`'s local player in control: claims now if the fold needs it, and
 * again after any committed event that hands control elsewhere. A claim that
 * bounces is not retried against the same controller until the local player
 * holds control again. Returns the detach function.
 */
export function keepLocalPlayerInControl(
  game: Pick<LocalGame<FoldState>, "localPlayerId" | "log">,
  options: SingleControllerOptions,
): () => void {
  const actions = makeActions(
    (draft) => new Promise<number>((resolve) => resolve(game.log.append(draft))),
  );
  let claimedFrom: string | null = null;
  const claimIfNeeded = (): void => {
    const state = game.log.state();
    if (state.playtestControl?.controllerClientId === game.localPlayerId) {
      claimedFrom = null;
    }
    const claim = planControllerClaim(state, game.localPlayerId, options);
    if (claim === null) return;
    const replaced = claim.previousControllerClientId ?? "unowned";
    if (claimedFrom === replaced) return;
    claimedFrom = replaced;
    logEvent("playtest_control_requested", {
      previousControllerClientId: claim.previousControllerClientId,
      requestingClientId: game.localPlayerId,
      phase: state.frontDoor.phase,
      source: claim.source,
    });
    actions
      .takePlaytestControl(claim.previousControllerClientId)
      .catch((error: unknown) => {
        console.error("Taking control of the game failed", error);
      });
  };
  const unsubscribe = game.log.subscribe(claimIfNeeded);
  claimIfNeeded();
  return unsubscribe;
}
