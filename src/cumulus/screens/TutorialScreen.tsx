import { motion, useReducedMotion } from "framer-motion";
import { useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { motionTimeSeconds } from "../primitives/motion-time";
import { token } from "../primitives/tokens";
import {
  CharacterDialogue,
  type CharacterDialogueModel,
} from "../components/overlay/CharacterDialogue";
import {
  MobileBattleScreen,
  type MobileBattleView,
} from "./MobileBattleScreen";
import {
  DEFAULT_TUTORIAL_DIALOGUE_TWEAKS,
  TutorialDialogueTweaksPanel,
  useApplyTutorialDialogueTweaks,
} from "./devtools/TutorialDialogueTweaksPanel";
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
  const dialogueHostRef = useRef<HTMLDivElement | null>(null);
  const [dialogueTweaks, setDialogueTweaks] = useState(
    DEFAULT_TUTORIAL_DIALOGUE_TWEAKS,
  );
  const [dialogueAnchor, setDialogueAnchor] =
    useState<TutorialDialogueAnchor | null>(null);

  useApplyTutorialDialogueTweaks(dialogueHostRef, dialogueTweaks);

  useLayoutEffect(() => {
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
      dialogue === undefined
    ) {
      return undefined;
    }

    if (
      desktop &&
      (bubble === null ||
        bubble === undefined ||
        enemySlots === undefined ||
        playerSlots === undefined ||
        enemySlots.length < 2 ||
        playerSlots.length < 2)
    ) {
      return undefined;
    }

    const measuredElements: Element[] = [screen, dialogue];
    if (bubble !== null && bubble !== undefined) measuredElements.push(bubble);
    if (enemySlots !== undefined) measuredElements.push(...enemySlots);
    if (playerSlots !== undefined) measuredElements.push(...playerSlots);
    const updateAnchor = (): void => {
      const screenBox = screen.getBoundingClientRect();
      const dialogueBox = dialogue.getBoundingClientRect();
      let next: TutorialDialogueAnchor;
      if (
        desktop &&
        bubble !== null &&
        bubble !== undefined &&
        enemySlots !== undefined &&
        playerSlots !== undefined
      ) {
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
        next = {
          left:
            Math.round(
              (frontIntersectionX -
                screenBox.left -
                (bubbleBox.left - dialogueBox.left)) *
                10,
            ) / 10,
          top:
            Math.round(
              (frontIntersectionY - screenBox.top - dialogueBox.height / 2) *
                10,
            ) / 10,
        };
      } else {
        next = {
          left: 0,
          top: Math.round((screenBox.height - dialogueBox.height) * 5) / 10,
        };
      }
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
  }, [desktop, dialogueTweaks.portraitSize, dialogueTweaks.speechBubbleSize]);

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
        ref={dialogueHostRef}
        data-tutorial-dialogue-anchor=""
        style={{
          position: "absolute",
          zIndex: 30,
          top: (dialogueAnchor?.top ?? 0) + dialogueTweaks.verticalPosition,
          right: desktop ? undefined : token("--gutter"),
          bottom: undefined,
          left: desktop
            ? (dialogueAnchor?.left ?? 0) + dialogueTweaks.horizontalPosition
            : offsetToken(token("--gutter"), dialogueTweaks.horizontalPosition),
          display: "flex",
          justifyContent: "flex-start",
          visibility: dialogueAnchor === null ? "hidden" : "visible",
          pointerEvents: "none",
        }}
      >
        <CharacterDialogue
          dialogue={view.dialogue}
          visible
          testId="tutorial-welcome-dialogue"
        />
      </div>
      {import.meta.env.DEV && (
        <TutorialDialogueTweaksPanel
          values={dialogueTweaks}
          onChange={setDialogueTweaks}
        />
      )}
    </motion.main>
  );
}

function offsetToken(tokenValue: string, offset: number): string {
  return offset === 0
    ? tokenValue
    : `calc(${tokenValue} + ${String(offset)}px)`;
}
