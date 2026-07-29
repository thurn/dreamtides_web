import type { ReactNode } from "react";
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

/** Applies the hosted-room controller policy without hiding shared content. */
export function HostedPlaytestShell({
  children,
}: {
  readonly children: ReactNode;
}) {
  const state = useGameState();
  const actions = useActions();
  const clientId = useClientId();
  const connectedClientIds = useConnectedClientIds();
  const control = state.playtestControl;
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
      <div
        className="hosted-playtest-shell__content"
        inert
        aria-hidden="true"
      >
        {children}
      </div>
      {canTakeControl ? (
        <div className="cumulus hosted-playtest-shell__status">
          <GlassPanel
            title="Player Disconnected"
            headerSpacing="compact"
            footer={
              <GlassButton
                label="Take Control"
                variant="accent"
                placement="onGlass"
                onPress={takeControl}
              />
            }
            testId="hosted-playtest-status"
          >
            <p className="hosted-playtest-shell__message">
              The playtest is paused. Take control when you are ready to continue.
            </p>
          </GlassPanel>
        </div>
      ) : null}
    </div>
  );
}
