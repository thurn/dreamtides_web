import { tx } from "@trox/runtime";
import { useEffect, useRef, type ReactNode } from "react";
import { GlassButton } from "../cumulus/components/controls/GlassButton";
import { GlassPanel } from "../cumulus/components/overlay/GlassPanel";
import { logEvent } from "../logging";
import {
  useActions,
  useClientId,
  useConnectedClientIds,
  useGameState,
} from "./hooks";
import "./hosted-playtest-shell.css";
import { useLocalizer } from "../runtime/localization/use-localizer";

/** Applies the hosted-room controller policy without hiding shared content. */
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
  const connectedClientIds = useConnectedClientIds();
  const control = state.playtestControl;
  const resolve = useLocalizer();
  const claimRequestedRef = useRef(false);

  useEffect(() => {
    if (
      !claimUnownedBattle ||
      claimRequestedRef.current ||
      state.battle === null ||
      control?.mode !== "single-controller" ||
      control.controllerClientId !== null
    ) {
      return;
    }
    claimRequestedRef.current = true;
    logEvent("playtest_control_requested", {
      previousControllerClientId: null,
      requestingClientId: clientId,
      phase: state.frontDoor.phase,
      source: "direct_tutorial_battle",
    });
    void actions.takePlaytestControl(null).catch((error: unknown) => {
      console.error("Take Control failed", error);
    });
  }, [
    actions,
    claimUnownedBattle,
    clientId,
    control?.controllerClientId,
    control?.mode,
    state.battle,
    state.frontDoor.phase,
  ]);

  if (control?.mode !== "single-controller") return children;

  const controllerClientId = control.controllerClientId;
  if (controllerClientId === null) return children;

  const isController = controllerClientId === clientId;
  if (isController) return children;

  const canTakeControl =
    connectedClientIds !== null &&
    !connectedClientIds.includes(controllerClientId);

  const takeControl = (): void => {
    if (!canTakeControl) return;
    logEvent("playtest_control_requested", {
      previousControllerClientId: controllerClientId,
      requestingClientId: clientId,
      phase: state.frontDoor.phase,
    });
    void actions
      .takePlaytestControl(controllerClientId)
      .catch((error: unknown) => {
        console.error("Take Control failed", error);
      });
  };

  return (
    <div className="hosted-playtest-shell">
      <div className="hosted-playtest-shell__content" inert aria-hidden="true">
        {children}
      </div>
      {canTakeControl ? (
        <div className="cumulus hosted-playtest-shell__status">
          <GlassPanel
            title={tx(
              "Player Disconnected",
              "[coop] Title shown when the controller of a hosted playtest disconnects.",
            )}
            headerSpacing="compact"
            footer={
              <GlassButton
                label={tx(
                  "Take Control",
                  "[coop] Action that claims control of a paused hosted playtest.",
                )}
                variant="accent"
                placement="onGlass"
                onPress={takeControl}
              />
            }
            testId="hosted-playtest-status"
          >
            <p className="hosted-playtest-shell__message">
              {resolve(
                tx(
                  "The playtest is paused. Take control when you are ready to continue.",
                  "[coop] Status explaining that a hosted playtest paused after its controller disconnected.",
                ),
              )}
            </p>
          </GlassPanel>
        </div>
      ) : null}
    </div>
  );
}
