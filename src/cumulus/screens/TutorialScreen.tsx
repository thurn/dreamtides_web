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
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { GLYPHS } from "../primitives/glyph";
import { IconButton } from "../components/controls/IconButton";
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
import {
  TutorialEditorRail,
  TutorialEditorTakeover,
} from "./TutorialEditorRail";
import { MOBILE_BATTLE_INSPECTOR_RAIL_TRACK } from "./mobile-battle-layout";
import type {
  TutorialAction,
  TutorialDreamcallerOwner,
  TutorialEditorSaveStatus,
} from "../../types/tutorial";

export interface TutorialDreamcallerView {
  readonly visual: DreamcallerVisual;
  readonly profile: BattleStatusDreamcallerProfile;
  readonly settled: boolean;
}

export interface TutorialView {
  readonly battle: MobileBattleView;
  readonly dialogue: CharacterDialogueModel | null;
  readonly dreamcallers: Record<TutorialDreamcallerOwner, TutorialDreamcallerView>;
  readonly playbackRunId: string | null;
  readonly currentAction: TutorialAction | null;
}

export interface TutorialEditorView {
  readonly actions: readonly TutorialAction[];
  readonly saveStatus: TutorialEditorSaveStatus;
  readonly saveError: string | null;
}

export interface TutorialScreenProps {
  readonly view: TutorialView;
  readonly editor?: TutorialEditorView;
  readonly onActionComplete?: (runId: string, actionId: string) => void;
  readonly onDreamcallerArrivalComplete?: (
    dreamcallerId: string,
    owner: TutorialDreamcallerOwner,
  ) => void;
  readonly onEditorActionsChange?: (
    actions: readonly TutorialAction[],
    persist: boolean,
  ) => void;
  readonly onReplay?: () => void;
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

const TUTORIAL_FADE_SECONDS = motionTimeSeconds(
  "--dur-loading-screen-fade",
);
const TUTORIAL_DREAMCALLER_FADE_SECONDS = motionTimeSeconds("--dur-fast");
const TUTORIAL_EDITOR_DOCK_MIN_WIDTH = 1280;

function TutorialDreamcallerArrival({
  screen,
  dreamcaller,
  owner,
  pause,
  duration,
  onComplete,
}: {
  readonly screen: HTMLElement;
  readonly dreamcaller: DreamcallerVisual;
  readonly owner: TutorialDreamcallerOwner;
  readonly pause: number;
  readonly duration: number;
  readonly onComplete: () => void;
}): ReactElement | null {
  const [trajectory, setTrajectory] =
    useState<TutorialDreamcallerTrajectory | null>(null);

  useLayoutEffect(() => {
    const target = screen.querySelector<HTMLElement>(
      `[data-testid="${owner}-battle-status"] [data-battle-status-dreamcaller-placeholder]`,
    );
    const dialoguePortrait = screen.querySelector<HTMLElement>(
      "[data-character-dialogue-portrait-frame]",
    );
    if (target === null) return undefined;

    const updateTrajectory = (): void => {
      const screenBox = screen.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      const dialoguePortraitBox = dialoguePortrait?.getBoundingClientRect();
      setTrajectory({
        startX: targetBox.left - screenBox.left,
        startY: (screenBox.height - targetBox.height) / 2,
        targetY: targetBox.top - screenBox.top,
        startScale:
          targetBox.width === 0 || dialoguePortraitBox === undefined
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
    if (dialoguePortrait !== null) observer.observe(dialoguePortrait);
    window.addEventListener("resize", updateTrajectory);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateTrajectory);
    };
  }, [owner, screen]);

  if (trajectory === null) return null;

  return (
    <motion.div
      data-tutorial-dreamcaller-arrival=""
      data-tutorial-dreamcaller-owner={owner}
      initial={{
        x: trajectory.startX,
        y: trajectory.startY,
        scale: trajectory.startScale,
        opacity: 0,
      }}
      animate={{
        y: [trajectory.startY, trajectory.startY, trajectory.targetY],
        scale: [trajectory.startScale, trajectory.startScale, 1],
        opacity: 1,
      }}
      transition={{
        duration:
          TUTORIAL_DREAMCALLER_FADE_SECONDS +
          pause +
          duration,
        times: [
          0,
          (TUTORIAL_DREAMCALLER_FADE_SECONDS + pause) /
            (TUTORIAL_DREAMCALLER_FADE_SECONDS +
              pause +
              duration),
          1,
        ],
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
  editor,
  onActionComplete,
  onDreamcallerArrivalComplete,
  onEditorActionsChange,
  onReplay,
}: TutorialScreenProps): ReactElement {
  const desktop = useIsDesktop();
  const dockEditor = useIsDesktop(TUTORIAL_EDITOR_DOCK_MIN_WIDTH);
  const reduceMotion = useReducedMotion() === true;
  const screenRef = useRef<HTMLElement | null>(null);
  const [sceneEntered, setSceneEntered] = useState(reduceMotion);
  const [editorOpen, setEditorOpen] = useState(false);
  const [battleInspectorOpen, setBattleInspectorOpen] = useState(false);
  const [arrivedActionKey, setArrivedActionKey] = useState<string | null>(null);
  const reportedArrivalKeys = useRef<Set<string>>(new Set());
  const [dialogueAnchor, setDialogueAnchor] =
    useState<TutorialDialogueAnchor | null>(null);
  const lastDialogue = useRef<CharacterDialogueModel | null>(view.dialogue);
  if (view.dialogue !== null) lastDialogue.current = view.dialogue;
  const renderedDialogue = view.dialogue ?? lastDialogue.current;
  const dreamcallerArrival = useMemo(
    () =>
      view.playbackRunId !== null &&
      view.currentAction?.action === "animate-dreamcaller-portrait"
        ? {
            key: `${view.playbackRunId}:${view.currentAction.id}`,
            owner: view.currentAction.owner,
            pause: view.currentAction.pause,
            duration: view.currentAction.duration,
            dreamcaller: view.dreamcallers[view.currentAction.owner],
          }
        : null,
    [view.currentAction, view.dreamcallers, view.playbackRunId],
  );
  const dreamcallerSettled = useCallback(
    (owner: TutorialDreamcallerOwner): boolean =>
      view.dreamcallers[owner].settled ||
      (dreamcallerArrival?.owner === owner &&
        arrivedActionKey === dreamcallerArrival.key),
    [arrivedActionKey, dreamcallerArrival, view.dreamcallers],
  );

  const battleView = useMemo<MobileBattleView>(() => {
    const playerSettled = dreamcallerSettled("player");
    const enemySettled = dreamcallerSettled("enemy");
    if (!playerSettled && !enemySettled) return view.battle;
    return {
      ...view.battle,
      ...(playerSettled
        ? {
            player: {
              ...view.battle.player,
              status: {
                ...view.battle.player.status,
                dreamcaller: view.dreamcallers.player.visual,
                dreamcallerProfile: view.dreamcallers.player.profile,
              },
            },
          }
        : {}),
      ...(enemySettled
        ? {
            enemy: {
              ...view.battle.enemy,
              status: {
                ...view.battle.enemy.status,
                dreamcaller: view.dreamcallers.enemy.visual,
                dreamcallerProfile: view.dreamcallers.enemy.profile,
              },
            },
            inspector: {
              ...view.battle.inspector,
              opponentName: view.dreamcallers.enemy.visual.name,
            },
          }
        : {}),
    };
  }, [dreamcallerSettled, view]);

  const completeDreamcallerArrival = useCallback((): void => {
    if (dreamcallerArrival === null) return;
    if (reportedArrivalKeys.current.has(dreamcallerArrival.key)) return;
    reportedArrivalKeys.current.add(dreamcallerArrival.key);
    setArrivedActionKey(dreamcallerArrival.key);
    onDreamcallerArrivalComplete?.(
      dreamcallerArrival.dreamcaller.profile.id,
      dreamcallerArrival.owner,
    );
  }, [dreamcallerArrival, onDreamcallerArrivalComplete]);

  useEffect(() => {
    if (
      !sceneEntered ||
      view.currentAction?.action !== "display-speech-bubble" ||
      view.playbackRunId === null
    ) {
      return undefined;
    }
    const { id, wait } = view.currentAction;
    const runId = view.playbackRunId;
    const timeout = window.setTimeout(
      () => onActionComplete?.(runId, id),
      wait * 1_000,
    );
    return () => window.clearTimeout(timeout);
  }, [onActionComplete, sceneEntered, view.currentAction, view.playbackRunId]);

  useEffect(() => {
    if (
      !sceneEntered ||
      !reduceMotion ||
      dreamcallerArrival === null ||
      arrivedActionKey === dreamcallerArrival.key
    ) {
      return;
    }
    completeDreamcallerArrival();
  }, [
    arrivedActionKey,
    completeDreamcallerArrival,
    dreamcallerArrival,
    reduceMotion,
    sceneEntered,
  ]);

  useEffect(() => {
    if (
      dreamcallerArrival === null ||
      arrivedActionKey !== dreamcallerArrival.key ||
      view.currentAction?.action !== "animate-dreamcaller-portrait" ||
      view.playbackRunId === null
    ) {
      return undefined;
    }
    const { id, wait } = view.currentAction;
    const runId = view.playbackRunId;
    const timeout = window.setTimeout(
      () => onActionComplete?.(runId, id),
      wait * 1_000,
    );
    return () => window.clearTimeout(timeout);
  }, [
    arrivedActionKey,
    dreamcallerArrival,
    onActionComplete,
    view.currentAction,
    view.playbackRunId,
  ]);

  useEffect(() => {
    if (!dockEditor && editorOpen && battleInspectorOpen) {
      setEditorOpen(false);
    }
  }, [battleInspectorOpen, dockEditor, editorOpen]);

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
        const dialogueGap = Number.parseFloat(
          window.getComputedStyle(screen).getPropertyValue("--space-6"),
        );
        next = {
          left: 0,
          top:
            Math.round(
              ((screenBox.height - dialogueBox.height) / 2 -
                dialogueBox.height -
                (Number.isFinite(dialogueGap) ? dialogueGap : 0)) *
                10,
            ) / 10,
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
  }, [desktop, renderedDialogue]);

  const editorSurface =
    editor === undefined || onEditorActionsChange === undefined || onReplay === undefined
      ? null
      : {
          ...editor,
          onActionsChange: onEditorActionsChange,
          onReplay,
          onClose: () => setEditorOpen(false),
        };

  const handleBattleInspectorOpenChange = useCallback(
    (open: boolean): void => {
      setBattleInspectorOpen(open);
      if (open && !dockEditor) setEditorOpen(false);
    },
    [dockEditor],
  );

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
      <div
        data-tutorial-shell=""
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns:
            dockEditor && editorOpen
              ? `${MOBILE_BATTLE_INSPECTOR_RAIL_TRACK} minmax(0, 1fr)`
              : "minmax(0, 1fr)",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {dockEditor && editorOpen && editorSurface !== null ? (
          <TutorialEditorRail {...editorSurface} />
        ) : null}
        <div style={{ position: "relative", minWidth: 0, minHeight: 0 }}>
          <MobileBattleScreen
            view={battleView}
            viewport="contained"
            inspectorDefault="collapsed"
            inspectorOpen={battleInspectorOpen}
            onInspectorOpenChange={handleBattleInspectorOpenChange}
            phaseNavigation="hidden"
          />
        </div>
      </div>
      {sceneEntered &&
      !reduceMotion &&
      dreamcallerArrival !== null &&
      arrivedActionKey !== dreamcallerArrival.key &&
      screenRef.current !== null ? (
        <TutorialDreamcallerArrival
          screen={screenRef.current}
          dreamcaller={dreamcallerArrival.dreamcaller.visual}
          owner={dreamcallerArrival.owner}
          pause={dreamcallerArrival.pause}
          duration={dreamcallerArrival.duration}
          onComplete={completeDreamcallerArrival}
        />
      ) : null}
      {editorSurface !== null && !editorOpen ? (
        <div
          style={{
            position: "absolute",
            top: `calc(var(${SAFE_AREA_INSET_PROPERTIES.top}) + ${token("--space-4")})`,
            left: `calc(var(${SAFE_AREA_INSET_PROPERTIES.left}) + ${token("--space-4")})`,
            zIndex: 20,
          }}
        >
          <IconButton
            glyph={GLYPHS.sidebarLeft}
            size="sm"
            label="Open tutorial editor"
            ariaExpanded={false}
            ariaControls="cumulus-tutorial-editor"
            testId="tutorial-editor-trigger"
            onPress={() => {
              if (!dockEditor) setBattleInspectorOpen(false);
              setEditorOpen(true);
            }}
          />
        </div>
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
        {renderedDialogue === null ? null : (
          <CharacterDialogue
            dialogue={renderedDialogue}
            size={desktop ? "prominent" : "compact"}
            visible={sceneEntered && view.dialogue !== null}
            testId="tutorial-welcome-dialogue"
          />
        )}
      </div>
      {!dockEditor && editorOpen && editorSurface !== null ? (
        <TutorialEditorTakeover {...editorSurface} />
      ) : null}
    </motion.main>
  );
}
