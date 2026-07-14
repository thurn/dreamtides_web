import { useState, type ReactElement } from "react";
import { Button } from "../components/controls/Button";
import { GlassButton } from "../components/controls/GlassButton";
import { GlowIcon } from "../components/controls/GlowIcon";
import { DreamcallerPortrait } from "../components/hud/DreamcallerPortrait";
import { Motes } from "../components/hud/Motes";
import { QUEST_STATUS_BAR_CLEARANCE_OP } from "../components/hud/QuestStatusBar";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import {
  DeckGalleryOverlay,
  type DeckGalleryCardView,
} from "./DeckGalleryOverlay";
import { MENU_BUTTON_PX, MENU_EDGE_INSET_MOBILE_PX } from "./chrome-geometry";

export interface QuestCompleteDreamcallerView {
  id: string;
  name: string;
  title: string;
  imageNumber: string;
  portraitFocus?: { x: number; y: number };
}

export interface QuestCompleteView {
  dreamcaller: QuestCompleteDreamcallerView | null;
  finalDeck: readonly DeckGalleryCardView[];
}

export interface QuestCompleteScreenProps {
  view: QuestCompleteView;
  onNewQuest: () => void;
  onDownloadLog: () => void;
  onOpenFinalDeck: () => void;
  onCloseFinalDeck: () => void;
}

const CONTENT_MAX_WIDTH_PX = 440;
const PORTRAIT_SIZE_PX = 96;
const TOP_CHROME_CLEARANCE =
  `calc(max(var(--safe-area-inset-top), ${token("--safe-top")}, ` +
  `calc(max(var(--safe-area-inset-top), ${String(MENU_EDGE_INSET_MOBILE_PX)}px) + ${String(MENU_BUTTON_PX)}px)) + ${token("--space-5")})`;
const BOTTOM_CLEARANCE =
  `calc(${QUEST_STATUS_BAR_CLEARANCE_OP} + ${token("--space-6")})`;

/** The Cumulus victory summary, designed around a narrow mobile stage. */
export function QuestCompleteScreen({
  view,
  onNewQuest,
  onDownloadLog,
  onOpenFinalDeck,
  onCloseFinalDeck,
}: QuestCompleteScreenProps): ReactElement {
  const [showFinalDeck, setShowFinalDeck] = useState(false);

  const openFinalDeck = (): void => {
    setShowFinalDeck(true);
    onOpenFinalDeck();
  };
  const closeFinalDeck = (): void => {
    setShowFinalDeck(false);
    onCloseFinalDeck();
  };

  return (
    <div
      className="cumulus"
      data-testid="cumulus-quest-complete-screen"
      style={{
        position: "fixed",
        inset: 0,
        minHeight: "100dvh",
        overflow: "hidden",
        background: token("--bg-app"),
        color: token("--text-primary"),
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            `radial-gradient(circle at 50% 8%, ${token("--accent-tint")} 0%, transparent 44%), ` +
            `linear-gradient(180deg, ${token("--surface-chrome-strong")} 0%, ${token("--bg-app")} 72%)`,
        }}
      />
      <Motes on tint="warm" count={18} seed={77} />

      <main
        data-quest-complete-content=""
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: BOTTOM_CLEARANCE,
          left: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: `${TOP_CHROME_CLEARANCE} ${token("--space-6")} ${token("--space-8")}`,
          boxSizing: "border-box",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 3,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: CONTENT_MAX_WIDTH_PX,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: token("--space-9"),
          }}
        >
          <header
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: token("--space-5"),
            }}
          >
            <GlowIcon
              iconClass={GLYPHS.star}
              color="gold"
              size="1.8em"
              glowFilter="spark-glow"
              title="Victory"
            />
            <h1
              style={{
                margin: 0,
                font: token("--t-title"),
                color: token("--text-primary"),
              }}
            >
              Quest Complete
            </h1>
          </header>

          {view.dreamcaller !== null && (
            <section
              data-quest-complete-dreamcaller={view.dreamcaller.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: token("--space-4"),
              }}
            >
              <DreamcallerPortrait
                dreamcaller={view.dreamcaller}
                variant="panel"
                size={PORTRAIT_SIZE_PX}
              />
              <div style={{ textAlign: "center" }}>
                <strong style={{ font: token("--t-title-sm") }}>
                  {view.dreamcaller.name}
                </strong>
              </div>
            </section>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: token("--space-4"),
            }}
          >
            <div data-quest-complete-action="new-quest">
              <Button
                full
                size="lg"
                label="New Quest"
                onClick={onNewQuest}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                flexWrap: "wrap",
                gap: token("--space-4"),
              }}
            >
              <GlassButton
                label="Final Deck"
                glyph={GLYPHS.affiliationRow}
                onPress={openFinalDeck}
                testId="quest-complete-view-deck"
              />
              <GlassButton
                label="Log"
                onPress={onDownloadLog}
                testId="quest-complete-download-log"
              />
            </div>
          </div>
        </div>
      </main>

      <DeckGalleryOverlay
        isOpen={showFinalDeck}
        title="Final Deck"
        subtitle="Every card that carried you through the dream."
        cards={view.finalDeck}
        emptyLabel="No cards remain in the final deck."
        closeLabel="Close final deck"
        clearMobileQuestMenu
        onClose={closeFinalDeck}
      />
    </div>
  );
}
