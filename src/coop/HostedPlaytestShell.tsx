import { useEffect, useRef, type ReactNode } from "react";
import { logEvent } from "../logging";
import { useActions, useClientId, useGameState } from "./hooks";

/**
 * Keeps the single local player in control of the game's single-controller
 * phases. The fold records the controller; whenever it names anyone else (a
 * loaded save, an earlier local player id), the local player takes control.
 * An unowned battle is claimed only when `claimUnownedBattle` is set (a direct
 * tutorial-battle entry); otherwise the player's first tutorial intent claims
 * it in the fold.
 */
export function HostedPlaytestShell({
  children,
  claimUnownedBattle = false,
}: {
  readonly children: ReactNode;
  readonly claimUnownedBattle?: boolean;
}) {
  const state = useGameState();
  const actions = useActions();
  const clientId = useClientId();
  const control = state.playtestControl;
  const controllerClientId = control?.controllerClientId ?? null;
  const shouldClaim =
    control?.mode === "single-controller" &&
    controllerClientId !== clientId &&
    (controllerClientId !== null ||
      (claimUnownedBattle && state.battle !== null));
  // The controller each claim replaced, so a repeated effect claims it once.
  const claimedFromRef = useRef<string | null>(null);

  useEffect(() => {
    if (!shouldClaim) return;
    const claimedFrom = controllerClientId ?? "unowned";
    if (claimedFromRef.current === claimedFrom) return;
    claimedFromRef.current = claimedFrom;
    logEvent("playtest_control_requested", {
      previousControllerClientId: controllerClientId,
      requestingClientId: clientId,
      phase: state.frontDoor.phase,
      source:
        controllerClientId === null ? "direct_tutorial_battle" : "local_player",
    });
    void actions.takePlaytestControl(controllerClientId).catch((error: unknown) => {
      console.error("Take Control failed", error);
    });
  }, [actions, clientId, controllerClientId, shouldClaim, state.frontDoor.phase]);

  return children;
}
