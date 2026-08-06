// AtlasScreen — the Cumulus rendering of the Dream Atlas, the between-dreamscapes
// map where the player chooses which dreamscape to enter next on the way to the
// final dream. The map orientation is decided by the view-model per viewport:
// mobile runs it VERTICALLY, reading bottom-up (the First Light Meadow starter at
// the bottom, each layer climbing toward the Apollyon boss battle at the top);
// desktop runs it left-to-right (the starter at the left, advancing to the boss
// at the right). Persistent inventory and the utility menu (deck viewer,
// glossary, atlas regenerate, ...) live in the app-shell chrome —
// the top-left hamburger on mobile, the top-right gear on desktop — so this
// screen renders no title, layer numerals, or debug chrome of its own.
//
// PURE: it renders from a view-model and reports the chosen node through
// `onEnterNode`; the adapter owns state, navigation, and logging. The screen
// owns and exports its view types. The map surface, its scale-to-fit, and the
// node hover previews live in the `AtlasMap` component; this screen composes
// that surface with drifting Motes.

import { useEffect } from "react";
import {
  AtlasMap,
  type AtlasMapEdge,
  type AtlasMapNode,
} from "../components/atlas/AtlasMap";
import { Motes } from "../components/hud/Motes";
import { CharacterDialogue } from "../components/overlay/CharacterDialogue";
import { token } from "../primitives/tokens";
import type { TutorialSpeechBubbleView } from "./tutorial-speech-bubble-view";
import { useDelayedTutorialSpeechBubbleVisibility } from "./use-delayed-tutorial-speech-bubble-visibility";

/** Everything the atlas screen renders, mapped from live journey state. */
export interface AtlasView {
  /** The design canvas the stage scales to fit (letterboxed): portrait on
   * mobile, landscape on desktop. */
  stageWidth: number;
  stageHeight: number;
  /** Placed nodes, running starter → boss along the map's layer axis. */
  nodes: AtlasMapNode[];
  /** Forward connectors between nodes. */
  edges: AtlasMapEdge[];
  /** Mira's delayed tutorial-only explanation of the Atlas. */
  guideDialogue?: TutorialSpeechBubbleView;
}

export interface AtlasScreenProps {
  /** The view-model to render. */
  view: AtlasView;
  /** Enter a node's dreamscape; fired on a tap / click of an available node. */
  onEnterNode: (nodeId: string) => void;
  /** Report when delayed tutorial guidance becomes visible. */
  onGuideDialogueShown?: () => void;
}

/**
 * The Cumulus Dream Atlas. Pure and props-driven: the vertical {@link AtlasMap}
 * of the run graph and drifting {@link Motes}.
 */
export function AtlasScreen({
  view,
  onEnterNode,
  onGuideDialogueShown,
}: AtlasScreenProps) {
  const guideDialogueVisible = useDelayedTutorialSpeechBubbleVisibility(
    view.guideDialogue?.id ?? view.guideDialogue?.model.text,
    view.guideDialogue === undefined
      ? undefined
      : (view.guideDialogue.delaySeconds ?? 0),
  );

  useEffect(() => {
    if (guideDialogueVisible) onGuideDialogueShown?.();
  }, [guideDialogueVisible, onGuideDialogueShown]);

  return (
    <div
      className="cumulus"
      data-cumulus-atlas=""
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: token("--atlas-map-background"),
      }}
    >
      <Motes on tint="violet" zIndex={1} />

      <AtlasMap
        stageWidth={view.stageWidth}
        stageHeight={view.stageHeight}
        nodes={view.nodes}
        edges={view.edges}
        onEnterNode={onEnterNode}
      />

      {view.guideDialogue !== undefined && (
        <div
          data-atlas-guide-dialogue-placement=""
          style={{
            position: "absolute",
            zIndex: 30,
            top: `calc(${token("--safe-top")} + ${token("--space-s")})`,
            left: "50%",
            width: `${String(view.guideDialogue.bubbleWidth)}px`,
            maxWidth: `calc(100vw - 2 * ${token("--gutter")})`,
            transform: `translate(calc(-50% + ${String(view.guideDialogue.horizontalOffset)}px), ${String(view.guideDialogue.verticalOffset)}px)`,
            pointerEvents: "none",
          }}
        >
          <CharacterDialogue
            dialogue={view.guideDialogue.model}
            visible={guideDialogueVisible}
            size="wide"
            testId="atlas-tutorial-dialogue"
          />
        </div>
      )}
    </div>
  );
}
