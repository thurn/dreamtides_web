// DreamscapeScreen — the Cumulus rendering of the inside-a-dreamscape view (the
// mobile redesign). The dreamscape fills the viewport as its scene art; each
// site floats over it as a circular SiteNode, warm Motes drift for atmosphere,
// while the router-owned CumulusJourneyChrome supplies persistent inventory and
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
import { Dreamsign } from "../components/hud/Dreamsign";
import { EssenceValue } from "../components/hud/EssenceValue";
import { Motes } from "../components/hud/Motes";
import { type ArtRef, resolveArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import type { Dreamsign as DreamsignData } from "../../types/journey";
import {
  DreamsignReplacementDialog,
  type DreamsignReplacementView,
} from "./DreamsignReplacementDialog";

/** A generated site reward ready to animate and grant on the dreamscape. */
export type InlineRewardView =
  | { kind: "essence"; amount: number }
  | {
      kind: "dreamsign";
      dreamsign: DreamsignData;
      requiresReplacement: boolean;
    };

/** Everything the screen renders, mapped from live journey state by the builder. */
export interface DreamscapeView {
  /** The dreamscape's scene art, or null while the dreamscape is unrevealed. */
  scene: ArtRef | null;
  /** Display title (used as the scene's alt text). */
  title: string;
  /** The placed, seeded, labelled site nodes. */
  sites: DreamscapeSiteModel[];
  /** Generated Essence and Reward results, keyed by the site's stable id. */
  inlineRewards: Readonly<Record<string, InlineRewardView>>;
  /** Replacement choice shown after an at-cap Reward animation. */
  replacement: DreamsignReplacementView | null;
}

export interface DreamscapeScreenProps {
  /** The view-model to render. */
  view: DreamscapeView;
  /** Enter a site; fired on a tap / click of an interactive node only. */
  onSelectSite: (siteId: string) => void;
  /** Report that an in-place reward collection animation has finished. */
  onInlineRewardAnimationComplete: (siteId: string) => void;
  /** Replace one held Dreamsign by UUID. */
  onReplaceDreamsign: (dreamsignId: string) => void;
  /** Decline the pending Dreamsign Reward. */
  onDeclineReward: () => void;
}

/** Duration of the inline grant sequence. */
const INLINE_REWARD_DURATION_SECONDS = 1.2;

/** Box measure for the collectible while its grant pulse plays at the site. */
const REWARD_DREAMSIGN_SIZE_PX = 112;

/**
 * The Cumulus dreamscape screen. Pure and props-driven: full-bleed scene art with
 * the seeded scatter of {@link SiteNode}s over it and drifting {@link Motes}.
 */
export function DreamscapeScreen({
  view,
  onSelectSite,
  onInlineRewardAnimationComplete,
  onReplaceDreamsign,
  onDeclineReward,
}: DreamscapeScreenProps) {
  const sceneUrl = view.scene !== null ? resolveArtRef(view.scene) : null;
  const [collectingSiteId, setCollectingSiteId] = useState<
    string | null
  >(null);
  const completionRequestedRef = useRef<string | null>(null);
  const onInlineRewardAnimationCompleteRef = useRef(
    onInlineRewardAnimationComplete,
  );
  useEffect(() => {
    onInlineRewardAnimationCompleteRef.current =
      onInlineRewardAnimationComplete;
  }, [onInlineRewardAnimationComplete]);
  const collectingModel =
    collectingSiteId === null
      ? null
      : (view.sites.find(
          (model) => model.site.id === collectingSiteId,
        ) ?? null);
  const collectingReward =
    collectingSiteId === null
      ? null
      : (view.inlineRewards[collectingSiteId] ?? null);

  const handleSelectSite = useCallback(
    (siteId: string) => {
      if (collectingSiteId !== null || view.replacement !== null) return;
      const model = view.sites.find((candidate) => candidate.site.id === siteId);
      if (
        model?.site.type === "Essence" ||
        model?.site.type === "Reward"
      ) {
        completionRequestedRef.current = null;
        setCollectingSiteId(siteId);
      }
      onSelectSite(siteId);
    },
    [collectingSiteId, onSelectSite, view.replacement, view.sites],
  );

  useEffect(() => {
    if (collectingSiteId === null || collectingReward === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (completionRequestedRef.current === collectingSiteId) return;
      completionRequestedRef.current = collectingSiteId;
      setCollectingSiteId(null);
      onInlineRewardAnimationCompleteRef.current(collectingSiteId);
    }, INLINE_REWARD_DURATION_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [collectingSiteId, collectingReward]);

  return (
    <div
      className="cumulus"
      data-cumulus-dreamscape=""
      data-dreamscape-title={view.title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: view.replacement === null ? undefined : 80,
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
            model.site.id === collectingSiteId,
        )
        .map((model) => {
          const isCollecting = model.site.id === collectingSiteId;
          const renderedModel =
            collectingSiteId === null
              ? model
              : { ...model, isInteractive: false };
          const isInlineRewardSite =
            model.site.type === "Essence" || model.site.type === "Reward";

          if (!isInlineRewardSite) {
            return (
              <SiteNode
                key={model.site.id}
                model={renderedModel}
                motion
                onSelect={handleSelectSite}
              />
            );
          }

          return (
            <motion.div
              key={model.site.id}
              data-essence-site-departure={
                isCollecting && model.site.type === "Essence"
                  ? model.site.id
                  : undefined
              }
              data-reward-site-departure={
                isCollecting && model.site.type === "Reward"
                  ? model.site.id
                  : undefined
              }
              initial={false}
              animate={{
                opacity:
                  isCollecting && model.site.type === "Reward"
                    ? 0
                    : isCollecting
                      ? [1, 0.55, 0, 0]
                      : 1,
              }}
              transition={
                isCollecting && model.site.type === "Essence"
                  ? {
                      duration: INLINE_REWARD_DURATION_SECONDS,
                      // Clear the site early while the gained value continues
                      // rising through the rest of the collection sequence.
                      times: [0, 0.18, 0.58, 1],
                      ease: [0.16, 1, 0.3, 1],
                    }
                  : { duration: 0 }
              }
              style={{
                position: "absolute",
                left: `${String(model.pos.x)}%`,
                top: `${String(model.pos.y)}%`,
                width: 0,
                height: 0,
                zIndex: 10,
                willChange:
                  isCollecting && model.site.type === "Essence"
                    ? "opacity"
                    : undefined,
              }}
            >
              <SiteNode
                model={{ ...renderedModel, pos: { x: 0, y: 0 } }}
                motion
                onSelect={handleSelectSite}
              />
            </motion.div>
          );
        })}

      {collectingModel !== null && collectingReward !== null && (
        <div
          key={collectingModel.site.id}
          role="status"
          aria-live="polite"
          aria-label={
            collectingReward.kind === "dreamsign"
              ? collectingReward.requiresReplacement
                ? `Found dreamsign: ${collectingReward.dreamsign.name}`
                : `Gained dreamsign: ${collectingReward.dreamsign.name}`
              : `Gained ${String(collectingReward.amount)} essence`
          }
          data-essence-collection={
            collectingModel.site.type === "Essence"
              ? collectingModel.site.id
              : undefined
          }
          data-reward-collection={
            collectingModel.site.type === "Reward"
              ? collectingModel.site.id
              : undefined
          }
          data-inline-reward-kind={collectingReward.kind}
          style={{
            position: "absolute",
            left: `${String(collectingModel.pos.x)}%`,
            top: `${String(collectingModel.pos.y)}%`,
            translate: "-50% -50%",
            width:
              collectingReward.kind === "dreamsign"
                ? REWARD_DREAMSIGN_SIZE_PX
                : undefined,
            height:
              collectingReward.kind === "dreamsign"
                ? REWARD_DREAMSIGN_SIZE_PX
                : undefined,
            zIndex: 50,
            pointerEvents: "none",
            font:
              collectingReward.kind === "essence"
                ? token("--t-display")
                : undefined,
            textShadow:
              collectingReward.kind === "essence"
                ? token("--text-outline-media")
                : undefined,
            filter:
              collectingReward.kind === "essence"
                ? "drop-shadow(var(--glow-accent-soft))"
                : undefined,
          }}
        >
          {collectingReward.kind === "dreamsign" ? (
            <>
              <motion.div
                aria-hidden="true"
                data-reward-dreamsign-pulse=""
                initial={{ opacity: 0, scale: 0.72 }}
                animate={{ opacity: [0, 0.92, 0], scale: [0.72, 1.08, 1.36] }}
                transition={{
                  duration: INLINE_REWARD_DURATION_SECONDS,
                  times: [0, 0.28, 1],
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  position: "absolute",
                  inset: `calc(-1 * ${token("--space-5")})`,
                  border: `2px solid ${token("--accent-bright")}`,
                  borderRadius: "50%",
                  boxShadow: token("--glow-accent-soft"),
                }}
              />
              <Dreamsign
                dreamsign={collectingReward.dreamsign}
                sizePx={REWARD_DREAMSIGN_SIZE_PX}
                unavailable
                variant="flat"
                testid="reward-dreamsign-collection"
              />
              <motion.div
                aria-hidden="true"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: [0, 1, 1, 0], y: [4, 0, -8, -18] }}
                transition={{
                  duration: INLINE_REWARD_DURATION_SECONDS,
                  times: [0, 0.18, 0.72, 1],
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  position: "absolute",
                  top: `calc(100% + ${token("--space-4")})`,
                  left: "50%",
                  translate: "-50% 0",
                  color: token("--text-primary"),
                  font: token("--t-caption"),
                  textShadow: token("--text-outline-media"),
                  whiteSpace: "nowrap",
                }}
              >
                {collectingReward.requiresReplacement
                  ? "Dreamsign found"
                  : "Dreamsign gained"}
              </motion.div>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.72, y: 0 }}
              animate={{
                opacity: [0, 1, 1, 0],
                scale: [0.72, 1.16, 1.08, 0.92],
                y: [0, -8, -40, -64],
              }}
              transition={{
                duration: INLINE_REWARD_DURATION_SECONDS,
                times: [0, 0.18, 0.72, 1],
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <EssenceValue amount={`+${String(collectingReward.amount)}`} />
            </motion.div>
          )}
        </div>
      )}
      {view.replacement !== null && (
        <DreamsignReplacementDialog
          view={view.replacement}
          onReplace={onReplaceDreamsign}
          onCancel={onDeclineReward}
          cancelLabel="Keep Current Dreamsigns"
          closeLabel="Decline Dreamsign reward"
        />
      )}
    </div>
  );
}
