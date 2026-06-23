import { useEffect, useMemo, useState } from "react";
import type { CardData } from "../types/cards";
import type {
  AffiliationContent,
  DreamcallerContent,
  DreamscapeContent,
  DreamsignTemplate,
} from "../types/content";
import { loadQuestContent, type QuestContent } from "../data/quest-content";
import {
  buildOpponentDeck,
  buildOpponentDreamsigns,
  DEFAULT_RUN_LAYER_COUNT,
  logOpponentDeckConstructed,
  opponentCarriesDreamsign,
  runMidpointCompletionLevel,
  selectOpponentDreamcaller,
  type OpponentDeckBuild,
} from "../battle/integration/opponent-deck";
import { createBattleRngStreams, deriveBattleSeed } from "../battle/random";
import { DEFAULT_POOL_VARIANT } from "../draft/pool/types";
import { CardView } from "../components/CardView";
import { DreamcallerPortrait } from "../components/DreamcallerPortrait";
import { dreamsignIconUrl } from "../atlas/atlas-display";

/**
 * `/opponent` debugging tool. Simulates the pre-battle opponent build the
 * battle integration produces, so a designer can inspect — for any run position
 * and dreamscape — which Dreamcaller, dreamsigns, and deck the generator yields,
 * and re-roll the same parameters to study the spread.
 *
 * The opponent is built by replaying the exact primitives `createBattleInit`
 * uses ({@link selectOpponentDreamcaller}, {@link buildOpponentDreamsigns},
 * {@link buildOpponentDeck}), so what the tool shows matches what a real battle
 * at the same position would generate for a given seed. "Refresh" advances a
 * nonce that changes the battle seed, re-rolling a fresh generation under the
 * same layer / dreamscape parameters.
 */

/** The fixed enemy-pool sub-seed derivation `createBattleInit` applies to the
 * battle seed (mirrors its private `deriveEnemyPoolSeed`). */
function deriveEnemyPoolSeed(seed: number): number {
  return (seed ^ 0x5f3759df) >>> 0;
}

interface OpponentGeneration {
  dreamcaller: DreamcallerContent | null;
  dreamsigns: DreamsignTemplate[];
  affiliation: AffiliationContent | null;
  dreamscape: DreamscapeContent | null;
  build: OpponentDeckBuild | null;
  seed: number;
  poolSeed: number;
  completionLevel: number;
  layerCount: number;
  carriesDreamsign: boolean;
}

const NEUTRAL_DREAMSCAPE = "__neutral__";

function generateOpponent(
  content: QuestContent,
  completionLevel: number,
  dreamscapeId: string | null,
  nonce: number,
): OpponentGeneration {
  const layerCount = DEFAULT_RUN_LAYER_COUNT;
  const battleEntryKey = `opponent-debug:${dreamscapeId ?? "neutral"}:${String(
    completionLevel,
  )}:${String(nonce)}`;
  const seed = deriveBattleSeed(`opponent-debug-seed:${battleEntryKey}`);
  const streams = createBattleRngStreams(seed);

  // Mirror createBattleInit's order of RNG consumption on the enemyDescriptor
  // stream: select the opponent Dreamcaller first, then its dreamsigns.
  const dreamcaller = selectOpponentDreamcaller(
    content.dreamcallers,
    null,
    streams.enemyDescriptor,
  );
  const dreamsigns = buildOpponentDreamsigns(
    completionLevel,
    layerCount,
    content.dreamsignTemplates,
    streams.enemyDescriptor,
  );

  const dreamscape =
    dreamscapeId === null
      ? null
      : content.dreamscapes.find((d) => d.id === dreamscapeId) ?? null;
  const affiliation =
    dreamscape?.affiliationId == null
      ? null
      : content.affiliations.find((a) => a.id === dreamscape.affiliationId) ??
        null;

  const poolSeed = deriveEnemyPoolSeed(seed);
  const build = buildOpponentDeck({
    opponentDreamcaller: dreamcaller,
    fitModel: content.fitModel,
    draftRecords: content.draftRecords ?? [],
    poolContext: content.poolContext,
    cardDatabase: content.cardDatabase,
    affiliation,
    completionLevel,
    layerCount,
    poolSeed,
  });

  // Record the generation so the debug run is reconstructable from the quest
  // log just like a production battle's opponent build.
  logOpponentDeckConstructed({
    battleEntryKey,
    opponentDreamcaller: dreamcaller,
    poolVariant: content.poolContext?.poolVariant ?? DEFAULT_POOL_VARIANT,
    poolSeed,
    completionLevel,
    layerCount,
    affiliation,
    dreamsigns,
    build,
    fallbackDeckSize: build?.cards.length ?? 0,
  });

  return {
    dreamcaller,
    dreamsigns,
    affiliation,
    dreamscape,
    build,
    seed,
    poolSeed,
    completionLevel,
    layerCount,
    carriesDreamsign: opponentCarriesDreamsign(completionLevel, layerCount),
  };
}

const PANEL_BG = "#111a2e";
const INSET_BG = "#0b1220";
const BORDER = "0.5px solid rgba(255,255,255,0.12)";
const TEXT = "#e2e8f0";
const MUTED = "#94a3b8";
const FAINT = "#64748b";
const ACCENT = "#7c5cff";

const selectStyle: React.CSSProperties = {
  background: INSET_BG,
  color: TEXT,
  border: "0.5px solid rgba(255,255,255,0.18)",
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: MUTED,
  marginBottom: 4,
};

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: INSET_BG, borderRadius: 6, padding: "7px 9px" }}>
      <div style={{ fontSize: 10, color: MUTED }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 500, color: "#f8fafc" }}>
        {value}
      </div>
    </div>
  );
}

export default function OpponentDebugApp() {
  const [content, setContent] = useState<QuestContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [completionLevel, setCompletionLevel] = useState(3);
  const [dreamscapeId, setDreamscapeId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadQuestContent(DEFAULT_POOL_VARIANT)
      .then((loaded) => {
        if (!cancelled) setContent(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const generation = useMemo(() => {
    if (content === null) return null;
    return generateOpponent(content, completionLevel, dreamscapeId, nonce);
  }, [content, completionLevel, dreamscapeId, nonce]);

  const dreamscapeOptions = useMemo(() => {
    if (content === null) return [] as DreamscapeContent[];
    return [...content.dreamscapes].sort((a, b) => a.name.localeCompare(b.name));
  }, [content]);

  const midpoint = runMidpointCompletionLevel(DEFAULT_RUN_LAYER_COUNT);

  const deckCards: readonly CardData[] = generation?.build?.distinctCards ?? [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#070d1a",
        color: TEXT,
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        padding: 20,
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#f8fafc" }}>
              Opponent generation
            </div>
            <div style={{ fontSize: 12, color: MUTED }}>
              Simulate the pre-battle opponent build at any run position
            </div>
          </div>
          <div style={{ fontSize: 11, color: FAINT, fontFamily: "monospace" }}>
            pool: {DEFAULT_POOL_VARIANT}
          </div>
        </div>

        {loadError !== null && (
          <div
            style={{
              background: "#3b0d0d",
              border: "0.5px solid rgba(248,113,113,0.5)",
              color: "#fecaca",
              borderRadius: 8,
              padding: 12,
              fontSize: 13,
            }}
          >
            Failed to load quest content: {loadError}
          </div>
        )}

        {content === null && loadError === null && (
          <div style={{ color: MUTED, fontSize: 14, padding: 24 }}>
            Loading card database, dreamcallers, and draft corpus…
          </div>
        )}

        {content !== null && generation !== null && (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-end",
                gap: 12,
                background: PANEL_BG,
                border: BORDER,
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={labelStyle}>Layer / completion level</span>
                <select
                  value={completionLevel}
                  onChange={(e) => {
                    setCompletionLevel(Number(e.target.value));
                  }}
                  style={selectStyle}
                >
                  {Array.from({ length: DEFAULT_RUN_LAYER_COUNT }, (_, i) => i).map(
                    (level) => (
                      <option key={level} value={level}>
                        Layer {level}
                        {level === 0
                          ? " — opening"
                          : level === DEFAULT_RUN_LAYER_COUNT - 1
                            ? " — boss"
                            : level >= midpoint
                              ? " (carries dreamsign)"
                              : ""}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={labelStyle}>Dreamscape (affiliation)</span>
                <select
                  value={dreamscapeId ?? NEUTRAL_DREAMSCAPE}
                  onChange={(e) => {
                    setDreamscapeId(
                      e.target.value === NEUTRAL_DREAMSCAPE
                        ? null
                        : e.target.value,
                    );
                  }}
                  style={{ ...selectStyle, minWidth: 220 }}
                >
                  <option value={NEUTRAL_DREAMSCAPE}>
                    Neutral / starter (no affiliation)
                  </option>
                  {dreamscapeOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.affiliationId == null ? " (neutral)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => {
                  setNonce((n) => n + 1);
                }}
                style={{
                  background: ACCENT,
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ⟳ Refresh
              </button>

              <div
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  color: FAINT,
                  fontFamily: "monospace",
                  alignSelf: "center",
                  lineHeight: 1.6,
                  textAlign: "right",
                }}
              >
                <div>seed {generation.seed}</div>
                <div>poolSeed {generation.poolSeed}</div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "240px 1fr",
                gap: 16,
                alignItems: "start",
              }}
            >
              <div
                style={{
                  background: PANEL_BG,
                  border: BORDER,
                  borderRadius: 8,
                  padding: 14,
                }}
              >
                {generation.dreamcaller === null ? (
                  <div style={{ color: MUTED, fontSize: 13 }}>
                    No dreamcaller catalog available.
                  </div>
                ) : (
                  <>
                    <DreamcallerPortrait
                      dreamcaller={{
                        imageNumber: generation.dreamcaller.imageNumber,
                        name: generation.dreamcaller.name,
                        title: generation.dreamcaller.title,
                      }}
                      variant="panel"
                      style={{ marginBottom: 10 }}
                    />
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: "#f8fafc",
                      }}
                    >
                      {generation.dreamcaller.name}
                    </div>
                    <div
                      style={{ fontSize: 12, color: "#a78bfa", marginBottom: 8 }}
                    >
                      {generation.dreamcaller.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: "#cbd5e1",
                        background: INSET_BG,
                        border: "0.5px solid rgba(255,255,255,0.1)",
                        borderRadius: 6,
                        padding: 8,
                      }}
                    >
                      {generation.dreamcaller.renderedText}
                    </div>
                  </>
                )}

                <div style={{ ...labelStyle, marginTop: 14, marginBottom: 6 }}>
                  Dreamsigns
                </div>
                {generation.dreamsigns.length === 0 ? (
                  <div style={{ fontSize: 12, color: FAINT }}>
                    {generation.carriesDreamsign
                      ? "None available"
                      : `None before layer ${String(midpoint)}`}
                  </div>
                ) : (
                  generation.dreamsigns.map((sign) => (
                    <div
                      key={sign.id}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 8,
                          background: "#1e293b",
                          border: "0.5px solid rgba(255,255,255,0.14)",
                          flexShrink: 0,
                          overflow: "hidden",
                        }}
                      >
                        {sign.imageName != null && (
                          <img
                            src={dreamsignIconUrl(sign.imageName)}
                            alt={sign.name}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: TEXT }}>
                          {sign.name}
                        </div>
                        <div style={{ fontSize: 11, color: MUTED }}>
                          {sign.effectDescription}
                        </div>
                      </div>
                    </div>
                  ))
                )}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    marginTop: 14,
                  }}
                >
                  <StatTile
                    label="Affiliation"
                    value={generation.affiliation?.name ?? "Neutral"}
                  />
                  <StatTile
                    label="Distinct"
                    value={String(
                      generation.build?.distinctCards.length ?? 0,
                    )}
                  />
                  <StatTile
                    label="Coherence"
                    value={
                      generation.build
                        ? generation.build.coherence.score.toFixed(3)
                        : "—"
                    }
                  />
                  <StatTile
                    label="Affil. fit"
                    value={
                      generation.build
                        ? generation.build.affiliationFit.toFixed(3)
                        : "—"
                    }
                  />
                  <StatTile
                    label="Best of"
                    value={String(generation.build?.candidateCount ?? 0)}
                  />
                  <StatTile
                    label="Removed"
                    value={String(generation.build?.removalCount ?? 0)}
                  />
                </div>
              </div>

              <div
                style={{
                  background: PANEL_BG,
                  border: BORDER,
                  borderRadius: 8,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <span
                    style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc" }}
                  >
                    Deck — {deckCards.length} cards
                  </span>
                  <span style={{ fontSize: 11, color: FAINT }}>
                    scroll to browse
                  </span>
                </div>

                {generation.build === null ? (
                  <div style={{ fontSize: 13, color: MUTED, padding: 12 }}>
                    Coherent-draft simulation unavailable (no fit model, draft
                    records, or usable packs). A real battle here would fall back
                    to a sampled draftable deck.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(150px, 1fr))",
                      gap: 12,
                      maxHeight: "calc(100vh - 200px)",
                      overflowY: "auto",
                      paddingRight: 6,
                    }}
                  >
                    {deckCards.map((card, index) => (
                      <CardView
                        key={`${card.id}:${String(index)}`}
                        card={card}
                        suppressHoverHelp
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
