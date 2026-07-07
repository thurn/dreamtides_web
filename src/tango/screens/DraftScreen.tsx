// DraftScreen — the Tango rendering of a draft site (the mobile redesign). A
// draft site offers a pack of cards and the player picks one, five times over.
// The Tango version strips the screen to the offer itself: the dreamscape scene
// fills the viewport (never darkened — legibility comes from the cards' own
// opacity and the HUD's outline dilation), the pack sits as a 2x2 grid of
// GameCards centered over it, and the persistent QuestStatusBar docks the run's
// essence, deck, Dreamcaller, and dreamsigns along the bottom. The utility menu
// lives in the app-shell's top-left hamburger, matching the dreamscape and
// atlas screens — this screen renders no title, pick counter, progress bar, or
// drafted-card rail of its own.
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

// The 2x2 offer cell width: the smaller of half the grid content-width and the
// width that keeps two card rows within the grid content-height, so the pack
// fills the space above the docked HUD without spilling under it. A box measure
// (content-driven layout), resolved against the grid's `container-type: size`.
const OFFER_CELL_WIDTH = `min(calc((100cqw - ${token("--space-5")}) / 2), calc((100cqh - ${token("--space-5")}) * ${String(CARD_ASPECT_W)} / ${String(2 * CARD_ASPECT_H)}))`;

/** Bottom clearance reserved for the docked QuestStatusBar (bar + elevated
 * Dreamcaller bust + home-indicator inset), so the centered pack sits above it. */
const HUD_CLEARANCE = `calc(${token("--hud-h")} + ${token("--safe-bottom")} + ${token("--space-9")})`;

/** Top clearance so the pack clears the app-shell hamburger (a 48px button at an
 * ~18px inset, or the device safe-area, whichever is larger) plus a small gap.
 * Without it the top card row rides under the menu on short, inset-free phones. */
const MENU_CLEARANCE = `calc(max(env(safe-area-inset-top), ${token("--space-7")}) + ${token("--control-h")})`;

/**
 * The Tango draft screen. Pure and props-driven: full-bleed scene art, the 2x2
 * pack of {@link GameCard}s over it, drifting {@link Motes}, and the persistent
 * {@link QuestStatusBar} docked to the bottom.
 */
export function DraftScreen({ view, onPick, onViewDeck }: DraftScreenProps) {
  // The stage the QuestStatusBar popovers portal into, so their placement and
  // on-screen clamp use viewport coordinates.
  const stageRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const sceneUrl = view.scene !== null ? resolveArtRef(view.scene) : null;

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

      <div style={{ flexShrink: 0, height: MENU_CLEARANCE }} aria-hidden="true" />

      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: token("--space-5"),
          containerType: "size",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`offer-${view.offerKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, auto)",
              gridTemplateRows: "repeat(2, auto)",
              gap: token("--space-5"),
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
                  style={{ width: OFFER_CELL_WIDTH }}
                >
                  <GameCard
                    card={card}
                    large
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
