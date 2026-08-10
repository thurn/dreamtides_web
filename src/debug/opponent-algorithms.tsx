// The `/opponent` debug tool's deck construction view model. It uses the same
// corpus selection and layer tuning as production battles, including the
// `corpus_opponent_deck_constructed` reconstruction log.

import type { ReactNode } from "react";
import type { CardData } from "../types/cards";
import type { JourneyContent } from "../data/journey-content";
import type { AffiliationContent, DreamAvatarContent } from "../types/content";
import {
  buildCorpusOpponentDeck,
  type CorpusOpponentDeckBuild,
} from "../battle/integration/corpus-opponent-deck";
import { CardView } from "../cumulus/components/card/CardView";

/** One stat tile shown in the left panel's 2-column grid. */
export interface StatRow {
  label: string;
  value: string;
}

/**
 * The fully-resolved presentation for one opponent generation. The component
 * renders the deck grid, stat tiles, dreamsign labels, ability state, and
 * optional provenance from this view.
 */
export interface OpponentDebugView {
  /** Cards to show in the deck grid. */
  deckCards: CardData[];
  /** The stat tiles, in display order. */
  statRows: StatRow[];
  /** Dreamsign display names assigned to the opponent;
   * the dreamsign icon section is driven by run context, not this field). */
  dreamsignLabels: string[];
  /** Whether the opponent DreamAvatar's ability is active at this layer. */
  abilityActive: boolean;
  /** Optional provenance panel rendered below the deck grid. */
  provenance?: ReactNode;
}

/**
 * The shared run context needed to build the debug view.
 */
export interface OpponentDebugViewParams {
  opponentDreamAvatar: DreamAvatarContent | null;
  affiliation: AffiliationContent | null;
  completionLevel: number;
  layerCount: number;
  poolSeed: number;
}

export function buildOpponentDebugView(
  content: JourneyContent,
  params: OpponentDebugViewParams,
): OpponentDebugView | null {
  const build = buildCorpusOpponentDeck({
    opponentDreamAvatar: params.opponentDreamAvatar,
    knownGoodDecklists: content.knownGoodDecklists ?? [],
    affiliation: params.affiliation,
    cardDatabase: content.cardDatabase,
    dreamsignSignatures: content.dreamsignSignatures,
    dreamsignTemplates: content.dreamsignTemplates,
    completionLevel: params.completionLevel,
    layerCount: params.layerCount,
    poolSeed: params.poolSeed,
    opponentsContentHash: content.opponentsData.contentHash,
    progression: content.opponentsData.progression,
    selectionConfig: content.opponentsData.corpusSelection,
  });
  if (build === null) return null;

  return {
    deckCards: build.finalCards,
    statRows: [
      { label: "Source", value: build.source.name },
      { label: "Sig fit", value: build.signatureFit.toFixed(3) },
      { label: "Affil. fit", value: build.affiliationFit.toFixed(3) },
      { label: "Combined", value: build.combined.toFixed(3) },
      { label: "Candidates", value: String(build.candidateCount) },
      { label: "Top-K", value: String(build.topK.length) },
    ],
    dreamsignLabels: build.dreamsign ? [build.dreamsign.name] : [],
    abilityActive: build.abilityActive,
    provenance: (
      <CorpusProvenance
        build={build}
        completionLevel={params.completionLevel}
        dreamsignsFromLayer={
          content.opponentsData.progression.dreamsignsFromLayer
        }
      />
    ),
  };
}

// ---------------------------------------------------------------------------
// Corpus provenance panel. Mirrors the panel styling in OpponentDebugApp and
// reuses the deck grid's CardView thumbnails for the Stage B
// diff so the source seat, the top-K ranking window, the layer tuning diff, the
// assigned dreamsign, and the ability state are all inspectable.
// ---------------------------------------------------------------------------

const INSET_BG = "#0b1220";
const TEXT = "#e2e8f0";
const MUTED = "#94a3b8";
const FAINT = "#64748b";
const ACCENT = "#a78bfa";

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: MUTED,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  marginTop: 16,
  marginBottom: 8,
};

/** A small grid of card thumbnails matching the main deck grid's tiles. */
function CardThumbGrid({ cards }: { cards: readonly CardData[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
        gap: 10,
      }}
    >
      {cards.map((card, index) => (
        <CardView key={`${card.id}:${String(index)}`} card={card} />
      ))}
    </div>
  );
}

function CorpusProvenance({
  build,
  completionLevel,
  dreamsignsFromLayer,
}: {
  build: CorpusOpponentDeckBuild;
  completionLevel: number;
  dreamsignsFromLayer: number;
}) {
  const { source, topK, modifications, dreamsign, abilityActive } = build;
  const dreamsignText =
    dreamsign === null
      ? completionLevel < dreamsignsFromLayer
        ? `none — layer < ${String(dreamsignsFromLayer)}`
        : "none"
      : `${dreamsign.name} (fit ${dreamsign.fit.toFixed(3)})`;

  return (
    <div
      style={{
        marginTop: 18,
        borderTop: "0.5px solid rgba(255,255,255,0.12)",
        paddingTop: 14,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc" }}>
        Corpus provenance
      </div>

      <div style={sectionLabelStyle}>Source seat</div>
      <div style={{ fontSize: 13, color: TEXT }}>{source.name}</div>
      <div
        style={{
          fontSize: 11,
          color: FAINT,
          fontFamily: "monospace",
          marginTop: 2,
        }}
      >
        {source.id}
      </div>
      {source.sourceFile !== undefined && source.sourceFile !== source.id && (
        <div style={{ fontSize: 11, color: FAINT, fontFamily: "monospace" }}>
          {source.sourceFile}
        </div>
      )}

      <div style={sectionLabelStyle}>Top-K window ({topK.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {topK.map((entry, index) => {
          const selected = entry.id === source.id;
          return (
            <div
              key={`${entry.id}:${String(index)}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                background: selected ? "rgba(124,92,255,0.18)" : INSET_BG,
                border: selected
                  ? "0.5px solid rgba(167,139,250,0.5)"
                  : "0.5px solid rgba(255,255,255,0.08)",
                borderRadius: 6,
                padding: "5px 9px",
                fontSize: 12,
              }}
            >
              <span style={{ color: selected ? ACCENT : TEXT }}>
                {selected ? "▶ " : ""}
                {entry.name}
              </span>
              <span style={{ color: MUTED, fontFamily: "monospace" }}>
                {entry.combined.toFixed(3)}
              </span>
            </div>
          );
        })}
      </div>

      {modifications.legendariesRemoved.length > 0 && (
        <>
          <div style={sectionLabelStyle}>
            Legendaries removed ({modifications.legendariesRemoved.length})
          </div>
          <CardThumbGrid cards={modifications.legendariesRemoved} />
        </>
      )}

      {modifications.legendaryReplacements.length > 0 && (
        <>
          <div style={sectionLabelStyle}>
            Legendary replacements ({modifications.legendaryReplacements.length}
            )
          </div>
          <CardThumbGrid cards={modifications.legendaryReplacements} />
        </>
      )}

      {modifications.cardsCut.length > 0 && (
        <>
          <div style={sectionLabelStyle}>
            Cards cut ({modifications.cardsCut.length})
          </div>
          <CardThumbGrid cards={modifications.cardsCut} />
        </>
      )}

      {modifications.startersAdded.length > 0 && (
        <>
          <div style={sectionLabelStyle}>
            Starters added ({modifications.startersAdded.length})
          </div>
          <CardThumbGrid cards={modifications.startersAdded} />
        </>
      )}

      <div style={sectionLabelStyle}>Dreamsign</div>
      <div style={{ fontSize: 13, color: TEXT }}>{dreamsignText}</div>

      <div style={sectionLabelStyle}>Ability</div>
      <div style={{ fontSize: 13, color: abilityActive ? ACCENT : MUTED }}>
        {abilityActive ? "Active" : "Inactive"}
      </div>
    </div>
  );
}
