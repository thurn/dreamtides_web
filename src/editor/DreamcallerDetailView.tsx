import { useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import { CardView } from "../components/CardView";
import { DreamcallerPortrait } from "../components/DreamcallerPortrait";
import { RulesText } from "../components/RulesText";
import { SIZE_PRESETS } from "../components/card-size";
import type { CardData } from "../types/cards";
import type { QuestContent } from "../data/quest-content";
import { TIDE_DOT_COLOR } from "./TidePoolModal";
import type {
  EditorDreamcallerRecord,
  EditorTideOption,
} from "./dreamcaller-types";

export interface DreamcallerDetailViewProps {
  dreamcaller: EditorDreamcallerRecord;
  tides: readonly EditorTideOption[];
  /**
   * Quest content backing the signature-card lookup. `null` while the bundle
   * is still loading; an error string when the load failed.
   */
  questContent: QuestContent | null;
  questContentError: string | null;
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
  return tide.displayName !== ""
    ? tide.displayName
    : tide.shortName !== ""
      ? tide.shortName
      : tide.name;
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
      color: TIDE_DOT_COLOR[tide.color],
      known: true,
    };
  });
}

function TideChip({ tide }: { tide: ResolvedTide }) {
  return (
    <span
      title={tide.known ? tide.label : `${tide.label} (unknown tide id)`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        padding: "5px 11px",
        borderRadius: "999px",
        border: `1px solid ${tide.color}`,
        background: "rgba(255, 255, 255, 0.05)",
        fontSize: "0.8rem",
        fontWeight: 700,
        color: tide.known ? "#eef4f1" : "#cbd5f5",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "9px",
          height: "9px",
          borderRadius: "50%",
          background: tide.color,
          boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.35)",
        }}
      />
      {tide.label}
    </span>
  );
}

function TideGroup({
  title,
  tides,
  emptyLabel,
}: {
  title: string;
  tides: ResolvedTide[];
  emptyLabel: string;
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
            <TideChip key={tide.id} tide={tide} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DreamcallerDetailView({
  dreamcaller,
  tides,
  questContent,
  questContentError,
  onClose,
}: DreamcallerDetailViewProps) {
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
      dreamcaller.tidePool.starter === null
        ? []
        : resolveTides([dreamcaller.tidePool.starter], tideById),
    [dreamcaller.tidePool.starter, tideById],
  );
  const facetTides = useMemo(
    () => resolveTides(dreamcaller.tidePool.facets, tideById),
    [dreamcaller.tidePool.facets, tideById],
  );
  const neutralTides = useMemo(
    () => resolveTides(dreamcaller.tidePool.neutral, tideById),
    [dreamcaller.tidePool.neutral, tideById],
  );

  // Resolve the Dreamcaller's signature card names (sourced from quest content,
  // which mirrors `signature-cards` in dreamcallers_v2.toml) to renderable
  // cards. Matching is name-on-name against the card database, the same key the
  // bundle and the /sigdecks tool use.
  const signature = useMemo<SignatureResolution>(() => {
    if (questContent === null) {
      return { cards: [], unresolved: [] };
    }
    const match = questContent.dreamcallers.find(
      (entry) => entry.id === dreamcaller.id,
    );
    const names = match?.signatureCards ?? [];
    if (names.length === 0) {
      return { cards: [], unresolved: [] };
    }
    const byName = new Map<string, CardData>();
    for (const card of questContent.cardDatabase.values()) {
      byName.set(card.name.toLowerCase(), card);
    }
    const cards: CardData[] = [];
    const unresolved: string[] = [];
    for (const name of names) {
      const card = byName.get(name.toLowerCase());
      if (card === undefined) {
        unresolved.push(name);
      } else {
        cards.push(card);
      }
    }
    return { cards, unresolved };
  }, [questContent, dreamcaller.id]);

  const hasAnyTide =
    starterTides.length + facetTides.length + neutralTides.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${dreamcaller.name} details`}
      data-dreamcaller-detail={dreamcaller.id}
      style={overlayStyle}
    >
      <header style={headerStyle}>
        <div style={{ width: 96, height: 96, flexShrink: 0 }}>
          <DreamcallerPortrait
            dreamcaller={{
              imageNumber: dreamcaller.imageNumber,
              name: dreamcaller.name,
              title: dreamcaller.title,
            }}
            variant="panel"
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "1.4rem", fontWeight: 850, color: "#fff7e0" }}>
            {dreamcaller.name}
          </div>
          <div
            style={{
              fontSize: "0.95rem",
              fontStyle: "italic",
              color: "#a78bfa",
              marginBottom: 8,
            }}
          >
            {dreamcaller.title}
          </div>
          <div
            style={{
              fontSize: "0.88rem",
              lineHeight: 1.4,
              color: "#dce6e2",
              maxWidth: 720,
            }}
          >
            <RulesText text={dreamcaller["rendered-text"]} />
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
              {dreamcaller.startingEssence}
            </span>
          </div>
        </div>
        <button
          type="button"
          data-dreamcaller-detail-close=""
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
          {questContentError !== null ? (
            <p style={{ margin: 0, color: "#fecaca", fontSize: "0.85rem" }}>
              Failed to load card data: {questContentError}
            </p>
          ) : questContent === null ? (
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
              Loading card database…
            </p>
          ) : signature.cards.length === 0 && signature.unresolved.length === 0 ? (
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
              This Dreamcaller has no signature cards.
            </p>
          ) : (
            <>
              {/* Tile the signature cards at the quest draft-offer width so the
                  display matches the Deck Viewer's "large" preset. The grid is
                  an inline-size container so the cards' `100cqw`-based width
                  resolves against the grid, not the viewport. */}
              <div style={{ containerType: "inline-size" }}>
                <div
                  data-dreamcaller-signature-grid={dreamcaller.id}
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
              <TideGroup
                title="Starter"
                tides={starterTides}
                emptyLabel="No starter tide."
              />
              <TideGroup
                title="Facets"
                tides={facetTides}
                emptyLabel="No facet tides."
              />
              <TideGroup
                title="Neutral"
                tides={neutralTides}
                emptyLabel="No neutral tides."
              />
            </div>
          ) : (
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
              No tides assigned to this Dreamcaller.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
