import { motion, useReducedMotion } from "framer-motion";
import type { ReactElement } from "react";
import { motionTimeSeconds } from "../primitives/motion-time";
import { token } from "../primitives/tokens";
import {
  MobileBattleScreen,
  type MobileBattleView,
} from "./MobileBattleScreen";

export interface TutorialView {
  readonly battle: MobileBattleView;
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
    </motion.main>
  );
}
