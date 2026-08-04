// ExplorationSiteScreen — Layaway draws one possibility from the player's
// deck anchor, flips it face up, and holds it in the encounter panel.

import { motion, useReducedMotion } from "framer-motion";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { GameCard, type GameCardModel } from "../components/card/CardView";
import { CardGalleryPanel } from "../components/card/CardGalleryPanel";
import {
  CARD_ASPECT_RATIO,
  CARD_ASPECT_RATIO_VALUE,
  CARD_CORNER_RADIUS,
} from "../components/card/card-aspect";
import { CardBack } from "../components/battle/CardBack";
import { GlassButton } from "../components/controls/GlassButton";
import { IconButton } from "../components/controls/IconButton";
import {
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP,
} from "../components/hud/JourneyStatusBar";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { type ArtRef, resolveArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { motionTimeSeconds } from "../primitives/motion-time";
import { Pressable } from "../primitives/Pressable";
import { safeAreaInsetAtLeast } from "../primitives/safe-area";
import { token } from "../primitives/tokens";
import {
  MENU_BUTTON_PX,
  MENU_EDGE_INSET_DESKTOP_PX,
  MENU_EDGE_INSET_MOBILE_PX,
} from "./chrome-geometry";
import {
  GuideGallerySiteLayout,
  type GuideGalleryGuideView,
} from "./GuideGallerySiteLayout";
import { GUIDE_GALLERY_MOBILE_PANEL_WIDTH } from "./guide-gallery-geometry";
import { useIsDesktop } from "./use-is-desktop";

export interface ExplorationSiteView {
  /** Stable site id exposed to QA and logging. */
  siteId: string;
  /** Current dreamscape scene art behind the encounter, when resolved. */
  scene: ArtRef | null;
  /** Resident Dream Guide art and greeting. */
  guide: GuideGalleryGuideView;
  /** UUID-backed card selected from the Exploration prototype pool. */
  card: GameCardModel;
  /** Licensed full-resolution source for the selected card's frame break. */
  fullArt: ArtRef;
  /** Opening authored prose shown once the frame break fills the viewport. */
  narrative: string;
  /** The two authored actions for this encounter. */
  actions: readonly [ExplorationActionView, ExplorationActionView];
  /** Persisted response after one action has resolved. */
  response: ExplorationResponseView | null;
}

export interface ExplorationCardChoiceView {
  /** Deck-entry UUID for deck cards, card UUID for catalog offers. */
  entryId: string;
  /** Complete resolved card presentation. */
  model: GameCardModel;
  /** Whether this deck entry is a Bane. */
  isBane: boolean;
}

export type ExplorationFollowupView =
  | { readonly kind: "none" }
  | {
      readonly kind: "cards";
      readonly title: string;
      readonly subtitle: string;
      readonly cards: readonly ExplorationCardChoiceView[];
      readonly mode: "single" | "exact" | "purge-and-copy";
      readonly selectionKey: "entryIds" | "cardIds";
      readonly min: number;
      readonly max: number;
    }
  | {
      readonly kind: "packs";
      readonly title: string;
      readonly subtitle: string;
      readonly packs: readonly {
        readonly index: number;
        readonly cards: readonly ExplorationCardChoiceView[];
      }[];
    }
  | {
      readonly kind: "subtypes";
      readonly title: string;
      readonly subtitle: string;
      readonly options: readonly string[];
    }
  | {
      readonly kind: "dreamsigns";
      readonly title: string;
      readonly subtitle: string;
      readonly selectionKey: "replacedDreamsignId" | "dreamsignId";
      readonly dreamsigns: readonly {
        readonly id: string;
        readonly name: string;
        readonly effectText: string;
      }[];
    };

export interface ExplorationActionView {
  readonly id: string;
  readonly label: string;
  readonly effectText: string;
  readonly responseText: string;
  readonly followup: ExplorationFollowupView;
  readonly available: boolean;
}

export interface ExplorationResponseView {
  readonly actionLabel: string;
  readonly text: string;
}

export interface ExplorationSiteScreenProps {
  /** Complete presentation view-model. */
  view: ExplorationSiteView;
  /** Record the start of this client's frame-break presentation. */
  onChannel: () => void;
  /** Resolve one authored action with its UUID-only selection payload. */
  onResolve: (actionId: string, selection?: unknown) => void;
  /** Complete the site after the card has returned to the journey deck. */
  onExit: () => void;
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

interface FrameBreakGeometry {
  readonly frame: RectSnapshot;
  readonly art: RectSnapshot;
  readonly viewport: RectSnapshot;
}

type FrameBreakPhase =
  | "idle"
  | "fracturing"
  | "open"
  | "collapsing"
  | "returning";
type CollapseIntent = "preview" | "exit";

const DESKTOP_PANEL_HEIGHT = 580;
const DESKTOP_PANEL_MAX_WIDTH = 620;
const DESKTOP_CARD_WIDTH = 240;
const MOBILE_CARD_WIDTH = "min(45vw, 190px)";
const DRAW_FALLBACK_INSET = 16;
const DRAW_FALLBACK_HEIGHT = 70;
const TRAVEL_SECONDS = motionTimeSeconds("--dur-slow") * 2;
const FLIP_SECONDS = motionTimeSeconds("--dur-slow");
const FLIP_DELAY_SECONDS = motionTimeSeconds("--dur-base");
const FRAME_BREAK_SECONDS = motionTimeSeconds("--dur-slow") * 2.5;
const FRAME_BREAK_DELAY_SECONDS = motionTimeSeconds("--dur-fast");
const FRAME_FRACTURE_SECONDS =
  motionTimeSeconds("--dur-base") + motionTimeSeconds("--dur-fast");
const DESKTOP_NARRATIVE_PANEL_BOTTOM =
  `calc(${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP} + ${token("--space-9")})`;
// The card preview cache appends a 21px watermark strip to a 259px-tall
// content image. Licensed originals contain the 259px content region only.
const CARD_PREVIEW_CONTENT_FRACTION = 259 / 280;
// Sits above all screen-owned content (≤20) and below the journey status bar
// (40/41) and utility menu (60).
const FRAME_BREAK_LAYER = 39;
const FRAME_BREAK_EXIT_LAYER = 61;
const DREAM_EASE = [0.22, 0.61, 0.36, 1] as const;

function snapshotRect(rect: DOMRect): RectSnapshot {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function fallbackArtRect(frame: RectSnapshot): RectSnapshot {
  const sourceAspect = 5655 / 3181;
  const width = Math.max(frame.width, frame.height * sourceAspect);
  const height = width / sourceAspect;
  return {
    left: (frame.width - width) / 2,
    top: (frame.height - height) / 2,
    width,
    height,
  };
}

function measureFrameBreak(
  target: HTMLDivElement | null,
): FrameBreakGeometry | null {
  if (target === null) return null;
  const frameRect = target.getBoundingClientRect();
  if (frameRect.width <= 0 || frameRect.height <= 0) return null;
  const frame = snapshotRect(frameRect);
  const preview = target.querySelector<HTMLImageElement>(
    'img[alt]:not([alt=""])',
  );
  const previewRect = preview?.getBoundingClientRect();
  const art =
    previewRect === undefined ||
    previewRect.width <= 0 ||
    previewRect.height <= 0
      ? fallbackArtRect(frame)
      : {
          left: previewRect.left - frame.left,
          top: previewRect.top - frame.top,
          width: previewRect.width,
          height: previewRect.height * CARD_PREVIEW_CONTENT_FRACTION,
        };
  return {
    frame,
    art,
    viewport: {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    },
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
  if (deckRect !== undefined && deckRect.width > 0 && deckRect.height > 0) {
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

export function ExplorationSiteScreen({
  view,
  onChannel,
  onResolve,
  onExit,
}: ExplorationSiteScreenProps) {
  const reduceMotion = useReducedMotion() === true;
  const isDesktop = useIsDesktop();
  const cardTargetRef = useRef<HTMLDivElement>(null);
  const exitCompletedRef = useRef(false);
  const [revealed, setRevealed] = useState(reduceMotion);
  const [frameBreakGeometry, setFrameBreakGeometry] =
    useState<FrameBreakGeometry | null>(null);
  const [frameBreakActive, setFrameBreakActive] = useState(false);
  const [frameBreakPhase, setFrameBreakPhase] =
    useState<FrameBreakPhase>("idle");
  const [collapseIntent, setCollapseIntent] =
    useState<CollapseIntent>("preview");
  const [returnTrajectory, setReturnTrajectory] =
    useState<CardTrajectory | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [purgeEntryId, setPurgeEntryId] = useState<string | null>(null);
  const [selectedPackIndex, setSelectedPackIndex] = useState<number | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);
  const [selectedDreamsignId, setSelectedDreamsignId] = useState<string | null>(null);
  const fullArtUrl = resolveArtRef(view.fullArt);
  const trajectory = useCardTrajectory(
    cardTargetRef,
    view.card.cardId,
    reduceMotion,
  );
  const activeAction =
    view.actions.find((action) => action.id === activeActionId) ?? null;

  useEffect(() => {
    if (view.response === null) return;
    setActiveActionId(null);
    setSelectedIds([]);
    setPurgeEntryId(null);
    setSelectedPackIndex(null);
    setSelectedSubtype(null);
    setSelectedDreamsignId(null);
  }, [view.response]);

  useEffect(() => {
    if (reduceMotion) setRevealed(true);
  }, [reduceMotion]);

  useEffect(() => {
    if (frameBreakGeometry === null) return;
    const presence = document.querySelector<HTMLElement>(
      "[data-coop-presence-status]",
    );
    if (presence === null) return;
    const previousVisibility = presence.style.visibility;
    presence.style.visibility = "hidden";
    return () => {
      presence.style.visibility = previousVisibility;
    };
  }, [frameBreakGeometry]);

  useEffect(() => {
    if (frameBreakGeometry === null || frameBreakPhase !== "open") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (activeAction !== null && view.response === null) {
        setActiveActionId(null);
        setSelectedIds([]);
        setPurgeEntryId(null);
        return;
      }
      setCollapseIntent("preview");
      setFrameBreakActive(false);
      if (reduceMotion) {
        setFrameBreakGeometry(null);
        setFrameBreakPhase("idle");
      } else {
        setFrameBreakPhase("collapsing");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeAction, frameBreakGeometry, frameBreakPhase, reduceMotion, view.response]);

  const startFrameBreak = (): void => {
    const geometry = measureFrameBreak(cardTargetRef.current);
    if (geometry === null) return;
    setFrameBreakGeometry(geometry);
    setCollapseIntent("preview");
    setFrameBreakActive(true);
    setFrameBreakPhase(reduceMotion ? "open" : "fracturing");
    onChannel();
  };

  const collapseFrameBreak = (): void => {
    setCollapseIntent("preview");
    setFrameBreakActive(false);
    if (reduceMotion) {
      setFrameBreakGeometry(null);
      setFrameBreakPhase("idle");
    } else {
      setFrameBreakPhase("collapsing");
    }
  };

  const completeExit = (): void => {
    if (exitCompletedRef.current) return;
    exitCompletedRef.current = true;
    onExit();
  };

  const exitExploration = (): void => {
    setCollapseIntent("exit");
    setFrameBreakActive(false);
    if (reduceMotion) {
      setRevealed(false);
      setFrameBreakGeometry(null);
      setFrameBreakPhase("returning");
      completeExit();
    } else {
      setFrameBreakPhase("collapsing");
    }
  };

  const finishFrameBreakMotion = (): void => {
    if (frameBreakActive) {
      setFrameBreakPhase("open");
      return;
    }
    if (collapseIntent === "exit" && frameBreakGeometry !== null) {
      const destination = sourceRectFor(frameBreakGeometry.frame);
      setReturnTrajectory({
        source: destination.rect,
        target: frameBreakGeometry.frame,
        sourceKind: destination.kind,
      });
      setRevealed(false);
      setFrameBreakGeometry(null);
      setFrameBreakPhase("returning");
      return;
    }
    setFrameBreakGeometry(null);
    setFrameBreakPhase("idle");
  };

  const exitEdgeInset = isDesktop
    ? MENU_EDGE_INSET_DESKTOP_PX
    : MENU_EDGE_INSET_MOBILE_PX;

  const openAction = (action: ExplorationActionView): void => {
    if (action.followup.kind === "none") {
      onResolve(action.id);
      return;
    }
    setActiveActionId(action.id);
    setSelectedIds([]);
    setPurgeEntryId(null);
    setSelectedPackIndex(null);
    setSelectedSubtype(null);
    setSelectedDreamsignId(null);
  };

  const toggleCard = (entryId: string): void => {
    if (activeAction?.followup.kind !== "cards") return;
    const followup = activeAction.followup;
    if (followup.mode === "purge-and-copy") {
      if (purgeEntryId === null) {
        setPurgeEntryId(entryId);
        setSelectedIds([]);
      } else if (entryId === purgeEntryId) {
        setPurgeEntryId(null);
        setSelectedIds([]);
      } else {
        setSelectedIds((current) =>
          current.includes(entryId) ? [] : [entryId],
        );
      }
      return;
    }
    setSelectedIds((current) => {
      if (current.includes(entryId)) {
        return current.filter((candidate) => candidate !== entryId);
      }
      if (followup.mode === "single") return [entryId];
      if (current.length >= followup.max) return current;
      return [...current, entryId];
    });
  };

  const commitFollowup = (): void => {
    if (activeAction === null) return;
    const followup = activeAction.followup;
    if (followup.kind === "cards") {
      if (followup.mode === "purge-and-copy") {
        const copyEntryId = selectedIds[0];
        if (purgeEntryId === null || copyEntryId === undefined) return;
        onResolve(activeAction.id, { purgeEntryId, copyEntryId });
        return;
      }
      if (selectedIds.length < followup.min || selectedIds.length > followup.max) return;
      onResolve(activeAction.id, { [followup.selectionKey]: selectedIds });
      return;
    }
    if (followup.kind === "packs") {
      if (selectedPackIndex === null) return;
      onResolve(activeAction.id, { packIndex: selectedPackIndex });
      return;
    }
    if (followup.kind === "subtypes") {
      if (selectedSubtype === null) return;
      onResolve(activeAction.id, { subtype: selectedSubtype });
      return;
    }
    if (followup.kind === "dreamsigns") {
      if (selectedDreamsignId === null) return;
      onResolve(activeAction.id, {
        [followup.selectionKey]: selectedDreamsignId,
      });
    }
  };

  const closeFollowup = (): void => {
    setActiveActionId(null);
    setSelectedIds([]);
    setPurgeEntryId(null);
    setSelectedPackIndex(null);
    setSelectedSubtype(null);
    setSelectedDreamsignId(null);
  };

  const canCommitFollowup = (() => {
    const followup = activeAction?.followup;
    if (followup === undefined || followup.kind === "none") return false;
    if (followup.kind === "cards") {
      return followup.mode === "purge-and-copy"
        ? purgeEntryId !== null && selectedIds.length === 1
        : selectedIds.length >= followup.min && selectedIds.length <= followup.max;
    }
    if (followup.kind === "packs") return selectedPackIndex !== null;
    if (followup.kind === "subtypes") return selectedSubtype !== null;
    return selectedDreamsignId !== null;
  })();

  return (
    <GuideGallerySiteLayout
      siteId={view.siteId}
      scene={view.scene}
      guide={view.guide}
      guideVisible={false}
      screenTestId="cumulus-exploration-site-screen"
      guideArtTestId="cumulus-exploration-guide-art"
      speechAnchorTestId="cumulus-exploration-speech-anchor"
      speechBubbleTestId="cumulus-exploration-speech"
      renderGallery={(layout) => (
        <section
          data-exploration-gallery=""
          data-exploration-layout={layout}
          style={{
            position: "relative",
            zIndex: 10,
            minHeight: 0,
            height: layout === "desktop" ? DESKTOP_PANEL_HEIGHT : "100%",
            maxHeight: "100%",
            width:
              layout === "desktop" ? "100%" : GUIDE_GALLERY_MOBILE_PANEL_WIDTH,
            maxWidth:
              layout === "desktop" ? DESKTOP_PANEL_MAX_WIDTH : undefined,
            boxSizing: "border-box",
            pointerEvents: "auto",
            alignSelf: layout === "desktop" ? "center" : "start",
            justifySelf: "center",
            display: "grid",
            placeItems: "center",
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
              data-exploration-card-slot=""
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
                <motion.div
                  data-exploration-card-frame-state={frameBreakPhase}
                  animate={
                    frameBreakActive
                      ? {
                          scale: [1, 1.04, 0.98],
                          rotateZ: [0, -1.2, 1.4, 0],
                          opacity: [1, 1, 0],
                        }
                      : { scale: 1, rotateZ: 0, opacity: 1 }
                  }
                  transition={{
                    duration: reduceMotion ? 0 : FRAME_FRACTURE_SECONDS,
                    ease: DREAM_EASE,
                  }}
                  style={{ width: "100%", height: "100%" }}
                >
                  <GameCard
                    model={view.card}
                    testId="cumulus-exploration-revealed-card"
                  />
                </motion.div>
              )}
            </div>
            <div
              data-exploration-channel-state={
                !revealed
                  ? "waiting"
                  : frameBreakGeometry === null
                    ? "revealed"
                    : "channeling"
              }
              style={{
                minHeight: token("--touch-min"),
                display: "grid",
                placeItems: "center",
              }}
            >
              {revealed && frameBreakGeometry === null && (
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
                    label="Delve"
                    variant="accent"
                    placement="onMedia"
                    onPress={startFrameBreak}
                    testId="cumulus-exploration-channel"
                  />
                </motion.div>
              )}
            </div>
          </div>
        </section>
      )}
    >
      {!reduceMotion &&
        !revealed &&
        returnTrajectory === null &&
        trajectory !== null && (
        <motion.div
          data-exploration-card-travel=""
          data-card-id={view.card.cardId}
          data-exploration-source={trajectory.sourceKind}
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
            data-exploration-card-flip=""
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
              <CardBack label="Exploration card, face down" />
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
      {!reduceMotion && returnTrajectory !== null && (
        <motion.div
          data-exploration-card-return=""
          data-card-id={view.card.cardId}
          data-exploration-destination={returnTrajectory.sourceKind}
          initial={{
            x: returnTrajectory.target.left,
            y: returnTrajectory.target.top,
            width: returnTrajectory.target.width,
            height: returnTrajectory.target.height,
          }}
          animate={{
            x: returnTrajectory.source.left,
            y: returnTrajectory.source.top,
            width: returnTrajectory.source.width,
            height: returnTrajectory.source.height,
          }}
          transition={{
            duration: TRAVEL_SECONDS,
            ease: DREAM_EASE,
          }}
          onAnimationComplete={completeExit}
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
            data-exploration-card-return-flip=""
            initial={{ rotateY: 180 }}
            animate={{ rotateY: 360 }}
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
              <CardBack label="Exploration card returning face down" />
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
      <img
        src={fullArtUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading="eager"
        style={{ display: "none" }}
      />
      {frameBreakGeometry !== null && frameBreakPhase === "fracturing" && (
        <motion.div
          data-exploration-frame-fracture=""
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0.96, 1.04, 1.18],
          }}
          transition={{
            duration: FRAME_FRACTURE_SECONDS,
            ease: DREAM_EASE,
          }}
          style={{
            position: "fixed",
            top: frameBreakGeometry.frame.top,
            left: frameBreakGeometry.frame.left,
            width: frameBreakGeometry.frame.width,
            height: frameBreakGeometry.frame.height,
            zIndex: FRAME_BREAK_LAYER - 1,
            borderRadius: CARD_CORNER_RADIUS,
            boxShadow: token("--glow-accent-soft"),
            pointerEvents: "none",
          }}
        />
      )}
      {frameBreakGeometry !== null && (
        <motion.div
          data-exploration-frame-break=""
          data-exploration-frame-break-phase={frameBreakPhase}
          data-exploration-full-art-image-number={
            view.fullArt.kind === "exploration-card"
              ? view.fullArt.imageNumber
              : undefined
          }
          initial={{
            x: frameBreakGeometry.frame.left,
            y: frameBreakGeometry.frame.top,
            width: frameBreakGeometry.frame.width,
            height: frameBreakGeometry.frame.height,
            opacity: reduceMotion ? 1 : 0,
            borderRadius: CARD_CORNER_RADIUS,
          }}
          animate={
            frameBreakActive
              ? {
                  x: frameBreakGeometry.viewport.left,
                  y: frameBreakGeometry.viewport.top,
                  width: frameBreakGeometry.viewport.width,
                  height: frameBreakGeometry.viewport.height,
                  opacity: 1,
                  borderRadius: 0,
                }
              : {
                  x: frameBreakGeometry.frame.left,
                  y: frameBreakGeometry.frame.top,
                  width: frameBreakGeometry.frame.width,
                  height: frameBreakGeometry.frame.height,
                  opacity: 1,
                  borderRadius: CARD_CORNER_RADIUS,
                }
          }
          transition={{
            delay:
              !reduceMotion && frameBreakActive ? FRAME_BREAK_DELAY_SECONDS : 0,
            duration: reduceMotion ? 0 : FRAME_BREAK_SECONDS,
            ease: DREAM_EASE,
          }}
          onAnimationComplete={finishFrameBreakMotion}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: FRAME_BREAK_LAYER,
            overflow: "hidden",
            background: token("--bg-app"),
          }}
        >
          <Pressable
            aria-label="Return to Exploration"
            pressFeedback="stationary"
            hoverFeedback="stationary"
            onClick={
              frameBreakPhase === "open" ? collapseFrameBreak : undefined
            }
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              padding: 0,
              border: 0,
              overflow: "hidden",
              background: "transparent",
            }}
          >
            <motion.img
              data-exploration-full-art=""
              src={fullArtUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              initial={{
                x: frameBreakGeometry.art.left,
                y: frameBreakGeometry.art.top,
                width: frameBreakGeometry.art.width,
                height: frameBreakGeometry.art.height,
              }}
              animate={
                frameBreakActive
                  ? {
                      x: 0,
                      y: 0,
                      width: frameBreakGeometry.viewport.width,
                      height: frameBreakGeometry.viewport.height,
                    }
                  : {
                      x: frameBreakGeometry.art.left,
                      y: frameBreakGeometry.art.top,
                      width: frameBreakGeometry.art.width,
                      height: frameBreakGeometry.art.height,
                    }
              }
              transition={{
                delay:
                  !reduceMotion && frameBreakActive
                    ? FRAME_BREAK_DELAY_SECONDS
                    : 0,
                duration: reduceMotion ? 0 : FRAME_BREAK_SECONDS,
                ease: DREAM_EASE,
              }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                maxWidth: "none",
                maxHeight: "none",
                objectFit: "cover",
                objectPosition: "center",
                userSelect: "none",
              }}
            />
          </Pressable>
        </motion.div>
      )}
      {frameBreakGeometry !== null && frameBreakPhase === "open" && activeAction === null && (
        <motion.section
          data-exploration-narrative=""
          initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"),
            ease: DREAM_EASE,
          }}
          style={{
            position: "fixed",
            left: `max(var(--safe-area-inset-left), ${token("--space-5")})`,
            bottom: isDesktop
              ? DESKTOP_NARRATIVE_PANEL_BOTTOM
              : JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
            zIndex: FRAME_BREAK_EXIT_LAYER,
            width: isDesktop
              ? "min(400px, calc(100vw - 48px))"
              : `calc(100vw - ${token("--space-5")} - ${token("--space-5")})`,
            maxHeight: "calc(100vh - 96px)",
            pointerEvents: "auto",
          }}
        >
          <GlassPanel
            footer={
              view.response === null ? undefined : (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    padding: token("--space-5"),
                    paddingTop: 0,
                  }}
                >
                  <GlassButton
                    label="Continue"
                    variant="accent"
                    placement="onGlass"
                    onPress={exitExploration}
                    testId="cumulus-exploration-continue"
                  />
                </div>
              )
            }
            testId="cumulus-exploration-narrative-panel"
          >
            <div
              style={{
                display: "grid",
                gap: token("--space-5"),
                padding: token("--space-6"),
                paddingTop: token("--space-5"),
              }}
            >
              <p
                data-testid="cumulus-exploration-narrative-copy"
                style={{
                  margin: 0,
                  font: token("--t-body"),
                  color: token("--text-on-glass"),
                  lineHeight: 1.55,
                }}
              >
                {view.response?.text ?? view.narrative}
              </p>
              {view.response === null && (
                <div
                  role="group"
                  aria-label="Exploration choices"
                  style={{ display: "grid", gap: token("--space-3") }}
                >
                  {view.actions.map((action, index) => (
                    <Pressable
                      key={action.id}
                      as="button"
                      disabled={!action.available}
                      aria-describedby={`exploration-effect-${String(index)}`}
                      data-testid={`cumulus-exploration-choice-${String(index)}`}
                      onClick={() => openAction(action)}
                      style={{
                        width: "100%",
                        minHeight: token("--touch-min"),
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        alignItems: "center",
                        gap: token("--space-4"),
                        padding: token("--space-4"),
                        border: `1px solid ${token("--border-soft")}`,
                        borderRadius: token("--radius-control"),
                        background: token("--glass-on-glass-fill"),
                        color: token("--text-on-glass"),
                        textAlign: "left",
                        opacity: action.available ? 1 : 0.46,
                      }}
                    >
                      <span style={{ minWidth: 0, display: "grid", gap: token("--space-1") }}>
                        <strong style={{ font: token("--t-button") }}>{action.label}</strong>
                        <span
                          id={`exploration-effect-${String(index)}`}
                          style={{ font: token("--t-caption"), color: token("--text-muted") }}
                        >
                          {action.effectText}
                        </span>
                      </span>
                      <span aria-hidden="true" style={{ font: token("--t-title") }}>›</span>
                    </Pressable>
                  ))}
                </div>
              )}
            </div>
          </GlassPanel>
        </motion.section>
      )}
      {frameBreakGeometry !== null && frameBreakPhase === "open" && activeAction !== null && (
        <motion.section
          data-exploration-followup={activeAction.followup.kind}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 14, scale: reduceMotion ? 1 : 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"), ease: DREAM_EASE }}
          style={{
            position: "fixed",
            zIndex: FRAME_BREAK_EXIT_LAYER + 1,
            top: isDesktop
              ? safeAreaInsetAtLeast("top", "--space-8")
              : `calc(max(var(--safe-area-inset-top), ${token("--space-4")}) + ${String(MENU_BUTTON_PX)}px + ${token("--space-3")})`,
            right: isDesktop
              ? `calc(max(var(--safe-area-inset-right), ${token("--space-8")}) + ${String(MENU_BUTTON_PX)}px + ${token("--space-3")})`
              : `max(var(--safe-area-inset-right), ${token("--space-4")})`,
            bottom: JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
            left: isDesktop
              ? "auto"
              : `max(var(--safe-area-inset-left), ${token("--space-4")})`,
            width: isDesktop ? "min(920px, calc(100vw - 64px))" : undefined,
            minHeight: 0,
            display: "grid",
            alignItems: "center",
            pointerEvents: "auto",
          }}
        >
          {activeAction.followup.kind === "cards" && (
            <CardGalleryPanel
              title={activeAction.followup.title}
              subtitle={activeAction.followup.subtitle}
              rightAccessory={{
                kind: "glassButton",
                label: "Back",
                onPress: closeFollowup,
                testId: "cumulus-exploration-followup-back",
              }}
              footerAction={{
                label:
                  activeAction.followup.mode === "purge-and-copy" && purgeEntryId === null
                    ? "Choose a card to purge"
                    : activeAction.followup.mode === "purge-and-copy" && selectedIds.length === 0
                      ? "Choose a card to copy"
                      : "Confirm Choice",
                onPress: commitFollowup,
                disabled: !canCommitFollowup,
                variant: "accent",
                testId: "cumulus-exploration-followup-confirm",
              }}
              cards={activeAction.followup.cards.map((card) => ({
                entryId: card.entryId,
                model: card.model,
                selected:
                  card.entryId === purgeEntryId || selectedIds.includes(card.entryId),
                selectionColor: card.entryId === purgeEntryId ? "danger" : "selected",
                emphasis: card.isBane ? "danger" : undefined,
                testId: `cumulus-exploration-card-${card.entryId}`,
              }))}
              emptyLabel="No eligible cards are available."
              columns={isDesktop ? "four" : "three"}
              cardSize="standard"
              frame="floating"
              widthMode="fill"
              heightMode="fill"
              spacing={isDesktop ? "regular" : "compact"}
              testId="cumulus-exploration-card-followup"
              onCardPress={toggleCard}
            />
          )}
          {activeAction.followup.kind === "packs" && (
            <GlassPanel
              eyebrow="Exploration"
              title={activeAction.followup.title}
              subtitle={activeAction.followup.subtitle}
              headingLevel="h1"
              rightAccessory={{ kind: "glassButton", label: "Back", onPress: closeFollowup }}
              footer={
                <div style={{ display: "flex", justifyContent: "flex-end", padding: token("--space-5") }}>
                  <GlassButton label="Take This Pack" variant="accent" placement="onGlass" disabled={!canCommitFollowup} onPress={commitFollowup} testId="cumulus-exploration-followup-confirm" />
                </div>
              }
            >
              <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(2, minmax(0, 1fr))" : "1fr", gap: token("--space-4"), padding: token("--space-5"), overflow: "auto" }}>
                {activeAction.followup.packs.map((pack) => (
                  <Pressable
                    key={pack.index}
                    as="button"
                    aria-pressed={selectedPackIndex === pack.index}
                    data-testid={`cumulus-exploration-pack-${String(pack.index)}`}
                    onClick={() => setSelectedPackIndex(pack.index)}
                    style={{
                      display: "grid",
                      gap: token("--space-3"),
                      padding: token("--space-4"),
                      borderRadius: token("--radius-panel"),
                      border: `2px solid ${selectedPackIndex === pack.index ? token("--selected") : token("--border-soft")}`,
                      background: token("--glass-on-glass-fill"),
                      color: token("--text-on-glass"),
                    }}
                  >
                    <strong style={{ font: token("--t-button"), textAlign: "left" }}>Pack {String(pack.index + 1)}</strong>
                    <span style={{ display: "grid", gridTemplateColumns: `repeat(${String(pack.cards.length)}, minmax(0, 1fr))`, gap: token("--space-2") }}>
                      {pack.cards.map((card) => <GameCard key={card.entryId} model={card.model} />)}
                    </span>
                  </Pressable>
                ))}
              </div>
            </GlassPanel>
          )}
          {(activeAction.followup.kind === "subtypes" || activeAction.followup.kind === "dreamsigns") && (
            <GlassPanel
              eyebrow="Exploration"
              title={activeAction.followup.title}
              subtitle={activeAction.followup.subtitle}
              headingLevel="h1"
              rightAccessory={{ kind: "glassButton", label: "Back", onPress: closeFollowup }}
              footer={
                <div style={{ display: "flex", justifyContent: "flex-end", padding: token("--space-5") }}>
                  <GlassButton label="Confirm Choice" variant="accent" placement="onGlass" disabled={!canCommitFollowup} onPress={commitFollowup} testId="cumulus-exploration-followup-confirm" />
                </div>
              }
            >
              <div role="radiogroup" style={{ display: "grid", gap: token("--space-3"), padding: token("--space-5") }}>
                {activeAction.followup.kind === "subtypes"
                  ? activeAction.followup.options.map((option) => (
                      <Pressable
                        key={option}
                        as="button"
                        role="radio"
                        aria-checked={selectedSubtype === option}
                        onClick={() => setSelectedSubtype(option)}
                        style={{ minHeight: token("--touch-min"), padding: token("--space-4"), borderRadius: token("--radius-control"), border: `2px solid ${selectedSubtype === option ? token("--selected") : token("--border-soft")}`, background: token("--glass-on-glass-fill"), color: token("--text-on-glass"), textAlign: "left", font: token("--t-button") }}
                      >
                        {option}
                      </Pressable>
                    ))
                  : activeAction.followup.dreamsigns.map((dreamsign) => (
                      <Pressable
                        key={dreamsign.id}
                        as="button"
                        role="radio"
                        aria-checked={selectedDreamsignId === dreamsign.id}
                        onClick={() => setSelectedDreamsignId(dreamsign.id)}
                        style={{ minHeight: token("--touch-min"), display: "grid", gap: token("--space-1"), padding: token("--space-4"), borderRadius: token("--radius-control"), border: `2px solid ${selectedDreamsignId === dreamsign.id ? token("--selected") : token("--border-soft")}`, background: token("--glass-on-glass-fill"), color: token("--text-on-glass"), textAlign: "left" }}
                      >
                        <strong style={{ font: token("--t-button") }}>{dreamsign.name}</strong>
                        <span style={{ font: token("--t-caption"), color: token("--text-muted") }}>{dreamsign.effectText}</span>
                      </Pressable>
                    ))}
              </div>
            </GlassPanel>
          )}
        </motion.section>
      )}
      {frameBreakGeometry !== null && frameBreakPhase === "open" && activeAction === null && (
        <motion.div
          data-exploration-exit-control=""
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"),
            ease: DREAM_EASE,
          }}
          style={{
            position: "fixed",
            top: `max(var(--safe-area-inset-top), ${String(exitEdgeInset)}px)`,
            right: isDesktop
              ? `calc(max(var(--safe-area-inset-right), ${String(exitEdgeInset)}px) + ${String(MENU_BUTTON_PX)}px + ${token("--space-3")})`
              : `max(var(--safe-area-inset-right), ${String(exitEdgeInset)}px)`,
            zIndex: FRAME_BREAK_EXIT_LAYER,
          }}
        >
          <IconButton
            glyph={GLYPHS.close}
            label="Return to Exploration"
            onPress={collapseFrameBreak}
            testId="cumulus-exploration-exit"
          />
        </motion.div>
      )}
    </GuideGallerySiteLayout>
  );
}
