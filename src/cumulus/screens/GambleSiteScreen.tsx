import { useState } from "react";
import { PlayingCard } from "../components/card/PlayingCard";
import { IconButton } from "../components/controls/IconButton";
import type { ArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { Pressable } from "../primitives/Pressable";
import { token } from "../primitives/tokens";
import {
  GuideGallerySiteLayout,
  type GuideGalleryGuideView,
} from "./GuideGallerySiteLayout";

export interface GamblePlayingCardView {
  /** Stable rank-and-suit key for this standard deck entry. */
  id: string;
  /** Rank printed on the playing card. */
  rank: Parameters<typeof PlayingCard>[0]["rank"];
  /** Suit printed on the playing card. */
  suit: Parameters<typeof PlayingCard>[0]["suit"];
}

export interface GambleSiteView {
  /** Stable journey site id. */
  siteId: string;
  /** Current dreamscape scene art behind the site, if resolved. */
  scene: ArtRef | null;
  /** Whether this is the resident guide's enhanced site. */
  isEnhanced: boolean;
  /** Stable identifier for the currently dealt hand. */
  dealId: string;
  /** Six distinct playing cards in display order. */
  cards: readonly GamblePlayingCardView[];
  /** Resident Dream Guide art and greeting. */
  guide: GuideGalleryGuideView;
}

export interface GambleSiteScreenProps {
  /** View-model rendered by the pure screen. */
  view: GambleSiteView;
  /** Deal six new random playing cards. */
  onReroll: () => void;
}

const DESKTOP_GAMBLE_REGION_MAX_WIDTH = 620;

function FlippablePlayingCard({
  card,
  size,
}: {
  card: GamblePlayingCardView;
  size: Parameters<typeof PlayingCard>[0]["size"];
}) {
  const [face, setFace] = useState<"front" | "back">("front");
  const isFaceDown = face === "back";

  return (
    <Pressable
      as="button"
      aria-label={
        isFaceDown
          ? `Show ${card.rank} of ${card.suit}`
          : `Turn ${card.rank} of ${card.suit} face down`
      }
      aria-pressed={isFaceDown}
      data-gamble-playing-card={card.id}
      data-gamble-playing-card-face={face}
      snapFeedbackExit
      onClick={() => setFace(isFaceDown ? "front" : "back")}
      style={{
        display: "block",
        appearance: "none",
        padding: 0,
        border: 0,
        background: "transparent",
      }}
    >
      <PlayingCard
        rank={card.rank}
        suit={card.suit}
        size={size}
        face={face}
      />
    </Pressable>
  );
}

export function GambleSiteScreen({
  view,
  onReroll,
}: GambleSiteScreenProps) {
  return (
    <GuideGallerySiteLayout
      siteId={view.siteId}
      scene={view.scene}
      guide={view.guide}
      screenTestId="cumulus-gamble-site-screen"
      guideArtTestId="cumulus-gamble-guide-art"
      speechAnchorTestId="cumulus-gamble-speech-anchor"
      speechBubbleTestId="cumulus-gamble-speech-bubble"
      renderGallery={(layout) => (
        <main
          data-gamble-card-region=""
          data-gamble-layout={layout}
          data-gamble-enhanced={view.isEnhanced ? "true" : "false"}
          style={{
            position: "relative",
            zIndex: 10,
            width: "100%",
            maxWidth:
              layout === "desktop"
                ? DESKTOP_GAMBLE_REGION_MAX_WIDTH
                : undefined,
            height: "100%",
            minHeight: 0,
            justifySelf: "center",
            alignSelf: "center",
            display: "grid",
            placeItems: "center",
            boxSizing: "border-box",
            padding: layout === "desktop"
              ? token("--space-8")
              : token("--space-4"),
            pointerEvents: "auto",
          }}
        >
          <div
            data-gamble-reroll-control=""
            style={{
              position: "absolute",
              top: layout === "desktop"
                ? token("--space-4")
                : token("--space-2"),
              right: layout === "desktop"
                ? token("--space-4")
                : token("--space-2"),
              zIndex: 2,
            }}
          >
            <IconButton
              glyph={GLYPHS.refresh}
              label="Reroll playing cards"
              size={layout === "desktop" ? "md" : "sm"}
              onPress={onReroll}
              testId="cumulus-gamble-reroll"
            />
          </div>

          <section
            aria-label="Six-card gamble hand"
            data-gamble-hand={view.dealId}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, max-content)",
              gridTemplateRows: "repeat(2, max-content)",
              gap: layout === "desktop"
                ? token("--space-6")
                : token("--space-4"),
              placeItems: "center",
            }}
          >
            {view.cards.map((card) => (
              <FlippablePlayingCard
                key={`${view.dealId}:${card.id}`}
                card={card}
                size={layout === "desktop" ? "standard" : "compact"}
              />
            ))}
          </section>
        </main>
      )}
    />
  );
}
