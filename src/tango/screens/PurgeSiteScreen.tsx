// PurgeSiteScreen — the Tango mobile rendering of Master Takeshi's purge site.
// The top third is character-led dialog; the rest is a deck-viewer-derived card
// grid with one contextual commit button after selection.

import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import type { DeckCardView } from "./MobileDeckViewer";
import { GameCard } from "../components/card/CardView";
import { Button } from "../components/controls/Button";
import { IconButton } from "../components/controls/IconButton";
import { Motes } from "../components/hud/Motes";
import { SpeechBubble } from "../components/overlay/SpeechBubble";
import { glassSurfaceStyle } from "../internal/glass-surface";
import { Pressable } from "../primitives/Pressable";
import { type ArtRef, resolveArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
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
}

export interface PurgeSiteScreenProps {
  /** View-model rendered by the pure screen. */
  view: PurgeSiteView;
  /** Render the card grid on a full-width glass bottom sheet. */
  useBottomSheet?: boolean;
  /** Leave the site without purging. */
  onClose: () => void;
  /** Commit selected deck entries at the displayed total cost. */
  onPurge: (entryIds: readonly string[], cost: number) => void;
}

const MOBILE_COLUMNS = 4;
const DESKTOP_COLUMNS = 5;
const GUIDE_TOP_ROWS = "minmax(220px, 34dvh) minmax(0, 1fr)";
const PURGE_BUTTON_BOTTOM = `calc(${token("--safe-bottom")} + ${token("--space-5")})`;

export function PurgeSiteScreen({
  view,
  useBottomSheet = false,
  onClose,
  onPurge,
}: PurgeSiteScreenProps) {
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
    (card: PurgeCardView) => {
      setSelectedEntryIds((prev) => {
        const selected = prev.includes(card.entryId);
        if (selected) {
          return prev.filter((entryId) => entryId !== card.entryId);
        }
        if (card.purgeCostKind === "paid" && !canSelectPaid) {
          return prev;
        }
        return [...prev, card.entryId];
      });
    },
    [canSelectPaid],
  );

  const commitPurge = useCallback(() => {
    if (selectedEntryIds.length === 0) return;
    onPurge(selectedEntryIds, totalCost);
  }, [onPurge, selectedEntryIds, totalCost]);

  const sceneUrl = view.scene !== null ? resolveArtRef(view.scene) : null;

  return (
    <div
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

      <div
        style={{
          position: "absolute",
          zIndex: 40,
          top: `max(${token("--gutter")}, var(--safe-area-inset-top))`,
          right: token("--gutter"),
        }}
      >
        <IconButton
          glyph={GLYPHS.close}
          label="Leave purge"
          onPress={onClose}
          testId="tango-purge-close"
        />
      </div>

      {isDesktop ? (
        <DesktopComposition
          guide={view.guide}
          cards={view.cards}
          useBottomSheet={useBottomSheet}
          selectedEntryIds={selectedEntryIds}
          selectedCount={selectedCount}
          canSelectPaid={canSelectPaid}
          onToggle={toggleSelection}
        />
      ) : (
        <>
          <GuideBand guide={view.guide} />
          <CardRegion
            cards={view.cards}
            useBottomSheet={useBottomSheet}
            selectedEntryIds={selectedEntryIds}
            selectedCount={selectedCount}
            canSelectPaid={canSelectPaid}
            onToggle={toggleSelection}
          />
        </>
      )}

      {selectedCount > 0 && (
        <div
          data-testid="tango-purge-commit-bar"
          style={{
            position: "fixed",
            zIndex: 50,
            left: token("--gutter"),
            right: token("--gutter"),
            bottom: PURGE_BUTTON_BOTTOM,
            maxWidth: 520,
            margin: "0 auto",
          }}
        >
          <Button
            size="lg"
            full
            label={`Purge ${String(selectedCount)} ${
              selectedCount === 1 ? "Card" : "Cards"
            }`}
            cost={totalCost}
            onClick={commitPurge}
          />
        </div>
      )}
    </div>
  );
}

function DesktopComposition({
  guide,
  cards,
  useBottomSheet,
  selectedEntryIds,
  selectedCount,
  canSelectPaid,
  onToggle,
}: {
  readonly guide: PurgeGuideView;
  readonly cards: readonly PurgeCardView[];
  readonly useBottomSheet: boolean;
  readonly selectedEntryIds: readonly string[];
  readonly selectedCount: number;
  readonly canSelectPaid: boolean;
  readonly onToggle: (card: PurgeCardView) => void;
}) {
  return (
    <section
      data-purge-desktop-composition=""
      style={{
        position: "absolute",
        top: `calc(${token("--space-8")} + max(var(--safe-area-inset-top), ${token("--safe-top")}))`,
        left: 0,
        right: 0,
        bottom: token("--space-8"),
        display: "grid",
        placeItems: "stretch center",
        zIndex: 20,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: `calc(100% - ${token("--space-12")} - ${token("--space-12")})`,
          maxWidth: 1500,
          height: "100%",
          display: "grid",
          gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)",
          gap: token("--space-12"),
          alignItems: "center",
        }}
      >
        <DesktopGuideScene guide={guide} />
        <CardRegion
          cards={cards}
          useBottomSheet={useBottomSheet}
          selectedEntryIds={selectedEntryIds}
          selectedCount={selectedCount}
          canSelectPaid={canSelectPaid}
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
  useBottomSheet,
  selectedEntryIds,
  selectedCount,
  canSelectPaid,
  onToggle,
  desktop = false,
}: {
  readonly cards: readonly PurgeCardView[];
  readonly useBottomSheet: boolean;
  readonly selectedEntryIds: readonly string[];
  readonly selectedCount: number;
  readonly canSelectPaid: boolean;
  readonly onToggle: (card: PurgeCardView) => void;
  readonly desktop?: boolean;
}) {
  const glassStyle: CSSProperties = useBottomSheet
    ? {
        ...glassSurfaceStyle({ radius: null }),
        background: `${token("--glass-sheen")}, ${token("--glass-fill-popover")}`,
        border: 0,
        ...(desktop
          ? {
              borderLeft: `1px solid ${token("--border-soft")}`,
            }
          : {
              borderTop: `1px solid ${token("--border-soft")}`,
              borderTopLeftRadius: token("--radius-panel"),
              borderTopRightRadius: token("--radius-panel"),
            }),
      }
    : {};
  const cardRegionStyle: CSSProperties = {
    position: "relative",
    zIndex: 10,
    minHeight: 0,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    padding: desktop
      ? `${token("--space-8")} ${token("--space-8")} ${token("--space-8")}`
      : `${token("--space-4")} ${token("--gutter")} calc(${token(
          "--safe-bottom",
        )} + ${selectedCount > 0 ? token("--space-12") : token("--space-6")})`,
    pointerEvents: "auto",
    ...(desktop
      ? {
          alignSelf: "stretch",
          height: "100%",
          boxSizing: "border-box",
        }
      : {}),
    ...glassStyle,
  };

  return (
    <section
      data-purge-card-grid=""
      data-purge-bottom-sheet={useBottomSheet ? "true" : "false"}
      data-purge-layout={desktop ? "desktop" : "mobile"}
      style={cardRegionStyle}
    >
      <h2
        data-testid="tango-purge-title"
        style={{
          width: "100%",
          maxWidth: desktop ? 920 : undefined,
          margin: `0 auto ${token("--space-4")}`,
          color: token("--text-on-glass"),
          font: token("--t-title-sm"),
          textAlign: "center",
          textShadow: token("--text-outline-media"),
          letterSpacing: 0,
        }}
      >
        Purge Cards:
      </h2>
      <div
        style={{
          width: "100%",
          maxWidth: desktop ? 920 : undefined,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: `repeat(${String(
            desktop ? DESKTOP_COLUMNS : MOBILE_COLUMNS,
          )}, minmax(0, 1fr))`,
          gap: token("--space-4"),
        }}
      >
        {cards.map((card) => {
          const selected = selectedEntryIds.includes(card.entryId);
          const disabled =
            !selected && card.purgeCostKind === "paid" && !canSelectPaid;
          return (
            <PurgeCardTile
              key={card.entryId}
              card={card}
              selected={selected}
              disabled={disabled}
              onToggle={onToggle}
            />
          );
        })}
      </div>
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
        style={{
          position: "absolute",
          left: "calc(-1 * (var(--space-10) + var(--space-4)))",
          bottom: "calc(-1 * var(--space-8))",
          width: "58vw",
          height: "100%",
          objectFit: "contain",
          objectPosition: "50% 100%",
          userSelect: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "32vw",
          right: `calc(${token("--gutter")} + ${token("--space-11")})`,
          bottom: token("--space-5"),
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

function PurgeCardTile({
  card,
  selected,
  disabled,
  onToggle,
}: {
  readonly card: PurgeCardView;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onToggle: (card: PurgeCardView) => void;
}) {
  return (
    <Pressable
      as="button"
      aria-label={card.card.name}
      aria-pressed={selected}
      disabled={disabled}
      data-testid={`tango-purge-card-${card.entryId}`}
      onClick={() => onToggle(card)}
      onContextMenu={(event: MouseEvent<HTMLElement>) => {
        event.preventDefault();
      }}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        borderRadius: token("--radius-card"),
        opacity: disabled ? 0.42 : 1,
        boxShadow:
          card.purgeCostKind === "free"
            ? `0 0 0 2px ${token("--danger")}`
            : "none",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        touchAction: "manipulation",
      }}
    >
      <GameCard
        card={card.card}
        transfiguration={card.transfiguration}
        selected={selected}
        selectionColor="danger"
        termDefinitions="none"
      />
    </Pressable>
  );
}
