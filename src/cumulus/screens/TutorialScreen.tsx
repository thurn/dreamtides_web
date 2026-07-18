import { motion, useReducedMotion } from "framer-motion";
import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
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
import { useIsDesktop } from "./use-is-desktop";

export interface TutorialView {
  readonly battle: MobileBattleView;
  readonly dialogue: CharacterDialogueModel;
}

export interface TutorialScreenProps {
  readonly view: TutorialView;
}

const TUTORIAL_FADE_SECONDS = motionTimeSeconds("--dur-loading-screen-fade");

interface TutorialDialogueAnchor {
  readonly left: number;
  readonly top: number;
}

/** Standalone tutorial battle presentation entered from the loading scene. */
export function TutorialScreen({ view }: TutorialScreenProps): ReactElement {
  const reduceMotion = useReducedMotion() === true;
  const desktop = useIsDesktop();
  const screenRef = useRef<HTMLElement | null>(null);
  const [dialogueAnchor, setDialogueAnchor] =
    useState<TutorialDialogueAnchor | null>(null);

  useLayoutEffect(() => {
    if (!desktop) {
      setDialogueAnchor(null);
      return undefined;
    }

    const screen = screenRef.current;
    const dialogue = screen?.querySelector<HTMLElement>(
      "[data-character-dialogue]",
    );
    const bubble = dialogue?.querySelector<HTMLElement>("aside");
    const enemySlots = screen?.querySelectorAll<HTMLElement>(
      '[data-battle-rank="enemy-front"] [data-battle-slot-id]',
    );
    const playerSlots = screen?.querySelectorAll<HTMLElement>(
      '[data-battle-rank="player-front"] [data-battle-slot-id]',
    );
    if (
      screen === null ||
      screen === undefined ||
      dialogue === null ||
      dialogue === undefined ||
      bubble === null ||
      bubble === undefined ||
      enemySlots === undefined ||
      playerSlots === undefined ||
      enemySlots.length < 2 ||
      playerSlots.length < 2
    ) {
      return undefined;
    }

    const measuredElements = [
      screen,
      dialogue,
      bubble,
      enemySlots[0],
      enemySlots[1],
      playerSlots[0],
      playerSlots[1],
    ];
    const updateAnchor = (): void => {
      const screenBox = screen.getBoundingClientRect();
      const dialogueBox = dialogue.getBoundingClientRect();
      const bubbleBox = bubble.getBoundingClientRect();
      const enemyLeftBox = enemySlots[0].getBoundingClientRect();
      const enemyRightBox = enemySlots[1].getBoundingClientRect();
      const playerLeftBox = playerSlots[0].getBoundingClientRect();
      const playerRightBox = playerSlots[1].getBoundingClientRect();
      const frontIntersectionX =
        (enemyLeftBox.right +
          enemyRightBox.left +
          playerLeftBox.right +
          playerRightBox.left) /
        4;
      const frontIntersectionY =
        (enemyLeftBox.bottom +
          enemyRightBox.bottom +
          playerLeftBox.top +
          playerRightBox.top) /
        4;
      const next = {
        left: Math.round(
          (frontIntersectionX -
            screenBox.left -
            (bubbleBox.left - dialogueBox.left)) *
            10,
        ) / 10,
        top:
          Math.round(
            (frontIntersectionY -
              screenBox.top -
              dialogueBox.height / 2) *
              10,
          ) / 10,
      };
      setDialogueAnchor((current) =>
        current?.left === next.left && current.top === next.top
          ? current
          : next,
      );
    };

    updateAnchor();
    const observer = new ResizeObserver(updateAnchor);
    for (const element of measuredElements) observer.observe(element);
    window.addEventListener("resize", updateAnchor);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateAnchor);
    };
  }, [desktop]);

  return (
    <motion.main
      ref={screenRef}
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
          top: desktop ? (dialogueAnchor?.top ?? 0) : undefined,
          right: desktop ? undefined : token("--gutter"),
          bottom: desktop
            ? undefined
            : `max(${token("--space-4")}, var(${SAFE_AREA_INSET_PROPERTIES.bottom}))`,
          left: desktop
            ? (dialogueAnchor?.left ?? 0)
            : token("--gutter"),
          display: "flex",
          justifyContent: "flex-start",
          visibility: desktop && dialogueAnchor === null ? "hidden" : "visible",
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
