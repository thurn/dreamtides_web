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
  const isController = controllerClientId === clientId;
  const unclaimedTutorial =
    controllerClientId === null &&
    state.frontDoor.phase === "tutorial";
  const observer = !isController &&
    (controllerClientId !== null || unclaimedTutorial);
  if (!observer) return children;

  const contentIsInert = controllerClientId !== null;
  const canTakeControl =
    controllerClientId === null ||
    (
      connectedClientIds !== null &&
      !connectedClientIds.includes(controllerClientId)
    );
  const title = canTakeControl ? "Player Disconnected" : "Watching";

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
        inert={contentIsInert ? true : undefined}
        aria-hidden={contentIsInert ? "true" : undefined}
      >
        {children}
      </div>
      <div className="cumulus hosted-playtest-shell__status">
        <GlassPanel
          title={title}
          headerSpacing="compact"
          footer={
            canTakeControl ? (
              <GlassButton
                label="Take Control"
                variant="accent"
                placement="onGlass"
                onPress={takeControl}
              />
            ) : undefined
          }
          testId="hosted-playtest-status"
        >
          <p className="hosted-playtest-shell__message">
            {canTakeControl
              ? "The playtest is paused. Take control when you are ready to continue."
              : "You are seeing the controller’s shared playtest in real time."}
          </p>
        </GlassPanel>
      </div>
    </div>
  );
}
