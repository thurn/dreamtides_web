import { motion, useReducedMotion } from "framer-motion";
import type { ReactElement } from "react";
import { motionTimeSeconds } from "../primitives/motion-time";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { token } from "../primitives/tokens";
import {
  CharacterDialogue,
  type CharacterDialogueModel,
} from "../components/overlay/CharacterDialogue";
import {
  MobileBattleScreen,
  type MobileBattleView,
} from "./MobileBattleScreen";

export interface TutorialView {
  readonly battle: MobileBattleView;
  readonly dialogue: CharacterDialogueModel;
}

export interface TutorialScreenProps {
  readonly view: TutorialView;
}

const TUTORIAL_FADE_SECONDS = motionTimeSeconds("--dur-loading-screen-fade");

/** Standalone tutorial battle presentation entered from the loading scene. */
export function TutorialScreen({ view }: TutorialScreenProps): ReactElement {
  const reduceMotion = useReducedMotion() === true;

  return (
    <motion.main
      className="cumulus"
      data-tutorial-screen=""
      initial={{ opacity: reduceMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : TUTORIAL_FADE_SECONDS }}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        minHeight: "100vh",
        overflow: "hidden",
        background: token("--bg-loading"),
      }}
    >
      <MobileBattleScreen
        view={view.battle}
        inspectorDefault="collapsed"
        phaseNavigation="hidden"
      />
      <div
        data-tutorial-dialogue-anchor=""
        style={{
          position: "absolute",
          zIndex: 30,
          right: token("--gutter"),
          bottom: `max(${token("--space-4")}, var(${SAFE_AREA_INSET_PROPERTIES.bottom}))`,
          left: token("--gutter"),
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <CharacterDialogue
          dialogue={view.dialogue}
          visible
          testId="tutorial-welcome-dialogue"
        />
      </div>
    </motion.main>
  );
}
