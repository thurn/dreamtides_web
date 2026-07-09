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
const DESKTOP_COLUMNS = 6;
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
  const cardRegionStyle: CSSProperties = {
    position: "relative",
    zIndex: 10,
    minHeight: 0,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    padding: `${token("--space-4")} ${token("--gutter")} calc(${token(
      "--safe-bottom",
    )} + ${selectedCount > 0 ? token("--space-12") : token("--space-6")})`,
    ...(useBottomSheet
      ? {
          ...glassSurfaceStyle({ radius: null }),
          background: `${token("--glass-sheen")}, ${token(
            "--glass-fill-popover",
          )}`,
          border: 0,
          borderTop: `1px solid ${token("--border-soft")}`,
          borderTopLeftRadius: token("--radius-panel"),
          borderTopRightRadius: token("--radius-panel"),
        }
      : {}),
  };

  return (
    <div
      className="tango"
      data-testid="tango-purge-site-screen"
      data-tango-purge-site=""
      style={{
        position: "fixed",
        inset: 0,
        minHeight: "100vh",
        display: "grid",
        gridTemplateRows: GUIDE_TOP_ROWS,
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

      <GuideBand guide={view.guide} />

      <section
        data-purge-card-grid=""
        data-purge-bottom-sheet={useBottomSheet ? "true" : "false"}
        style={cardRegionStyle}
      >
        <h2
          data-testid="tango-purge-title"
          style={{
            width: "100%",
            maxWidth: isDesktop ? 980 : undefined,
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
            maxWidth: isDesktop ? 980 : undefined,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: `repeat(${String(
              isDesktop ? DESKTOP_COLUMNS : MOBILE_COLUMNS,
            )}, minmax(0, 1fr))`,
            gap: token("--space-4"),
          }}
        >
          {view.cards.map((card) => {
            const selected = selectedEntryIds.includes(card.entryId);
            const disabled =
              !selected && card.purgeCostKind === "paid" && !canSelectPaid;
            return (
              <PurgeCardTile
                key={card.entryId}
                card={card}
                selected={selected}
                disabled={disabled}
                onToggle={toggleSelection}
              />
            );
          })}
        </div>
      </section>

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
