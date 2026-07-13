// DreamscapeScreen — the Cumulus rendering of the inside-a-dreamscape view (the
// mobile redesign). The dreamscape fills the viewport as its scene art; each
// site floats over it as a circular SiteNode, warm Motes drift for atmosphere,
// while the router-owned CumulusQuestChrome supplies persistent inventory and
// the platform menu. Legibility comes from object treatments and InfoCard
// reveals — never a scrim over the art.
//
// PURE: it renders from a view-model and reports the chosen site through
// `onSelectSite`; the adapter owns state, navigation, and logging. The screen
// owns and exports its view types.

import {
  SiteNode,
  type DreamscapeSiteModel,
} from "../components/dreamscape/SiteNode";
import { Motes } from "../components/hud/Motes";
import { type ArtRef, resolveArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";

/** Everything the screen renders, mapped from live quest state by the builder. */
export interface DreamscapeView {
  /** The dreamscape's scene art, or null while the dreamscape is unrevealed. */
  scene: ArtRef | null;
  /** Display title (used as the scene's alt text). */
  title: string;
  /** The placed, seeded, labelled site nodes. */
  sites: DreamscapeSiteModel[];
}

export interface DreamscapeScreenProps {
  /** The view-model to render. */
  view: DreamscapeView;
  /** Enter a site; fired on a tap / click of an interactive node only. */
  onSelectSite: (siteId: string) => void;
}

/**
 * The Cumulus dreamscape screen. Pure and props-driven: full-bleed scene art with
 * the seeded scatter of {@link SiteNode}s over it and drifting {@link Motes}.
 */
export function DreamscapeScreen({
  view,
  onSelectSite,
}: DreamscapeScreenProps) {
  const sceneUrl = view.scene !== null ? resolveArtRef(view.scene) : null;

  return (
    <div
      className="cumulus"
      data-cumulus-dreamscape=""
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
            onSelect={onSelectSite}
          />
        ))}
    </div>
  );
}
