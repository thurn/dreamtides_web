import { motion, useReducedMotion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { motionTimeSeconds } from "../primitives/motion-time";
import { token } from "../primitives/tokens";
import type { BattleStatusDreamcallerProfile } from "../components/battle/BattleStatusDisplay";
import {
  DreamcallerPortrait,
  type DreamcallerVisual,
} from "../components/hud/DreamcallerPortrait";
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
  readonly dialogueAfterDreamcallerArrival: CharacterDialogueModel;
  readonly dreamcaller: {
    readonly visual: DreamcallerVisual;
    readonly profile: BattleStatusDreamcallerProfile;
  };
}

export interface TutorialScreenProps {
  readonly view: TutorialView;
  readonly onDialogueReplacementComplete?: () => void;
  readonly onDreamcallerArrivalComplete?: (dreamcallerId: string) => void;
}

interface TutorialDialogueAnchor {
  readonly left: number;
  readonly top: number;
}

interface TutorialDreamcallerTrajectory {
  readonly startX: number;
  readonly startY: number;
  readonly targetY: number;
  readonly startScale: number;
  readonly width: number;
  readonly height: number;
}

type TutorialDreamcallerPhase = "waiting" | "arriving" | "settled";
type TutorialDialoguePhase = "opening" | "replacing" | "nightmareCall";

const TUTORIAL_FADE_SECONDS = motionTimeSeconds(
  "--dur-loading-screen-fade",
);
const TUTORIAL_DREAMCALLER_DELAY_MS =
  motionTimeSeconds("--delay-tutorial-dreamcaller") * 1000;
const TUTORIAL_DREAMCALLER_ARRIVAL_SECONDS = motionTimeSeconds(
  "--dur-loading-screen-fade",
);
const TUTORIAL_DREAMCALLER_FADE_SECONDS = motionTimeSeconds("--dur-fast");
const TUTORIAL_DIALOGUE_REPLACEMENT_MS =
  motionTimeSeconds("--dur-slow") * 1000;

function TutorialDreamcallerArrival({
  screen,
  dreamcaller,
  onComplete,
}: {
  readonly screen: HTMLElement;
  readonly dreamcaller: DreamcallerVisual;
  readonly onComplete: () => void;
}): ReactElement | null {
  const [trajectory, setTrajectory] =
    useState<TutorialDreamcallerTrajectory | null>(null);

  useLayoutEffect(() => {
    const target = screen.querySelector<HTMLElement>(
      '[data-testid="player-battle-status"] [data-battle-status-dreamcaller-placeholder]',
    );
    const dialoguePortrait = screen.querySelector<HTMLElement>(
      "[data-character-dialogue-portrait-frame]",
    );
    if (target === null || dialoguePortrait === null) return undefined;

    const updateTrajectory = (): void => {
      const screenBox = screen.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      const dialoguePortraitBox = dialoguePortrait.getBoundingClientRect();
      const targetX = targetBox.left - screenBox.left;
      const targetY = targetBox.top - screenBox.top;
      setTrajectory({
        startX: targetX,
        startY: (screenBox.height - targetBox.height) / 2,
        targetY,
        startScale:
          targetBox.width === 0
            ? 1
            : dialoguePortraitBox.width / targetBox.width,
        width: targetBox.width,
        height: targetBox.height,
      });
    };

    updateTrajectory();
    const observer = new ResizeObserver(updateTrajectory);
    observer.observe(screen);
    observer.observe(target);
    observer.observe(dialoguePortrait);
    window.addEventListener("resize", updateTrajectory);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateTrajectory);
    };
  }, [screen]);

  if (trajectory === null) return null;

  return (
    <motion.div
      data-tutorial-dreamcaller-arrival=""
      initial={{
        x: trajectory.startX,
        y: trajectory.startY,
        scale: trajectory.startScale,
        opacity: 0,
      }}
      animate={{
        y: [trajectory.startY, trajectory.targetY],
        scale: [trajectory.startScale, 1],
        opacity: 1,
      }}
      transition={{
        duration: TUTORIAL_DREAMCALLER_ARRIVAL_SECONDS,
        times: [0, 1],
        ease: [0.22, 0.61, 0.36, 1],
        opacity: { duration: TUTORIAL_DREAMCALLER_FADE_SECONDS },
      }}
      onAnimationComplete={onComplete}
      style={{
        position: "absolute",
        zIndex: 40,
        top: 0,
        left: 0,
        width: trajectory.width,
        height: trajectory.height,
        pointerEvents: "none",
        transformOrigin: "center",
      }}
    >
      <DreamcallerPortrait dreamcaller={dreamcaller} variant="thumb" />
    </motion.div>
  );
}

/** Standalone tutorial battle presentation entered from the loading scene. */
export function TutorialScreen({
  view,
  onDialogueReplacementComplete,
  onDreamcallerArrivalComplete,
}: TutorialScreenProps): ReactElement {
  const desktop = useIsDesktop();
  const reduceMotion = useReducedMotion() === true;
  const screenRef = useRef<HTMLElement | null>(null);
  const [sceneEntered, setSceneEntered] = useState(reduceMotion);
  const [dreamcallerPhase, setDreamcallerPhase] =
    useState<TutorialDreamcallerPhase>("waiting");
  const arrivalReportedRef = useRef(false);
  const dialogueReplacementReportedRef = useRef(false);
  const [dialoguePhase, setDialoguePhase] =
    useState<TutorialDialoguePhase>("opening");
  const [dialogueAnchor, setDialogueAnchor] =
    useState<TutorialDialogueAnchor | null>(null);

  const completeDialogueReplacement = useCallback(() => {
    setDialoguePhase("nightmareCall");
    if (dialogueReplacementReportedRef.current) return;
    dialogueReplacementReportedRef.current = true;
    onDialogueReplacementComplete?.();
  }, [onDialogueReplacementComplete]);

  const settleDreamcaller = useCallback(() => {
    if (arrivalReportedRef.current) return;
    arrivalReportedRef.current = true;
    setDreamcallerPhase("settled");
    onDreamcallerArrivalComplete?.(view.dreamcaller.profile.id);
    if (reduceMotion) {
      completeDialogueReplacement();
    } else {
      setDialoguePhase("replacing");
    }
  }, [
    completeDialogueReplacement,
    onDreamcallerArrivalComplete,
    reduceMotion,
    view.dreamcaller.profile.id,
  ]);

  useEffect(() => {
    if (dialoguePhase !== "replacing") return undefined;
    const timeout = window.setTimeout(
      completeDialogueReplacement,
      TUTORIAL_DIALOGUE_REPLACEMENT_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [completeDialogueReplacement, dialoguePhase]);

  useEffect(() => {
    if (!sceneEntered || dreamcallerPhase !== "waiting") return undefined;
    const timeout = window.setTimeout(() => {
      if (reduceMotion) {
        settleDreamcaller();
      } else {
        setDreamcallerPhase("arriving");
      }
    }, TUTORIAL_DREAMCALLER_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [dreamcallerPhase, reduceMotion, sceneEntered, settleDreamcaller]);

  const battleView = useMemo<MobileBattleView>(() => {
    if (dreamcallerPhase !== "settled") return view.battle;
    return {
      ...view.battle,
      player: {
        ...view.battle.player,
        status: {
          ...view.battle.player.status,
          dreamcaller: view.dreamcaller.visual,
          dreamcallerProfile: view.dreamcaller.profile,
        },
      },
    };
  }, [dreamcallerPhase, view]);

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
  }, [desktop]);

  return (
    <motion.main
      ref={screenRef}
      className="cumulus"
      data-tutorial-screen=""
      initial={{ opacity: reduceMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : TUTORIAL_FADE_SECONDS }}
      onAnimationComplete={() => setSceneEntered(true)}
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
        view={battleView}
        inspectorDefault="collapsed"
        phaseNavigation="hidden"
      />
      {dreamcallerPhase === "arriving" && screenRef.current !== null ? (
        <TutorialDreamcallerArrival
          screen={screenRef.current}
          dreamcaller={view.dreamcaller.visual}
          onComplete={settleDreamcaller}
        />
      ) : null}
      <div
        data-tutorial-dialogue-anchor=""
        style={{
          position: "absolute",
          zIndex: 30,
          top: dialogueAnchor?.top ?? 0,
          right: desktop ? undefined : token("--gutter"),
          bottom: undefined,
          left: desktop ? (dialogueAnchor?.left ?? 0) : token("--gutter"),
          display: "flex",
          justifyContent: "flex-start",
          visibility: dialogueAnchor === null ? "hidden" : "visible",
          pointerEvents: "none",
        }}
      >
        <CharacterDialogue
          dialogue={
            dialoguePhase === "nightmareCall"
              ? view.dialogueAfterDreamcallerArrival
              : view.dialogue
          }
          size={desktop ? "prominent" : "compact"}
          visible={sceneEntered && dialoguePhase !== "replacing"}
          testId="tutorial-welcome-dialogue"
        />
      </div>
    </motion.main>
  );
}
