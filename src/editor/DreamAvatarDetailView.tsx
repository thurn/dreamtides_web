import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { CardView } from "../cumulus/components/card/CardView";
import { DreamAvatarPortrait } from "../cumulus/components/hud/DreamAvatarPortrait";
import { RulesText } from "../cumulus/components/card/RulesText";
import { SIZE_PRESETS } from "./card-size";
import type { CardData } from "../types/cards";
import type { JourneyContent } from "../data/journey-content";
import type { Tides4DeckJson, Tides4DecksJson } from "../draft/pool/tides4-io";
import { resolveTideDeck, type TideDeckResolution } from "./tide-deck-resolution";
import { tideDotColor } from "./TidePoolModal";
import type {
  EditorDreamAvatarRecord,
  EditorTideOption,
} from "./dream-avatar-types";

export interface DreamAvatarDetailViewProps {
  dreamAvatar: EditorDreamAvatarRecord;
  tides: readonly EditorTideOption[];
  /**
   * Journey content backing the signature-card lookup. `null` while the bundle
   * is still loading; an error string when the load failed.
   */
  journeyContent: JourneyContent | null;
  journeyContentError: string | null;
  /**
   * The committed `tides4` artifact backing the tide decklists shown when a Tide
   * is clicked. `null` while it is still loading; an error string when the load
   * failed.
   */
  tideDecks: Tides4DecksJson | null;
  tideDecksError: string | null;
  onClose: () => void;
}

interface ResolvedTide {
  id: string;
  label: string;
  color: string;
  /** Tide identities the editor does not know about still render by id. */
  known: boolean;
}

interface SignatureResolution {
  /** Signature cards that resolved to a renderable card, in source order. */
  cards: CardData[];
  /** Signature card names with no matching card in the database. */
  unresolved: string[];
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483600,
  display: "flex",
  flexDirection: "column",
  background: "#070d1a",
  color: "#e2e8f0",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

const headerStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "flex-start",
  gap: "18px",
  padding: "18px 24px",
  borderBottom: "1px solid rgba(247, 241, 223, 0.12)",
};

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "0.82rem",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#8edbd1",
};

const tideGroupTitleStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: "0.72rem",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#94a3b8",
};

function tideOptionLabel(tide: EditorTideOption): string {
  return tide.displayName !== "" ? tide.displayName : tide.id;
}

function resolveTides(
  ids: readonly string[],
  tideById: Map<string, EditorTideOption>,
): ResolvedTide[] {
  return ids.map((id) => {
    const tide = tideById.get(id);
    if (tide === undefined) {
      return { id, label: id, color: "#94a3b8", known: false };
    }
    return {
      id,
      label: tideOptionLabel(tide),
      color: tideDotColor(tide.resonance),
      known: true,
    };
  });
}

function TideChip({
  tide,
  selected,
  onSelect,
}: {
  tide: ResolvedTide;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      data-tide-chip={tide.id}
      aria-pressed={selected}
      title={
        tide.known
          ? `Show the cards in ${tide.label}`
          : `${tide.label} (unknown tide id)`
      }
      onClick={() => onSelect(tide.id)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        padding: "5px 11px",
        borderRadius: "999px",
        border: `1px solid ${tide.color}`,
        background: selected ? tide.color : "rgba(255, 255, 255, 0.05)",
        boxShadow: selected ? `0 0 0 2px ${tide.color}55` : "none",
        fontSize: "0.8rem",
        fontWeight: 700,
        color: selected ? "#0b1220" : tide.known ? "#eef4f1" : "#cbd5f5",
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "9px",
          height: "9px",
          borderRadius: "50%",
          background: selected ? "#0b1220" : tide.color,
          boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.35)",
        }}
      />
      {tide.label}
    </button>
  );
}

function TideGroup({
  title,
  tides,
  emptyLabel,
  selectedTideId,
  onSelectTide,
}: {
  title: string;
  tides: ResolvedTide[];
  emptyLabel: string;
  selectedTideId: string | null;
  onSelectTide: (id: string) => void;
}) {
  return (
    <div>
      <h3 style={tideGroupTitleStyle}>
        {title} ({tides.length})
      </h3>
      {tides.length === 0 ? (
        <p style={{ margin: 0, color: "#64748b", fontSize: "0.78rem" }}>
          {emptyLabel}
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {tides.map((tide) => (
            <TideChip
              key={tide.id}
              tide={tide}
              selected={tide.id === selectedTideId}
              onSelect={onSelectTide}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TideCardPanel({
  label,
  color,
  loading,
  error,
  resolution,
  onClear,
}: {
  label: string;
  color: string;
  loading: boolean;
  error: string | null;
  resolution: TideDeckResolution | null;
  onClear: () => void;
}) {
  return (
    <div
      data-tide-card-panel=""
      style={{
        marginTop: 4,
        border: `1px solid ${color}66`,
        borderRadius: 12,
        background: "rgba(255, 255, 255, 0.03)",
        padding: "14px 16px 16px",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 11,
            height: 11,
            borderRadius: "50%",
            background: color,
            boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.35)",
            flexShrink: 0,
          }}
        />
        <h3
          style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "#fff7e0" }}
        >
          {label}
        </h3>
        {resolution !== null && resolution.found ? (
          <span style={{ color: "#94a3b8", fontSize: "0.78rem", fontWeight: 600 }}>
            {resolution.cards.length} card{resolution.cards.length === 1 ? "" : "s"}
            {resolution.totalCopies !== resolution.cards.length
              ? ` · ${String(resolution.totalCopies)} copies`
              : ""}
          </span>
        ) : null}
        <button
          type="button"
          data-tide-card-panel-close=""
          onClick={onClear}
          style={{
            marginLeft: "auto",
            border: "1px solid rgba(247, 241, 223, 0.28)",
            background: "transparent",
            color: "#d9e1dd",
            borderRadius: 6,
            padding: "5px 12px",
            fontWeight: 700,
            fontSize: "0.78rem",
            cursor: "pointer",
          }}
        >
          Hide
        </button>
      </div>

      {error !== null ? (
        <p style={{ margin: 0, color: "#fecaca", fontSize: "0.85rem" }}>{error}</p>
      ) : loading ? (
        <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
          Loading tide cards…
        </p>
      ) : resolution === null || !resolution.found ? (
        <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
          No decklist found for this tide.
        </p>
      ) : resolution.cards.length === 0 && resolution.unresolved.length === 0 ? (
        <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
          This tide has no cards.
        </p>
      ) : (
        <>
          {/* Tile the tide's cards at the same draft-offer width the signature
              grid uses; the inline-size container resolves the cards'
              `100cqw`-based width against the grid, not the viewport. */}
          <div style={{ containerType: "inline-size" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: SIZE_PRESETS.large.columns,
                gap: SIZE_PRESETS.large.gap,
              }}
            >
              {resolution.cards.map(({ card, copies }, index) => (
                <div
                  key={`${card.id}:${String(index)}`}
                  style={{ position: "relative" }}
                >
                  <CardView card={card} large />
                  {copies > 1 ? (
                    <div
                      data-tide-card-copies=""
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        borderRadius: 999,
                        border: "1px solid rgba(148, 219, 209, 0.6)",
                        background: "rgba(8, 13, 26, 0.92)",
                        color: "#8edbd1",
                        padding: "1px 8px",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                      }}
                    >
                      ×{copies}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          {resolution.unresolved.length > 0 ? (
            <p style={{ margin: "12px 0 0", color: "#64748b", fontSize: "0.78rem" }}>
              No card found for: {resolution.unresolved.join(", ")}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function DreamAvatarDetailView({
  dreamAvatar,
  tides,
  journeyContent,
  journeyContentError,
  tideDecks,
  tideDecksError,
  onClose,
}: DreamAvatarDetailViewProps) {
  // Close on Escape so the detail screen behaves like the editor's other
  // overlays.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const tideById = useMemo(
    () => new Map(tides.map((tide) => [tide.id, tide])),
    [tides],
  );

  const starterTides = useMemo(
    () =>
      dreamAvatar.tidePool.starter === null
        ? []
        : resolveTides([dreamAvatar.tidePool.starter], tideById),
    [dreamAvatar.tidePool.starter, tideById],
  );
  const facetTides = useMemo(
    () => resolveTides(dreamAvatar.tidePool.facets, tideById),
    [dreamAvatar.tidePool.facets, tideById],
  );
  const neutralTides = useMemo(
    () => resolveTides(dreamAvatar.tidePool.neutral, tideById),
    [dreamAvatar.tidePool.neutral, tideById],
  );

  // The tide decklists key cards by their stable cards_v2 UUID; the card
  // database is keyed by card number, so index it by lowercased UUID to resolve
  // a tide's `{ id, copies }` entries to renderable cards. Also used by the
  // signature-card panel below.
  const cardsByUuid = useMemo(() => {
    const byId = new Map<string, CardData>();
    if (journeyContent !== null) {
      for (const card of journeyContent.cardDatabase.values()) {
        byId.set(card.id.toLowerCase(), card);
      }
    }
    return byId;
  }, [journeyContent]);

  // Resolve the DreamAvatar's signature cards to renderable CardData. Resolution
  // uses `signatureCardIds` (stable cards_v2 UUIDs, index-aligned with
  // `signatureCards`) so two cards that share a display name are never confused.
  const signature = useMemo<SignatureResolution>(() => {
    if (journeyContent === null) {
      return { cards: [], unresolved: [] };
    }
    const match = journeyContent.dreamAvatars.find(
      (entry) => entry.id === dreamAvatar.id,
    );
    const ids = match?.signatureCardIds ?? [];
    const names = match?.signatureCards ?? [];
    if (ids.length === 0 && names.length === 0) {
      return { cards: [], unresolved: [] };
    }
    const cards: CardData[] = [];
    const unresolved: string[] = [];
    // Prefer UUID-keyed resolution; fall back to the display name for any index
    // position where `signatureCardIds` is absent or shorter than `signatureCards`.
    const resolveCount = Math.max(ids.length, names.length);
    for (let i = 0; i < resolveCount; i++) {
      const uuid = ids[i];
      const card =
        uuid !== undefined
          ? cardsByUuid.get(uuid.toLowerCase())
          : undefined;
      if (card !== undefined) {
        cards.push(card);
      } else {
        // UUID lookup failed (missing id or UUID not in database); record as
        // unresolved using the display name where available.
        unresolved.push(names[i] ?? uuid ?? `index ${String(i)}`);
      }
    }
    return { cards, unresolved };
  }, [journeyContent, dreamAvatar.id, cardsByUuid]);

  // Which Tide (if any) the viewer has clicked to reveal its decklist.
  const [selectedTideId, setSelectedTideId] = useState<string | null>(null);

  // Drop the open tide selection whenever the screen switches DreamAvatars so a
  // stale id (one not in the new DreamAvatar's pool) never lingers.
  useEffect(() => {
    setSelectedTideId(null);
  }, [dreamAvatar.id]);

  const deckById = useMemo(() => {
    const byId = new Map<string, Tides4DeckJson>();
    if (tideDecks !== null) {
      for (const deck of tideDecks.tides) {
        byId.set(deck.id, deck);
      }
    }
    return byId;
  }, [tideDecks]);

  const selectedTideResolution = useMemo<TideDeckResolution | null>(
    () =>
      selectedTideId === null
        ? null
        : resolveTideDeck(deckById.get(selectedTideId), cardsByUuid),
    [selectedTideId, deckById, cardsByUuid],
  );

  const selectedTideMeta =
    selectedTideId === null ? null : (tideById.get(selectedTideId) ?? null);
  const selectedTideLabel =
    selectedTideMeta !== null ? tideOptionLabel(selectedTideMeta) : (selectedTideId ?? "");
  const selectedTideColor =
    selectedTideMeta !== null
      ? tideDotColor(selectedTideMeta.resonance)
      : "#94a3b8";
  // The decklist needs both the card database (for renderable cards) and the
  // tides4 artifact (for the tide -> card mapping); we are loading until both
  // arrive, and only surface an error once a selection actually needs them.
  const tideCardsLoading = journeyContent === null || tideDecks === null;
  const tideCardsError = tideDecksError ?? journeyContentError;

  function handleSelectTide(id: string) {
    setSelectedTideId((current) => (current === id ? null : id));
  }

  const hasAnyTide =
    starterTides.length + facetTides.length + neutralTides.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${dreamAvatar.name} details`}
      data-dream-avatar-detail={dreamAvatar.id}
      style={overlayStyle}
    >
      <header style={headerStyle}>
        <div style={{ width: 96, height: 96, flexShrink: 0 }}>
          <DreamAvatarPortrait
            dreamAvatar={{
              imageNumber: dreamAvatar.imageNumber,
              name: dreamAvatar.name,
              title: dreamAvatar.title,
            }}
            variant="panel"
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "1.4rem", fontWeight: 850, color: "#fff7e0" }}>
            {dreamAvatar.name}
          </div>
          <div
            style={{
              fontSize: "0.95rem",
              fontStyle: "italic",
              color: "#a78bfa",
              marginBottom: 8,
            }}
          >
            {dreamAvatar.title}
          </div>
          <div
            style={{
              fontSize: "0.88rem",
              lineHeight: 1.4,
              color: "#dce6e2",
              maxWidth: 720,
            }}
          >
            <RulesText
              text={dreamAvatar["rendered-text"]}
              owner={{ kind: "dreamAvatar", id: dreamAvatar.id }}
            />
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: "0.8rem",
              color: "#94a3b8",
            }}
          >
            Starting essence{" "}
            <span style={{ color: "#fbbf24", fontWeight: 800 }}>
              {dreamAvatar.startingEssence}
            </span>
          </div>
        </div>
        <button
          type="button"
          data-dream-avatar-detail-close=""
          onClick={onClose}
          style={{
            flexShrink: 0,
            border: "1px solid rgba(247, 241, 223, 0.28)",
            background: "transparent",
            color: "#d9e1dd",
            borderRadius: "6px",
            padding: "9px 16px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </header>

      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          padding: "20px 24px 28px",
        }}
      >
        <section style={{ marginBottom: 28 }}>
          <h2 style={sectionTitleStyle}>Signature cards</h2>
          {journeyContentError !== null ? (
            <p style={{ margin: 0, color: "#fecaca", fontSize: "0.85rem" }}>
              Failed to load card data: {journeyContentError}
            </p>
          ) : journeyContent === null ? (
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
              Loading card database…
            </p>
          ) : signature.cards.length === 0 && signature.unresolved.length === 0 ? (
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
              This avatar has no signature cards.
            </p>
          ) : (
            <>
              {/* Tile the signature cards at the journey draft-offer width so the
                  display matches the Deck Viewer's "large" preset. The grid is
                  an inline-size container so the cards' `100cqw`-based width
                  resolves against the grid, not the viewport. */}
              <div style={{ containerType: "inline-size" }}>
                <div
                  data-dream-avatar-signature-grid={dreamAvatar.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: SIZE_PRESETS.large.columns,
                    gap: SIZE_PRESETS.large.gap,
                  }}
                >
                  {signature.cards.map((card, index) => (
                    <CardView key={`${card.id}:${String(index)}`} card={card} large />
                  ))}
                </div>
              </div>
              {signature.unresolved.length > 0 ? (
                <p
                  style={{
                    margin: "12px 0 0",
                    color: "#64748b",
                    fontSize: "0.78rem",
                  }}
                >
                  No card found for: {signature.unresolved.join(", ")}
                </p>
              ) : null}
            </>
          )}
        </section>

        <section>
          <h2 style={sectionTitleStyle}>Tides</h2>
          {hasAnyTide ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: "0.78rem" }}>
                Click a Tide to see the cards in its deck.
              </p>
              <TideGroup
                title="Starter"
                tides={starterTides}
                emptyLabel="No starter tide."
                selectedTideId={selectedTideId}
                onSelectTide={handleSelectTide}
              />
              <TideGroup
                title="Facets"
                tides={facetTides}
                emptyLabel="No facet tides."
                selectedTideId={selectedTideId}
                onSelectTide={handleSelectTide}
              />
              <TideGroup
                title="Neutral"
                tides={neutralTides}
                emptyLabel="No neutral tides."
                selectedTideId={selectedTideId}
                onSelectTide={handleSelectTide}
              />
              {selectedTideId !== null ? (
                <TideCardPanel
                  label={selectedTideLabel}
                  color={selectedTideColor}
                  loading={tideCardsLoading}
                  error={tideCardsError}
                  resolution={selectedTideResolution}
                  onClear={() => setSelectedTideId(null)}
                />
              ) : null}
            </div>
          ) : (
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
              No tides assigned to this avatar.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
