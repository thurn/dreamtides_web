// TemporalForkSiteScreen — Layaway draws one possibility from the player's
// deck anchor, flips it face up, and holds it in the encounter panel.

import { motion, useReducedMotion } from "framer-motion";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  GameCard,
  type GameCardModel,
} from "../components/card/CardView";
import {
  CARD_ASPECT_RATIO,
  CARD_ASPECT_RATIO_VALUE,
} from "../components/card/card-aspect";
import { CardBack } from "../components/battle/CardBack";
import { GlassButton } from "../components/controls/GlassButton";
import { GlassPanel } from "../components/overlay/GlassPanel";
import type { ArtRef } from "../primitives/art";
import { motionTimeSeconds } from "../primitives/motion-time";
import { token } from "../primitives/tokens";
import {
  GuideGallerySiteLayout,
  type GuideGalleryGuideView,
} from "./GuideGallerySiteLayout";
import { GUIDE_GALLERY_MOBILE_PANEL_WIDTH } from "./guide-gallery-geometry";

export interface TemporalForkSiteView {
  /** Stable site id exposed to QA and logging. */
  siteId: string;
  /** Current dreamscape scene art behind the encounter, when resolved. */
  scene: ArtRef | null;
  /** Whether Layaway is offering the enhanced home-dreamscape version. */
  isEnhanced: boolean;
  /** Resident Dream Guide art and greeting. */
  guide: GuideGalleryGuideView;
  /** UUID-backed card selected from the Temporal Fork prototype pool. */
  card: GameCardModel;
}

export interface TemporalForkSiteScreenProps {
  /** Complete presentation view-model. */
  view: TemporalForkSiteView;
  /** Channel the revealed possibility and complete the site. */
  onChannel: () => void;
}

interface RectSnapshot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface CardTrajectory {
  readonly source: RectSnapshot;
  readonly target: RectSnapshot;
  readonly sourceKind: "journey-deck" | "viewport-corner";
}

const DESKTOP_PANEL_HEIGHT = 580;
const DESKTOP_PANEL_MAX_WIDTH = 620;
const DESKTOP_CARD_WIDTH = 240;
const MOBILE_CARD_WIDTH = "min(45vw, 190px)";
const DRAW_FALLBACK_INSET = 16;
const DRAW_FALLBACK_HEIGHT = 70;
const TRAVEL_SECONDS = motionTimeSeconds("--dur-slow") * 2;
const FLIP_SECONDS = motionTimeSeconds("--dur-slow");
const FLIP_DELAY_SECONDS = motionTimeSeconds("--dur-base");
const DREAM_EASE = [0.22, 0.61, 0.36, 1] as const;

function snapshotRect(rect: DOMRect): RectSnapshot {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function sourceRectFor(target: RectSnapshot): {
  rect: RectSnapshot;
  kind: CardTrajectory["sourceKind"];
} {
  const deckTarget = document.querySelector<HTMLElement>(
    "[data-journey-deck-target]",
  );
  const deckRect = deckTarget?.getBoundingClientRect();
  if (
    deckRect !== undefined &&
    deckRect.width > 0 &&
    deckRect.height > 0
  ) {
    const height = Math.min(deckRect.height, target.height);
    const width = height * CARD_ASPECT_RATIO_VALUE;
    return {
      kind: "journey-deck",
      rect: {
        left: deckRect.left + (deckRect.width - width) / 2,
        top: deckRect.top + (deckRect.height - height) / 2,
        width,
        height,
      },
    };
  }

  // A bounded card-sized source keeps the animation reviewable even when the
  // shared HUD has not mounted yet (for example, an isolated screen test).
  const height = Math.min(DRAW_FALLBACK_HEIGHT, target.height);
  const width = height * CARD_ASPECT_RATIO_VALUE;
  return {
    kind: "viewport-corner",
    rect: {
      left: window.innerWidth - width - DRAW_FALLBACK_INSET,
      top: window.innerHeight - height - DRAW_FALLBACK_INSET,
      width,
      height,
    },
  };
}

function useCardTrajectory(
  targetRef: RefObject<HTMLDivElement | null>,
  cardId: string,
  reduceMotion: boolean,
): CardTrajectory | null {
  const [trajectory, setTrajectory] = useState<CardTrajectory | null>(null);

  useLayoutEffect(() => {
    if (reduceMotion) return;
    let frame = 0;
    const measure = (): void => {
      const targetRect = targetRef.current?.getBoundingClientRect();
      if (
        targetRect === undefined ||
        targetRect.width === 0 ||
        targetRect.height === 0
      ) {
        frame = window.requestAnimationFrame(measure);
        return;
      }
      const target = snapshotRect(targetRect);
      const source = sourceRectFor(target);
      setTrajectory({
        source: source.rect,
        target,
        sourceKind: source.kind,
      });
    };
    frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, [cardId, reduceMotion, targetRef]);

  return trajectory;
}

export function TemporalForkSiteScreen({
  view,
  onChannel,
}: TemporalForkSiteScreenProps) {
  const reduceMotion = useReducedMotion() === true;
  const cardTargetRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(reduceMotion);
  const trajectory = useCardTrajectory(
    cardTargetRef,
    view.card.cardId,
    reduceMotion,
  );

  useEffect(() => {
    if (reduceMotion) setRevealed(true);
  }, [reduceMotion]);

  return (
    <GuideGallerySiteLayout
      siteId={view.siteId}
      scene={view.scene}
      guide={view.guide}
      screenTestId="cumulus-temporal-fork-site-screen"
      guideArtTestId="cumulus-temporal-fork-guide-art"
      speechAnchorTestId="cumulus-temporal-fork-speech-anchor"
      speechBubbleTestId="cumulus-temporal-fork-speech"
      renderGallery={(layout) => (
        <section
          data-temporal-fork-panel=""
          data-temporal-fork-layout={layout}
          style={{
            position: "relative",
            zIndex: 10,
            minHeight: 0,
            height: layout === "desktop" ? DESKTOP_PANEL_HEIGHT : "100%",
            maxHeight: "100%",
            width:
              layout === "desktop"
                ? "100%"
                : GUIDE_GALLERY_MOBILE_PANEL_WIDTH,
            maxWidth:
              layout === "desktop" ? DESKTOP_PANEL_MAX_WIDTH : undefined,
            boxSizing: "border-box",
            pointerEvents: "auto",
            alignSelf: layout === "desktop" ? "center" : "start",
            justifySelf: "center",
          }}
        >
          <GlassPanel
            eyebrow={view.isEnhanced ? "Enhanced Temporal Fork" : "Temporal Fork"}
            title="Channel A Possibility"
            subtitle="A single thread rises from your deck."
            headingLevel="h1"
            titleVoice="standard"
            headerSpacing="medium"
            testId="cumulus-temporal-fork-panel"
          >
            <div
              style={{
                flex: "1 1 auto",
                minHeight: 0,
                display: "grid",
                placeItems: "center",
                padding: token("--space-7"),
              }}
            >
              <div
                style={{
                  display: "grid",
                  justifyItems: "center",
                  gap: token("--space-6"),
                }}
              >
                <div
                  ref={cardTargetRef}
                  data-temporal-fork-card-slot=""
                  data-card-id={view.card.cardId}
                  style={{
                    position: "relative",
                    width:
                      layout === "desktop"
                        ? DESKTOP_CARD_WIDTH
                        : MOBILE_CARD_WIDTH,
                    aspectRatio: CARD_ASPECT_RATIO,
                  }}
                >
                  {revealed && (
                    <GameCard
                      model={view.card}
                      testId="cumulus-temporal-fork-revealed-card"
                    />
                  )}
                </div>
                <div
                  data-temporal-fork-channel-state={
                    revealed ? "revealed" : "waiting"
                  }
                  style={{
                    minHeight: token("--touch-min"),
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {revealed && (
                    <motion.div
                      initial={{ opacity: reduceMotion ? 1 : 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: reduceMotion
                          ? 0
                          : motionTimeSeconds("--dur-base"),
                      }}
                    >
                      <GlassButton
                        label="Channel"
                        variant="accent"
                        placement="onGlass"
                        onPress={onChannel}
                        testId="cumulus-temporal-fork-channel"
                      />
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          </GlassPanel>
        </section>
      )}
    >
      {!reduceMotion && !revealed && trajectory !== null && (
        <motion.div
          data-temporal-fork-card-travel=""
          data-card-id={view.card.cardId}
          data-temporal-fork-source={trajectory.sourceKind}
          initial={{
            x: trajectory.source.left,
            y: trajectory.source.top,
            width: trajectory.source.width,
            height: trajectory.source.height,
          }}
          animate={{
            x: trajectory.target.left,
            y: trajectory.target.top,
            width: trajectory.target.width,
            height: trajectory.target.height,
          }}
          transition={{
            duration: TRAVEL_SECONDS,
            ease: DREAM_EASE,
          }}
          onAnimationComplete={() => setRevealed(true)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: token("--layer-reveal"),
            pointerEvents: "none",
            perspective: 1200,
          }}
        >
          <motion.div
            data-temporal-fork-card-flip=""
            initial={{ rotateY: 0 }}
            animate={{ rotateY: 180 }}
            transition={{
              delay: FLIP_DELAY_SECONDS,
              duration: FLIP_SECONDS,
              ease: DREAM_EASE,
            }}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              transformStyle: "preserve-3d",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
              }}
            >
              <CardBack label="Temporal Fork card, face down" />
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
              }}
            >
              <GameCard model={view.card} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </GuideGallerySiteLayout>
  );
}
