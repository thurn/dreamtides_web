import { useEffect } from "react";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import type { FoldState } from "../rules/fold-state";
import {
  useClientId,
  useConfirmedGameState,
  useConfirmedHead,
  useGameState,
} from "./hooks";

export interface FuzzProbeSnapshot {
  clientId: string;
  confirmedHead: number | null;
  displayedHash: string;
  confirmedHash: string;
  href: string;
  frontDoorPhase: FoldState["frontDoor"]["phase"];
  screenType: string;
  controllerClientId: string | null;
  battleId: string | null;
  displayedState: FoldState;
  confirmedState: FoldState;
}

export interface QuestFuzzProbe {
  snapshot(): FuzzProbeSnapshot;
}

declare global {
  interface Window {
    __questFuzzProbe?: QuestFuzzProbe;
  }
}

function copyState(state: FoldState): FoldState {
  return JSON.parse(JSON.stringify(state)) as FoldState;
}

/**
 * Build-flagged, read-only automation seam. It exposes copies of the two fold
 * states plus stable hashes and identities; callers cannot append events or
 * mutate live state through this surface. Production builds omit it unless the
 * certification-only VITE_FUZZ_TEST flag is explicitly enabled.
 */
export function FuzzProbe() {
  const clientId = useClientId();
  const confirmedHead = useConfirmedHead();
  const displayedState = useGameState();
  const confirmedState = useConfirmedGameState();

  useEffect(() => {
    if (import.meta.env.VITE_FUZZ_TEST !== "1") {
      return;
    }

    const probe: QuestFuzzProbe = {
      snapshot: () => ({
        clientId,
        confirmedHead,
        displayedHash: GAME_ENGINE_CONFIG.hash(displayedState),
        confirmedHash: GAME_ENGINE_CONFIG.hash(confirmedState),
        href: window.location.href,
        frontDoorPhase: confirmedState.frontDoor.phase,
        screenType: confirmedState.journey.screen.type,
        controllerClientId:
          confirmedState.playtestControl?.controllerClientId ?? null,
        battleId: confirmedState.battle?.board.battleId ?? null,
        displayedState: copyState(displayedState),
        confirmedState: copyState(confirmedState),
      }),
    };
    window.__questFuzzProbe = probe;
    return () => {
      if (window.__questFuzzProbe === probe) {
        delete window.__questFuzzProbe;
      }
    };
  }, [clientId, confirmedHead, confirmedState, displayedState]);

  return null;
}
