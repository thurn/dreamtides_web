import { motion, useReducedMotion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { motionTimeSeconds } from "../primitives/motion-time";
import { token } from "../primitives/tokens";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { GLYPHS } from "../primitives/glyph";
import { IconButton } from "../components/controls/IconButton";
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
  TutorialEditorSaveStatus,
} from "../../types/tutorial";

export interface TutorialView {
  readonly battle: MobileBattleView;
  readonly dialogue: CharacterDialogueModel | null;
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

const TUTORIAL_FADE_SECONDS = motionTimeSeconds(
  "--dur-loading-screen-fade",
);
const TUTORIAL_EDITOR_DOCK_MIN_WIDTH = 1280;

/** Standalone tutorial battle presentation entered from the loading scene. */
export function TutorialScreen({
  view,
  editor,
  onActionComplete,
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
  const [dialogueAnchor, setDialogueAnchor] =
    useState<TutorialDialogueAnchor | null>(null);
  const lastDialogue = useRef<CharacterDialogueModel | null>(view.dialogue);
  if (view.dialogue !== null) lastDialogue.current = view.dialogue;
  const renderedDialogue = view.dialogue ?? lastDialogue.current;

  useEffect(() => {
    if (!sceneEntered || view.currentAction === null || view.playbackRunId === null) {
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
            view={view.battle}
            viewport="contained"
            inspectorDefault="collapsed"
            inspectorOpen={battleInspectorOpen}
            onInspectorOpenChange={handleBattleInspectorOpenChange}
            phaseNavigation="hidden"
          />
        </div>
      </div>
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
