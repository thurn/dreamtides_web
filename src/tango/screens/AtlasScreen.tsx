// AtlasScreen — the Tango rendering of the Dream Atlas, the between-dreamscapes
// map where the player chooses which dreamscape to enter next on the way to the
// final dream. The map orientation is decided by the view-model per viewport:
// mobile runs it VERTICALLY, reading bottom-up (the First Light Meadow starter at
// the bottom, each layer climbing toward the Apollyon boss battle at the top);
// desktop runs it left-to-right (the starter at the left, advancing to the boss
// at the right). Either way the persistent Tango QuestStatusBar docks the run's
// essence, deck, Dreamcaller, and dreamsigns along the bottom. The utility menu
// (deck viewer, glossary, atlas regenerate, ...) lives in the app-shell chrome —
// the top-left hamburger on mobile, the top-right gear on desktop — so this
// screen renders no title, layer numerals, or debug chrome of its own.
//
// PURE: it renders from a view-model and reports the chosen node through
// `onEnterNode`; the adapter owns state, navigation, and logging. The screen
// owns and exports its view types. The map surface, its scale-to-fit, and the
// node hover previews live in the `AtlasMap` component; this screen composes
// that surface with the drifting Motes and the docked QuestStatusBar.

import { useRef } from "react";
import {
  AtlasMap,
  type AtlasMapEdge,
  type AtlasMapNode,
} from "../components/atlas/AtlasMap";
import { Motes } from "../components/hud/Motes";
import {
  QuestStatusBar,
  type QsbDreamcaller,
  type QsbDreamsign,
} from "../components/hud/QuestStatusBar";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "./use-is-desktop";

/** The bottom-HUD slice of the atlas view-model — what the QuestStatusBar docks. */
export interface AtlasHudView {
  essence: number;
  deck: number;
  dreamcaller?: QsbDreamcaller;
  dreamsigns: QsbDreamsign[];
}

/** Everything the atlas screen renders, mapped from live quest state. */
export interface AtlasView {
  /** The design canvas the stage scales to fit (letterboxed): portrait on
   * mobile, landscape on desktop. */
  stageWidth: number;
  stageHeight: number;
  /** Placed nodes, running starter → boss along the map's layer axis. */
  nodes: AtlasMapNode[];
  /** Forward connectors between nodes. */
  edges: AtlasMapEdge[];
  /** The persistent bottom-HUD data. */
  hud: AtlasHudView;
}

export interface AtlasScreenProps {
  /** The view-model to render. */
  view: AtlasView;
  /** Enter a node's dreamscape; fired on a tap / click of an available node. */
  onEnterNode: (nodeId: string) => void;
  /** Open the deck viewer; fired from the HUD deck sprite. */
  onViewDeck?: () => void;
}

/**
 * The Tango Dream Atlas. Pure and props-driven: the vertical {@link AtlasMap}
 * of the run graph, drifting {@link Motes}, and the persistent
 * {@link QuestStatusBar} docked to the bottom.
 */
export function AtlasScreen({ view, onEnterNode, onViewDeck }: AtlasScreenProps) {
  // The stage the QuestStatusBar popovers portal into, so their placement and
  // on-screen clamp use viewport coordinates.
  const stageRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();

  return (
    <div
      ref={stageRef}
      className="tango"
      data-tango-atlas=""
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: token("--dt-wash-journey"),
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

      <QuestStatusBar
        stageRef={stageRef}
        essence={view.hud.essence}
        deck={view.hud.deck}
        onViewDeck={onViewDeck}
        dreamcaller={view.hud.dreamcaller}
        dreamsigns={view.hud.dreamsigns}
        size={isDesktop ? "grand" : "compact"}
      />
    </div>
  );
}
