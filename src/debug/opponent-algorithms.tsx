// The `/opponent` debug tool's opponent-deck ALGORITHM REGISTRY. Each registered
// algorithm takes the shared run context the tool derives (DreamAvatar,
// affiliation, run position, pool seed) and produces an `AlgorithmView`: the
// deck cards to show, the stat tiles, the dreamsign labels, the ability flag,
// and an optional provenance panel. The component renders purely off the view,
// so adding an algorithm is just adding an entry here. Selection is driven by
// the `?algo=` URL param via {@link getAlgorithm}.
//
// Each algorithm OWNS its own logging: the coherent algorithm logs
// `opponent_deck_constructed` (mirroring a production battle), and the corpus
// algorithm's builder logs `corpus_opponent_deck_constructed` internally.

import type { ReactNode } from "react";
import type { CardData } from "../types/cards";
import type { JourneyContent } from "../data/journey-content";
import type {
  AffiliationContent,
  DreamAvatarContent,
  DreamsignTemplate,
} from "../types/content";
import {
  buildOpponentDeck,
  logOpponentDeckConstructed,
} from "../battle/integration/opponent-deck";
import {
  buildCorpusOpponentDeck,
  type CorpusOpponentDeckBuild,
} from "../battle/integration/corpus-opponent-deck";
import { opponentAbilityIsActive } from "../battle/integration/opponent-deck";
import { DEFAULT_POOL_VARIANT } from "../draft/pool/types";
import { CardView } from "../cumulus/components/card/CardView";

/** One stat tile shown in the left panel's 2-column grid. */
export interface StatRow {
  label: string;
  value: string;
}

/**
 * The fully-resolved presentation for one opponent generation under one
 * algorithm. The component renders entirely off this view (deck grid, stat
 * tiles, dreamsign labels, ability state, optional provenance) so the two
 * algorithms share one render path.
 */
export interface AlgorithmView {
  /** Cards to show in the deck grid. */
  deckCards: CardData[];
  /** The stat tiles, in display order. */
  statRows: StatRow[];
  /** Dreamsign display names this algorithm assigned (populated for parity;
   * the dreamsign icon section is driven by run context, not this field). */
  dreamsignLabels: string[];
  /** Whether the opponent DreamAvatar's ability is active at this layer. */
  abilityActive: boolean;
  /**
   * When `true`, the algorithm produced no deck for these parameters; the
   * component shows the algorithm's "unavailable" fallback message instead of
   * the (empty) deck grid. The coherent algorithm sets this when its
   * `buildOpponentDeck` returns `null`, preserving the exact prior behavior.
   */
  unavailable?: boolean;
  /** Optional provenance panel rendered below the deck grid. */
  provenance?: ReactNode;
}

/**
 * The shared run context one algorithm needs to build its view. The five core
 * fields (DreamAvatar, affiliation, completion level, layer count, pool seed)
 * drive both algorithms; `dreamsigns` and `battleEntryKey` are the run context
 * the coherent algorithm needs to reproduce the existing display + log.
 */
export interface AlgorithmParams {
  opponentDreamAvatar: DreamAvatarContent | null;
  affiliation: AffiliationContent | null;
  completionLevel: number;
  layerCount: number;
  poolSeed: number;
  /** The run's dreamsigns (run context; also shown in the dreamsign section). */
  dreamsigns: readonly DreamsignTemplate[];
  /** The logged battleEntryKey == the shareable generation id. */
  battleEntryKey: string;
}

/** A selectable opponent-deck algorithm for the `/opponent` debug tool. */
export interface DebugAlgorithm {
  id: string;
  label: string;
  build(content: JourneyContent, params: AlgorithmParams): AlgorithmView | null;
}

// ---------------------------------------------------------------------------
// Coherent algorithm: the production coherent-draft simulation. Builds the
// deck via `buildOpponentDeck` and logs `opponent_deck_constructed`, exactly as
// `createBattleInit` does, so the tool matches a real battle at the same
// position.
// ---------------------------------------------------------------------------

const coherentAlgorithm: DebugAlgorithm = {
  id: "coherent",
  label: "Coherent",
  build(content, params) {
    const build = buildOpponentDeck({
      opponentDreamAvatar: params.opponentDreamAvatar,
      fitModel: content.fitModel,
      draftRecords: content.draftRecords ?? [],
      poolContext: content.poolContext,
      cardDatabase: content.cardDatabase,
      affiliation: params.affiliation,
      completionLevel: params.completionLevel,
      layerCount: params.layerCount,
      poolSeed: params.poolSeed,
      config: content.opponentsData.coherentDraft,
    });

    // Record the generation so the debug run is reconstructable from the journey
    // log just like a production battle's opponent build.
    logOpponentDeckConstructed({
      battleEntryKey: params.battleEntryKey,
      opponentDreamAvatar: params.opponentDreamAvatar,
      poolVariant: content.poolContext?.poolVariant ?? DEFAULT_POOL_VARIANT,
      poolSeed: params.poolSeed,
      completionLevel: params.completionLevel,
      layerCount: params.layerCount,
      affiliation: params.affiliation,
      dreamsigns: params.dreamsigns,
      build,
      fallbackDeckSize: build?.cards.length ?? 0,
      opponentsContentHash: content.opponentsData.contentHash,
      progression: content.opponentsData.progression,
      coherentDraft: content.opponentsData.coherentDraft,
    });

    return {
      deckCards: build?.distinctCards ?? [],
      statRows: [
        {
          label: "Affiliation",
          value: params.affiliation?.name ?? "Neutral",
        },
        {
          label: "Distinct",
          value: String(build?.distinctCards.length ?? 0),
        },
        {
          label: "Coherence",
          value: build ? build.coherence.score.toFixed(3) : "—",
        },
        {
          label: "Affil. fit",
          value: build ? build.affiliationFit.toFixed(3) : "—",
        },
        {
          label: "Best of",
          value: String(build?.candidateCount ?? 0),
        },
        {
          label: "Removed",
          value: String(build?.removalCount ?? 0),
        },
      ],
      dreamsignLabels: params.dreamsigns.map((d) => d.name),
      abilityActive: opponentAbilityIsActive(
        params.completionLevel,
        content.opponentsData.progression.abilityActiveFromLayer,
      ),
      unavailable: build === null,
    };
  },
};

// ---------------------------------------------------------------------------
// Corpus algorithm: Stage A selects a known-good decklist for the opponent
// DreamAvatar, Stage B tunes it to the run position. The builder logs
// `corpus_opponent_deck_constructed` internally.
// ---------------------------------------------------------------------------

const corpusAlgorithm: DebugAlgorithm = {
  id: "corpus",
  label: "Corpus",
  build(content, params) {
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
  },
};

export const OPPONENT_ALGORITHMS: readonly DebugAlgorithm[] = [
  corpusAlgorithm,
  coherentAlgorithm,
];

/** Resolve the algorithm for an `?algo=` value, defaulting to corpus. */
export function getAlgorithm(id: string | null): DebugAlgorithm {
  return (
    OPPONENT_ALGORITHMS.find((algorithm) => algorithm.id === id) ??
    corpusAlgorithm
  );
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
