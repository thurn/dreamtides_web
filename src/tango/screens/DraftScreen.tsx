// DraftScreen — the Tango rendering of a draft site. A
// draft site offers a pack of cards and the player picks one, five times over.
// The Tango version strips the screen to the offer itself: the dreamscape scene
// fills the viewport (never darkened — legibility comes from the cards' own
// opacity and the HUD's outline dilation), the pack sits as a 2x2 mobile grid
// or a four-card desktop row of GameCards centered over it, and the persistent
// QuestStatusBar docks the run's essence, deck, Dreamcaller, and dreamsigns
// along the bottom. The utility menu lives in the app-shell corner chrome,
// matching the dreamscape and atlas screens — the screen's only text is a
// subtle pick counter riding under the pack; it renders no title, progress bar,
// or drafted-card rail of its own.
//
// PURE: it renders from a view-model and reports the chosen card through
// `onPick`; the adapter owns the draft state, the pick mutation, and returning
// to the dreamscape once the pack is exhausted. The screen owns and exports its
// view types, and holds only the local pick latch that plays the pick-out
// animation.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CardData } from "../../types/cards";
import { CARD_ASPECT_H, CARD_ASPECT_W } from "../components/card/card-aspect";
import { GameCard } from "../components/card/CardView";
import { Motes } from "../components/hud/Motes";
import {
  QuestStatusBar,
  type QsbDreamcaller,
  type QsbDreamsign,
} from "../components/hud/QuestStatusBar";
import { type ArtRef, resolveArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import {
  MENU_BUTTON_PX,
  MENU_EDGE_INSET_DESKTOP_PX,
  MENU_EDGE_INSET_MOBILE_PX,
} from "./chrome-geometry";
import { useIsDesktop } from "./use-is-desktop";

/** The bottom-HUD slice of the view-model — what the QuestStatusBar docks. */
export interface DraftHudView {
  /** Essence total shown in the HUD. */
  essence: number;
  /** Deck size shown on the deck sprite. */
  deck: number;
  /** The active Dreamcaller bust, or undefined before one is chosen. */
  dreamcaller?: QsbDreamcaller;
  /** The run's owned dreamsigns, docked to the left of the deck sprite. */
  dreamsigns: QsbDreamsign[];
}

/** Everything the draft screen renders, mapped from live quest state. */
export interface DraftView {
  /** The dreamscape's scene art, or null while the dreamscape is unrevealed. */
  scene: ArtRef | null;
  /** The offered pack, resolved to cards (by UUID) and sorted for display. */
  offer: readonly CardData[];
  /** Stable key for the current pack, so a new offer cross-fades the grid. */
  offerKey: string;
  /** The 1-indexed pick the player is on (for the floating "Draft (n/total)"). */
  pickNumber: number;
  /** How many picks this draft site offers in total. */
  pickTotal: number;
  /** The persistent bottom-HUD data. */
  hud: DraftHudView;
}

export interface DraftScreenProps {
  /** The view-model to render. */
  view: DraftView;
  /** Pick a card from the current pack; carries the card's draft number. */
  onPick: (cardNumber: number) => void;
  /** Open the deck viewer; fired from the HUD deck sprite. */
  onViewDeck?: () => void;
}

// The vertical bands reserved down the screen, as raw calc operands so the
// card-height cap can subtract them from the viewport.
// Breathing room between the safe zone and the top of the pack.
const TOP_GAP_OP = token("--space-6");
// The band under the pack that holds the small pick counter (its gap above the
// label plus the label's own line).
const COUNTER_BAND_OP = token("--space-9");
// Bottom: the docked QuestStatusBar (bar + elevated Dreamcaller bust +
// home-indicator inset).
const HUD_CLEARANCE_OP = `${token("--hud-h")} + ${token("--safe-bottom")} + ${token("--space-9")}`;
const TOP_GAP = `calc(${TOP_GAP_OP})`;
const HUD_CLEARANCE = `calc(${HUD_CLEARANCE_OP})`;
const OFFER_GRID_GAP = token("--space-5");
// Desktop draft cards follow the roomy starting-deck modal card size. This is a
// content-driven box measure: the cap keeps the four-card row readable without
// turning each card into a full-height mobile offer.
const DESKTOP_OFFER_CARD_WIDTH_PX = 260;

function topSafeOpFor(isDesktop: boolean): string {
  const edgeInset = isDesktop
    ? MENU_EDGE_INSET_DESKTOP_PX
    : MENU_EDGE_INSET_MOBILE_PX;
  // The menu disc sits at `top: max(safe-inset-top, edgeInset)` with height
  // MENU_BUTTON_PX, so this band clears its bottom edge.
  return (
    `max(var(--safe-area-inset-top), ${token("--safe-top")}, ` +
    `calc(max(var(--safe-area-inset-top), ${String(edgeInset)}px) + ${String(MENU_BUTTON_PX)}px))`
  );
}

function offerCellWidthFor(params: {
  columns: number;
  rows: number;
  topSafeOp: string;
  maxWidthPx?: number;
}): string {
  const horizontalGapCount = params.columns - 1;
  const verticalGapCount = params.rows - 1;
  // The offer cell width is capped by both the row width and available height.
  // Box measures: content-driven layout against `container-type: inline-size`.
  const caps = [
    `calc((100cqw - (${OFFER_GRID_GAP} * ${String(horizontalGapCount)})) / ${String(params.columns)})`,
    `calc((100dvh - (${params.topSafeOp}) - (${TOP_GAP_OP}) - (${COUNTER_BAND_OP}) - (${HUD_CLEARANCE_OP}) - ` +
      `(${OFFER_GRID_GAP} * ${String(verticalGapCount)})) * ${String(CARD_ASPECT_W)} / ${String(params.rows * CARD_ASPECT_H)})`,
  ];
  if (params.maxWidthPx !== undefined) {
    caps.push(`${String(params.maxWidthPx)}px`);
  }
  return `min(${caps.join(", ")})`;
}

/**
 * The Tango draft screen. Pure and props-driven: full-bleed scene art, the pack
 * of {@link GameCard}s over it, drifting {@link Motes}, and the persistent
 * {@link QuestStatusBar} docked to the bottom.
 */
export function DraftScreen({ view, onPick, onViewDeck }: DraftScreenProps) {
  // The stage the QuestStatusBar popovers portal into, so their placement and
  // on-screen clamp use viewport coordinates.
  const stageRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const sceneUrl = view.scene !== null ? resolveArtRef(view.scene) : null;
  const offerColumns = isDesktop ? 4 : 2;
  const offerRows = isDesktop ? 1 : 2;
  const topSafeOp = topSafeOpFor(isDesktop);
  const topSafe = `calc(${topSafeOp})`;
  const offerCellWidth = offerCellWidthFor({
    columns: offerColumns,
    rows: offerRows,
    topSafeOp,
    maxWidthPx: isDesktop ? DESKTOP_OFFER_CARD_WIDTH_PX : undefined,
  });

  // The card being picked, latched so the pick-out animation plays and a second
  // tap can't fire while the pack is resolving. Cleared when a new pack arrives.
  const [pendingPick, setPendingPick] = useState<number | null>(null);
  useEffect(() => {
    setPendingPick(null);
  }, [view.offerKey]);

  function handlePick(cardNumber: number): void {
    if (pendingPick !== null) return;
    setPendingPick(cardNumber);
    onPick(cardNumber);
  }

  return (
    <div
      ref={stageRef}
      className="tango"
      data-tango-draft=""
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: token("--bg-app"),
        display: "flex",
        flexDirection: "column",
        touchAction: "none",
      }}
    >
      {sceneUrl !== null && (
        <img
          src={sceneUrl}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "50% 42%",
            userSelect: "none",
          }}
        />
      )}

      <Motes on tint="violet" />

      {/* Reserve the top cutout / status-bar zone so nothing rides into the
          notch, plus a short breathing gap above the pack. */}
      <div
        style={{ flexShrink: 0, height: `calc(${topSafe} + ${TOP_GAP})` }}
        aria-hidden="true"
      />

      {/* The pack is centered horizontally. Mobile keeps the shipped top-aligned
          placement; desktop centers the smaller row vertically in the stage. */}
      <div
        data-draft-offer-stage=""
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: isDesktop ? "center" : "flex-start",
          paddingLeft: token("--space-5"),
          paddingRight: token("--space-5"),
          containerType: "inline-size",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            data-draft-offer-grid=""
            key={`offer-${view.offerKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${String(offerColumns)}, auto)`,
              gridTemplateRows: `repeat(${String(offerRows)}, auto)`,
              gap: OFFER_GRID_GAP,
              placeItems: "center",
            }}
          >
            {view.offer.map((card) => {
              const picked = pendingPick === card.cardNumber;
              const dimmed = pendingPick !== null && !picked;
              return (
                <motion.div
                  key={`card-${String(card.cardNumber)}`}
                  data-draft-offer-card={String(card.cardNumber)}
                  initial={{ opacity: 0 }}
                  animate={
                    picked
                      ? { opacity: 0, scale: 0.92 }
                      : dimmed
                        ? { opacity: 0, scale: 0.96 }
                        : { opacity: 1, scale: 1 }
                  }
                  transition={{ duration: 0.3 }}
                  style={{ width: offerCellWidth }}
                >
                  <GameCard
                    card={card}
                    large={!isDesktop}
                    onClick={
                      pendingPick === null
                        ? () => {
                            handlePick(card.cardNumber);
                          }
                        : undefined
                    }
                  />
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {/* The one concession to text: a subtle pick counter painted directly
            on the scene with the on-media outline (rung 1 of the legibility
            ladder) — no scrim, wash, or container — riding just under the
            pack. */}
        <div
          data-draft-pick-counter=""
          style={{
            marginTop: token("--space-6"),
            font: isDesktop ? token("--t-lead") : token("--t-body"),
            color: token("--text-primary"),
            textShadow: token("--text-outline-media"),
          }}
        >
          {`Draft (${String(view.pickNumber)}/${String(view.pickTotal)})`}
        </div>
      </div>

      <div style={{ flexShrink: 0, height: HUD_CLEARANCE }} aria-hidden="true" />

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
