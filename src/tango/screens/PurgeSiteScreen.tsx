// PurgeSiteScreen — the Tango rendering of Master Takeshi's purge site.
// Mobile keeps the guide in the top third; desktop places the guide and speech
// beside the glass card purge surface.

import { useCallback, useMemo, useRef, useState } from "react";
import type { DeckCardView } from "./MobileDeckViewer";
import { CardGalleryPanel } from "../components/card/CardGalleryPanel";
import { Motes } from "../components/hud/Motes";
import {
  QuestStatusBar,
  type QsbDreamcaller,
  type QsbDreamsign,
} from "../components/hud/QuestStatusBar";
import { SpeechBubble } from "../components/overlay/SpeechBubble";
import { type ArtRef, resolveArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import { MENU_EDGE_INSET_MOBILE_PX } from "./chrome-geometry";
import { useIsDesktop } from "./use-is-desktop";

export interface PurgeGuideView {
  /** Stable Dream Guide id. */
  id: string;
  /** Display name shown in the speech bubble. */
  name: string;
  /** Dialog line shown in the speech bubble. */
  line: string;
  /** Transparent character render. */
  art: ArtRef;
}

export interface PurgeCardView extends DeckCardView {
  /** Whether this card purges without spending essence. */
  purgeCostKind: "paid" | "free";
}

export interface PurgeSiteView {
  /** Current dreamscape scene art behind the site, if resolved. */
  scene: ArtRef | null;
  /** Master Takeshi's guide art and line. */
  guide: PurgeGuideView;
  /** Deck cards in acquisition order, already resolved by concrete entry id. */
  cards: readonly PurgeCardView[];
  /** Visit cost by paid-card count. Index 0 is always 0. */
  visitCosts: readonly number[];
  /** Maximum paid cards selectable with current essence and visit cap. */
  maxPaidSelections: number;
  /** The persistent bottom-HUD data. */
  hud: PurgeHudView;
}

/** The bottom-HUD slice of the view-model — what the QuestStatusBar docks. */
export interface PurgeHudView {
  /** Essence total shown in the HUD. */
  essence: number;
  /** Deck size shown on the deck sprite. */
  deck: number;
  /** The active Dreamcaller bust, or undefined before one is chosen. */
  dreamcaller?: QsbDreamcaller;
  /** The run's owned dreamsigns, docked to the left of the deck sprite. */
  dreamsigns: QsbDreamsign[];
}

export interface PurgeSiteScreenProps {
  /** View-model rendered by the pure screen. */
  view: PurgeSiteView;
  /** Leave the site without purging. */
  onClose: () => void;
  /** Commit selected deck entries at the displayed total cost. */
  onPurge: (entryIds: readonly string[], cost: number) => void;
  /** Open the deck viewer from the QuestStatusBar deck sprite. */
  onViewDeck?: () => void;
}

const GUIDE_TOP_ROWS = "minmax(220px, 34dvh) minmax(0, 1fr)";
const HUD_CLEARANCE = `calc(${token("--hud-h")} + ${token("--safe-bottom")} + ${token("--space-8")})`;
// Desktop Purge uses the grand QuestStatusBar, which outgrows the root hud
// token. Keep the card window above that larger transparent HUD.
const DESKTOP_HUD_CLEARANCE = `calc(${HUD_CLEARANCE} + ${token("--space-9")})`;

export function PurgeSiteScreen({
  view,
  onClose,
  onPurge,
  onViewDeck,
}: PurgeSiteScreenProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const [selectedEntryIds, setSelectedEntryIds] = useState<readonly string[]>(
    [],
  );
  const freeEntryIds = useMemo(
    () =>
      new Set(
        view.cards
          .filter((card) => card.purgeCostKind === "free")
          .map((card) => card.entryId),
      ),
    [view.cards],
  );
  const selectedPaidCount = selectedEntryIds.filter(
    (entryId) => !freeEntryIds.has(entryId),
  ).length;
  const totalCost = view.visitCosts[selectedPaidCount] ?? 0;
  const canSelectPaid = selectedPaidCount < view.maxPaidSelections;
  const selectedCount = selectedEntryIds.length;

  const toggleSelection = useCallback(
    (entryId: string) => {
      setSelectedEntryIds((prev) => {
        const selected = prev.includes(entryId);
        if (selected) {
          return prev.filter((candidate) => candidate !== entryId);
        }
        if (!freeEntryIds.has(entryId) && !canSelectPaid) {
          return prev;
        }
        return [...prev, entryId];
      });
    },
    [canSelectPaid, freeEntryIds],
  );

  const commitPurge = useCallback(() => {
    if (selectedEntryIds.length === 0) return;
    onPurge(selectedEntryIds, totalCost);
  }, [onPurge, selectedEntryIds, totalCost]);

  const sceneUrl = view.scene !== null ? resolveArtRef(view.scene) : null;

  return (
    <div
      ref={stageRef}
      className="tango"
      data-testid="tango-purge-site-screen"
      data-tango-purge-site=""
      style={{
        position: "fixed",
        inset: 0,
        minHeight: "100vh",
        display: isDesktop ? "block" : "grid",
        gridTemplateRows: isDesktop ? undefined : GUIDE_TOP_ROWS,
        overflow: "hidden",
        background: token("--bg-app"),
        boxSizing: "border-box",
        paddingBottom: isDesktop ? undefined : HUD_CLEARANCE,
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
            objectPosition: "50% 58%",
            userSelect: "none",
          }}
        />
      )}
      <Motes on tint="warm" />

      {isDesktop ? (
        <DesktopComposition
          guide={view.guide}
          cards={view.cards}
          selectedEntryIds={selectedEntryIds}
          selectedCount={selectedCount}
          canSelectPaid={canSelectPaid}
          totalCost={totalCost}
          onClose={onClose}
          onPurge={commitPurge}
          onToggle={toggleSelection}
        />
      ) : (
        <>
          <GuideBand guide={view.guide} />
          <CardRegion
            cards={view.cards}
            selectedEntryIds={selectedEntryIds}
            selectedCount={selectedCount}
            canSelectPaid={canSelectPaid}
            totalCost={totalCost}
            onClose={onClose}
            onPurge={commitPurge}
            onToggle={toggleSelection}
          />
        </>
      )}

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

function DesktopComposition({
  guide,
  cards,
  selectedEntryIds,
  selectedCount,
  canSelectPaid,
  totalCost,
  onClose,
  onPurge,
  onToggle,
}: {
  readonly guide: PurgeGuideView;
  readonly cards: readonly PurgeCardView[];
  readonly selectedEntryIds: readonly string[];
  readonly selectedCount: number;
  readonly canSelectPaid: boolean;
  readonly totalCost: number;
  readonly onClose: () => void;
  readonly onPurge: () => void;
  readonly onToggle: (entryId: string) => void;
}) {
  return (
    <section
      data-purge-desktop-composition=""
      style={{
        position: "absolute",
        top: `calc(${token("--space-8")} + max(var(--safe-area-inset-top), ${token("--safe-top")}))`,
        left: 0,
        right: 0,
        bottom: DESKTOP_HUD_CLEARANCE,
        display: "grid",
        placeItems: "stretch center",
        zIndex: 20,
        pointerEvents: "none",
      }}
    >
      <div
        data-purge-desktop-layout=""
        style={{
          width: `calc(100% - ${token("--space-12")} - ${token("--space-12")})`,
          maxWidth: 1500,
          height: "100%",
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)",
          gridTemplateRows: "minmax(0, 1fr)",
          gap: token("--space-12"),
          alignItems: "center",
        }}
      >
        <DesktopGuideScene guide={guide} />
        <CardRegion
          cards={cards}
          selectedEntryIds={selectedEntryIds}
          selectedCount={selectedCount}
          canSelectPaid={canSelectPaid}
          totalCost={totalCost}
          onClose={onClose}
          onPurge={onPurge}
          onToggle={onToggle}
          desktop
        />
      </div>
    </section>
  );
}

function DesktopGuideScene({ guide }: { readonly guide: PurgeGuideView }) {
  const guideUrl = resolveArtRef(guide.art);
  return (
    <div
      data-purge-guide=""
      data-guide-id={guide.id}
      style={{
        position: "relative",
        width: "100%",
        height: "min(100%, 640px)",
        minHeight: 520,
        pointerEvents: "none",
      }}
    >
      <img
        src={guideUrl}
        alt={guide.name}
        draggable={false}
        style={{
          position: "absolute",
          bottom: `calc(-1 * ${token("--space-8")})`,
          left: `clamp(calc(-1 * ${token("--space-12")}), -4vw, calc(-1 * ${token("--space-8")}))`,
          width: "clamp(320px, 29vw, 430px)",
          height: "min(78dvh, 720px)",
          objectFit: "contain",
          objectPosition: "50% 100%",
          userSelect: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "14%",
          left: `clamp(calc(${token("--space-12")} + ${token("--space-12")} + ${token("--space-11")} + ${token("--space-7")}), 18vw, calc(${token("--space-12")} + ${token("--space-12")} + ${token("--space-12")} + ${token("--space-11")} + ${token("--space-7")}))`,
          right: 0,
          maxWidth: 380,
        }}
      >
        <SpeechBubble
          speakerName={guide.name}
          text={guide.line}
          arrowSide="left"
          testId="tango-purge-speech-bubble"
        />
      </div>
    </div>
  );
}

function CardRegion({
  cards,
  selectedEntryIds,
  selectedCount,
  canSelectPaid,
  totalCost,
  onClose,
  onPurge,
  onToggle,
  desktop = false,
}: {
  readonly cards: readonly PurgeCardView[];
  readonly selectedEntryIds: readonly string[];
  readonly selectedCount: number;
  readonly canSelectPaid: boolean;
  readonly totalCost: number;
  readonly onClose: () => void;
  readonly onPurge: () => void;
  readonly onToggle: (entryId: string) => void;
  readonly desktop?: boolean;
}) {
  return (
    <section
      data-purge-card-grid=""
      data-purge-layout={desktop ? "desktop" : "mobile"}
      style={{
        position: "relative",
        zIndex: 10,
        minHeight: 0,
        height: "100%",
        maxHeight: "100%",
        width: desktop
          ? "100%"
          : `calc(100vw - (${token("--space-4")} * 2))`,
        boxSizing: "border-box",
        pointerEvents: "auto",
        ...(desktop
          ? {
              alignSelf: "stretch",
              display: "grid",
              alignItems: "center",
            }
          : {
              alignSelf: "start",
              justifySelf: "center",
            }),
      }}
    >
      <CardGalleryPanel
        title="Purge Cards"
        subtitle="Choose cards to remove from your deck"
        rightAccessory={{
          kind: "glassButton",
          label:
            selectedCount === 0
              ? "Decline"
              : `Purge ${String(selectedCount)}: `,
          cost: selectedCount === 0 ? null : totalCost,
          variant: selectedCount === 0 ? "default" : "danger",
          onPress: selectedCount === 0 ? onClose : onPurge,
          testId: "tango-purge-header-action",
        }}
        cards={cards.map((card) => {
          const selected = selectedEntryIds.includes(card.entryId);
          const disabled =
            !selected && card.purgeCostKind === "paid" && !canSelectPaid;
          return {
            entryId: card.entryId,
            card: card.card,
            transfiguration: card.transfiguration,
            testId: `tango-purge-card-${card.entryId}`,
            selected,
            disabled,
            selectionColor: "danger",
            emphasis: card.purgeCostKind === "free" ? "danger" : undefined,
          };
        })}
        columns={desktop ? "five" : "four"}
        frame="floating"
        spacing={desktop ? "regular" : "medium"}
        testId="tango-purge-card-gallery"
        onCardPress={onToggle}
      />
    </section>
  );
}

function GuideBand({ guide }: { readonly guide: PurgeGuideView }) {
  const guideUrl = resolveArtRef(guide.art);
  return (
    <header
      data-purge-guide=""
      data-guide-id={guide.id}
      style={{
        position: "relative",
        zIndex: 10,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <img
        src={guideUrl}
        alt={guide.name}
        draggable={false}
        data-testid="tango-purge-guide-art"
        style={{
          position: "absolute",
          // Takeshi's cutout carries transparent room around his head. Anchoring
          // that canvas at the menu inset keeps the opaque head beyond the
          // shared mobile menu disc while preserving the intended art scale.
          left: `max(var(--safe-area-inset-left), ${String(MENU_EDGE_INSET_MOBILE_PX)}px)`,
          bottom: "calc(-1 * var(--space-8))",
          width: "58vw",
          height: "100%",
          objectFit: "contain",
          objectPosition: "50% 100%",
          userSelect: "none",
        }}
      />
      <div
        data-testid="tango-purge-speech-anchor"
        style={{
          position: "absolute",
          // Keep the bubble body beyond Takeshi's face while its left tail
          // reaches back to his head at both narrow and tall phone widths.
          left: "40vw",
          right: `calc(${token("--gutter")} + ${token("--space-11")})`,
          top: token("--space-2"),
        }}
      >
        <SpeechBubble
          speakerName={guide.name}
          text={guide.line}
          arrowSide="left"
          testId="tango-purge-speech-bubble"
        />
      </div>
    </header>
  );
}
