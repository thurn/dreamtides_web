// DreamscapeScreen — the Tango rendering of the inside-a-dreamscape view (the
// mobile redesign). The dreamscape fills the viewport as its scene art; each
// site floats over it as a circular SiteNode, warm Motes drift for atmosphere,
// and the persistent Tango QuestStatusBar docks the run's essence, deck,
// Dreamcaller, and dreamsigns along the bottom. Legibility comes from the HUD's
// outline dilation and the InfoCard reveals — never a scrim over the art.
//
// PURE: it renders from a view-model and reports the chosen site through
// `onSelectSite`; the adapter owns state, navigation, and logging. The screen
// owns and exports its view types.

import { useRef } from "react";
import {
  SiteNode,
  type DreamscapeSiteModel,
} from "../components/atlas/SiteNode";
import { Motes } from "../components/hud/Motes";
import {
  QuestStatusBar,
  type QsbDreamcaller,
  type QsbDreamsign,
} from "../components/hud/QuestStatusBar";
import { type ArtRef, resolveArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "./use-is-desktop";

/** The bottom-HUD slice of the view-model — what the QuestStatusBar docks. */
export interface DreamscapeHudView {
  /** Essence total shown in the HUD. */
  essence: number;
  /** Deck size shown on the deck sprite. */
  deck: number;
  /** The active Dreamcaller bust, or undefined before one is chosen. */
  dreamcaller?: QsbDreamcaller;
  /** The run's owned dreamsigns, docked to the left of the deck sprite. */
  dreamsigns: QsbDreamsign[];
}

/** Everything the screen renders, mapped from live quest state by the builder. */
export interface DreamscapeView {
  /** The dreamscape's scene art, or null while the dreamscape is unrevealed. */
  scene: ArtRef | null;
  /** Display title (used as the scene's alt text). */
  title: string;
  /** The placed, seeded, labelled site nodes. */
  sites: DreamscapeSiteModel[];
  /** The persistent bottom-HUD data. */
  hud: DreamscapeHudView;
}

export interface DreamscapeScreenProps {
  /** The view-model to render. */
  view: DreamscapeView;
  /** Enter a site; fired on a tap / click of an interactive node only. */
  onSelectSite: (siteId: string) => void;
}

/**
 * The Tango dreamscape screen. Pure and props-driven: full-bleed scene art with
 * the seeded scatter of {@link SiteNode}s over it, drifting {@link Motes}, and
 * the persistent {@link QuestStatusBar} docked to the bottom.
 */
export function DreamscapeScreen({ view, onSelectSite }: DreamscapeScreenProps) {
  // The stage the site reveals and the QuestStatusBar popovers portal into, so
  // their placement and on-screen clamp use stage coordinates.
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneUrl = view.scene !== null ? resolveArtRef(view.scene) : null;
  // Above the wide-viewport breakpoint the bottom HUD scales up so its essence,
  // deck, and Dreamcaller read at a comfortable desktop size. The site discs
  // keep their one system size at every viewport.
  const isDesktop = useIsDesktop();

  return (
    <div
      ref={stageRef}
      className="tango"
      data-tango-dreamscape=""
      data-dreamscape-title={view.title}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: token("--bg-app"),
        touchAction: "none",
      }}
    >
      {sceneUrl !== null && (
        <img
          src={sceneUrl}
          alt={view.title}
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "52% 64%",
            userSelect: "none",
          }}
        />
      )}

      <Motes on tint="warm" />

      {view.sites
        .filter((model) => !model.site.isVisited)
        .map((model) => (
          <SiteNode
            key={model.site.id}
            model={model}
            motion
            stageRef={stageRef}
            onSelect={onSelectSite}
          />
        ))}

      <QuestStatusBar
        stageRef={stageRef}
        essence={view.hud.essence}
        deck={view.hud.deck}
        dreamcaller={view.hud.dreamcaller}
        dreamsigns={view.hud.dreamsigns}
        size={isDesktop ? "grand" : "compact"}
      />
    </div>
  );
}
