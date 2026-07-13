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

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  SiteNode,
  type DreamscapeSiteModel,
} from "../components/dreamscape/SiteNode";
import { EssenceValue } from "../components/hud/EssenceValue";
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
  /** Generated Essence reward amounts, keyed by the site's stable id. */
  essenceRewards: Readonly<Record<string, number>>;
}

export interface DreamscapeScreenProps {
  /** The view-model to render. */
  view: DreamscapeView;
  /** Enter a site; fired on a tap / click of an interactive node only. */
  onSelectSite: (siteId: string) => void;
  /** Report that an in-place Essence collection animation has finished. */
  onEssenceAnimationComplete: (siteId: string) => void;
}

/** Duration of the gain-and-rise animation before the collected node leaves. */
const ESSENCE_COLLECTION_DURATION_SECONDS = 1.2;

/**
 * The Cumulus dreamscape screen. Pure and props-driven: full-bleed scene art with
 * the seeded scatter of {@link SiteNode}s over it and drifting {@link Motes}.
 */
export function DreamscapeScreen({
  view,
  onSelectSite,
  onEssenceAnimationComplete,
}: DreamscapeScreenProps) {
  const sceneUrl = view.scene !== null ? resolveArtRef(view.scene) : null;
  const [collectingEssenceSiteId, setCollectingEssenceSiteId] = useState<
    string | null
  >(null);
  const completionRequestedRef = useRef<string | null>(null);
  const onEssenceAnimationCompleteRef = useRef(onEssenceAnimationComplete);
  useEffect(() => {
    onEssenceAnimationCompleteRef.current = onEssenceAnimationComplete;
  }, [onEssenceAnimationComplete]);
  const collectingModel =
    collectingEssenceSiteId === null
      ? null
      : (view.sites.find(
          (model) => model.site.id === collectingEssenceSiteId,
        ) ?? null);
  const collectingReward =
    collectingEssenceSiteId === null
      ? null
      : (view.essenceRewards[collectingEssenceSiteId] ?? null);

  const handleSelectSite = useCallback(
    (siteId: string) => {
      if (collectingEssenceSiteId !== null) return;
      const model = view.sites.find((candidate) => candidate.site.id === siteId);
      if (model?.site.type === "Essence") {
        completionRequestedRef.current = null;
        setCollectingEssenceSiteId(siteId);
      }
      onSelectSite(siteId);
    },
    [collectingEssenceSiteId, onSelectSite, view.sites],
  );

  useEffect(() => {
    if (collectingEssenceSiteId === null || collectingReward === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (completionRequestedRef.current === collectingEssenceSiteId) return;
      completionRequestedRef.current = collectingEssenceSiteId;
      setCollectingEssenceSiteId(null);
      onEssenceAnimationCompleteRef.current(collectingEssenceSiteId);
    }, ESSENCE_COLLECTION_DURATION_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [collectingEssenceSiteId, collectingReward]);

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
        .filter(
          (model) =>
            !model.site.isVisited ||
            model.site.id === collectingEssenceSiteId,
        )
        .map((model) => (
          <SiteNode
            key={model.site.id}
            model={
              collectingEssenceSiteId === null
                ? model
                : { ...model, isInteractive: false }
            }
            motion
            onSelect={handleSelectSite}
          />
        ))}

      {collectingModel !== null &&
        collectingReward !== null && (
          <motion.div
            key={collectingModel.site.id}
            role="status"
            aria-live="polite"
            aria-label={`Gained ${String(collectingReward)} essence`}
            data-essence-collection={collectingModel.site.id}
            initial={{ opacity: 0, scale: 0.72, y: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              scale: [0.72, 1.16, 1.08, 0.92],
              y: [0, -8, -40, -64],
            }}
            transition={{
              duration: ESSENCE_COLLECTION_DURATION_SECONDS,
              times: [0, 0.18, 0.72, 1],
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{
              position: "absolute",
              left: `${String(collectingModel.pos.x)}%`,
              top: `${String(collectingModel.pos.y)}%`,
              translate: "-50% -50%",
              zIndex: 50,
              pointerEvents: "none",
              font: token("--t-display"),
              textShadow: token("--text-outline-media"),
              filter: "drop-shadow(var(--glow-accent-soft))",
              willChange: "transform, opacity",
            }}
          >
            <EssenceValue amount={`+${String(collectingReward)}`} />
          </motion.div>
        )}
    </div>
  );
}
