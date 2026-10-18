// Adapter for a run's dream that cannot be played (logged by
// ./use-d97-dream.ts): the dream-unavailable screen with a way back to the
// main menu through the game switch. Wiring only.

import { useCallback } from "react";
import { D97DreamUnavailableScreen } from "../../../cumulus/screens/d97/D97DreamUnavailableScreen";
import { useGameSwitch } from "../../../session/game-switch";

export function D97DreamUnavailableAdapter() {
  const gameSwitch = useGameSwitch();
  const mainMenu = useCallback(() => gameSwitch?.openMainMenu({ source: "d97_dream_unavailable" }), [gameSwitch]);
  return <D97DreamUnavailableScreen onMainMenu={gameSwitch === null ? null : mainMenu} />;
}
