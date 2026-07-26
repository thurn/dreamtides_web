import { useEffect, useMemo, useState } from "react";
import type { CardData } from "../types/cards";
import type {
  AffiliationContent,
  DreamAvatarContent,
  DreamscapeContent,
  DreamsignTemplate,
} from "../types/content";
import { loadQuestContent, type QuestContent } from "../data/quest-content";
import {
  buildOpponentDreamsigns,
  DEFAULT_RUN_LAYER_COUNT,
  opponentCarriesDreamsign,
  runMidpointCompletionLevel,
  selectOpponentDreamAvatar,
} from "../battle/integration/opponent-deck";
import { createBattleRngStreams, deriveBattleSeed } from "../battle/random";
import { logEvent } from "../logging";
import { DEFAULT_POOL_VARIANT } from "../draft/pool/types";
import { CardView } from "../cumulus/components/card/CardView";
import { DreamAvatarPortrait } from "../cumulus/components/hud/DreamAvatarPortrait";
import { dreamsignIconUrl } from "../cumulus/components/atlas/atlas-display";
import {
  getAlgorithm,
  OPPONENT_ALGORITHMS,
} from "./opponent-algorithms";
import {
  normalizeOpponentDebugAlgo,
  opponentDebugSearch,
  opponentGenerationId,
  parseOpponentDebugParams,
} from "./opponent-debug-url";

/**
 * `/opponent` debugging tool. Simulates the pre-battle opponent build the
 * battle integration produces, so a designer can inspect — for any run position
 * and dreamscape — which DreamAvatar, dreamsigns, and deck the generator yields,
 * and re-roll the same parameters to study the spread.
 *
 * The opponent is built by replaying the exact primitives `createBattleInit`
 * uses ({@link selectOpponentDreamAvatar}, {@link buildOpponentDreamsigns}) to
 * derive the run context, then routing the deck through a selected algorithm
 * (see `opponent-algorithms.tsx`), so what the tool shows matches what a real
 * battle at the same position would generate for a given seed. "Refresh"
 * advances a nonce that changes the battle seed, re-rolling a fresh generation
 * under the same layer / dreamscape parameters. The `?algo=` param selects the
 * opponent-deck algorithm (coherent or corpus).
 */

/** The fixed enemy-pool sub-seed derivation `createBattleInit` applies to the
 * battle seed (mirrors its private `deriveEnemyPoolSeed`). */
function deriveEnemyPoolSeed(seed: number): number {
  return (seed ^ 0x5f3759df) >>> 0;
}

interface OpponentGeneration {
  /** The shareable id for this generation; identical to the logged battleEntryKey. */
  generationId: string;
  /** Byte-for-byte the logged battleEntryKey (== {@link generationId}); the
   * coherent algorithm passes it to `logOpponentDeckConstructed`. */
  battleEntryKey: string;
  dreamAvatar: DreamAvatarContent | null;
  dreamsigns: DreamsignTemplate[];
  affiliation: AffiliationContent | null;
  dreamscape: DreamscapeContent | null;
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
  algo: string,
): OpponentGeneration {
  const layerCount = DEFAULT_RUN_LAYER_COUNT;
  // The generation id IS the logged battleEntryKey, so the id a user shares
  // (in the URL or verbally) greps the `opponent_deck_constructed` log directly.
  // The id identifies the seeded generation; the algo (also carried in the URL)
  // determines which DreamAvatar roster the seed draws from, so reproducing a
  // share requires both the id and the `?algo=` value.
  const battleEntryKey = opponentGenerationId({
    completionLevel,
    dreamscapeId,
    nonce,
    algo: "coherent",
  });
  const seed = deriveBattleSeed(`opponent-debug-seed:${battleEntryKey}`);
  const streams = createBattleRngStreams(seed);

  const dreamscape =
    dreamscapeId === null
      ? null
      : content.dreamscapes.find((d) => d.id === dreamscapeId) ?? null;

  // The corpus algorithm fields the dreamscape's RESIDENT DreamAvatars (and the
  // known-good decks associated with them); other algorithms draw from the full
  // roster. The starter / neutral dreamscape has no residents, so the list is
  // empty and no restriction applies. `nextInt` consumes exactly one RNG draw
  // regardless of the pool size, so narrowing the pool leaves the subsequent
  // dreamsign draw stable.
  const eligibleDreamAvatarIds =
    algo === "corpus" ? dreamscape?.dreamAvatarIds ?? null : null;

  // Mirror createBattleInit's order of RNG consumption on the enemyDescriptor
  // stream: select the opponent DreamAvatar first, then its dreamsigns.
  const dreamAvatar = selectOpponentDreamAvatar(
    content.dreamAvatars,
    null,
    streams.enemyDescriptor,
    eligibleDreamAvatarIds,
  );
  const dreamsigns = buildOpponentDreamsigns(
    completionLevel,
    layerCount,
    content.dreamsignTemplates,
    streams.enemyDescriptor,
  );

  if (algo === "corpus") {
    // Reconstruction record for the dreamscape-restricted DreamAvatar pick: the
    // resident pool the seed drew from and the DreamAvatar it landed on, so a
    // corpus generation can be replayed from `logs/quest-log.jsonl`.
    logEvent("corpus_opponent_dream_avatar_selected", {
      battleEntryKey,
      dreamscapeId,
      completionLevel,
      restrictedToDreamscapeResidents:
        eligibleDreamAvatarIds != null && eligibleDreamAvatarIds.length > 0,
      eligibleDreamAvatarIds: eligibleDreamAvatarIds ?? [],
      selectedDreamAvatarId: dreamAvatar?.id ?? null,
      selectedDreamAvatarName: dreamAvatar?.name ?? null,
    });
  }

  const affiliation =
    dreamscape?.affiliationId == null
      ? null
      : content.affiliations.find((a) => a.id === dreamscape.affiliationId) ??
        null;

  const poolSeed = deriveEnemyPoolSeed(seed);

  // The deck build + reconstruction logging is owned by the selected algorithm
  // (see `opponent-algorithms.tsx`); `generateOpponent` produces only the run
  // CONTEXT both algorithms consume.
  return {
    generationId: battleEntryKey,
    battleEntryKey,
    dreamAvatar,
    dreamsigns,
    affiliation,
    dreamscape,
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
  // The URL query is the source of truth for the generation parameters, so any
  // generation is shareable and reproducible: load `/opponent?gen=<id>` (or the
  // discrete `?layer=&dreamscape=&n=` form) to reconstruct exactly what someone
  // else saw.
  const initialParams = parseOpponentDebugParams(window.location.search);
  const [content, setContent] = useState<QuestContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [completionLevel, setCompletionLevel] = useState(
    initialParams.completionLevel,
  );
  const [dreamscapeId, setDreamscapeId] = useState<string | null>(
    initialParams.dreamscapeId,
  );
  const [nonce, setNonce] = useState(initialParams.nonce);
  const [algoId, setAlgoId] = useState(initialParams.algo);
  const [copied, setCopied] = useState(false);

  // Keep the address bar in sync with the current parameters (no history spam:
  // replaceState, not pushState) so the URL is always a shareable debug link.
  useEffect(() => {
    const search = opponentDebugSearch({
      completionLevel,
      dreamscapeId,
      nonce,
      algo: algoId,
    });
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search}`,
    );
  }, [completionLevel, dreamscapeId, nonce, algoId]);

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

  // A dreamscape id from the URL might not exist in the loaded catalog (stale
  // link, typo). Once content is in hand, drop an unknown id back to neutral so
  // the selector and the shareable URL stay consistent with what was generated.
  useEffect(() => {
    if (content === null || dreamscapeId === null) return;
    if (!content.dreamscapes.some((d) => d.id === dreamscapeId)) {
      setDreamscapeId(null);
    }
  }, [content, dreamscapeId]);

  const generation = useMemo(() => {
    if (content === null) return null;
    return generateOpponent(
      content,
      completionLevel,
      dreamscapeId,
      nonce,
      algoId,
    );
  }, [content, completionLevel, dreamscapeId, nonce, algoId]);

  // The selected algorithm turns the run context into the rendered view (deck,
  // stat tiles, dreamsign labels, ability, provenance). Re-runs when the algo
  // changes; this is where the deck build + reconstruction logging happen.
  const view = useMemo(() => {
    if (content === null || generation === null) return null;
    return getAlgorithm(algoId).build(content, {
      opponentDreamAvatar: generation.dreamAvatar,
      affiliation: generation.affiliation,
      completionLevel: generation.completionLevel,
      layerCount: generation.layerCount,
      poolSeed: generation.poolSeed,
      dreamsigns: generation.dreamsigns,
      battleEntryKey: generation.battleEntryKey,
    });
  }, [content, generation, algoId]);

  const copyGenerationId = (id: string) => {
    const done = () => {
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    };
    void navigator.clipboard?.writeText(id).then(done, done);
  };

  const dreamscapeOptions = useMemo(() => {
    if (content === null) return [] as DreamscapeContent[];
    return [...content.dreamscapes].sort((a, b) => a.name.localeCompare(b.name));
  }, [content]);

  const midpoint = runMidpointCompletionLevel(DEFAULT_RUN_LAYER_COUNT);

  const deckCards: readonly CardData[] = view?.deckCards ?? [];

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
            Loading card database, avatars, and draft corpus…
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

              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={labelStyle}>Algorithm</span>
                <select
                  value={algoId}
                  onChange={(e) => {
                    setAlgoId(normalizeOpponentDebugAlgo(e.target.value));
                  }}
                  style={selectStyle}
                >
                  {OPPONENT_ALGORITHMS.map((algorithm) => (
                    <option key={algorithm.id} value={algorithm.id}>
                      {algorithm.label}
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
                  alignSelf: "stretch",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  minWidth: 280,
                }}
              >
                <span style={labelStyle}>Generation ID (shareable / logged)</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <code
                    title="Identical to the battleEntryKey in the opponent_deck_constructed log entry"
                    style={{
                      flex: 1,
                      background: INSET_BG,
                      border: "0.5px solid rgba(255,255,255,0.18)",
                      borderRadius: 6,
                      padding: "7px 9px",
                      fontSize: 12,
                      fontFamily: "monospace",
                      color: "#cbd5e1",
                      overflowX: "auto",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {generation.generationId}
                  </code>
                  <button
                    onClick={() => {
                      copyGenerationId(generation.generationId);
                    }}
                    title="Copy generation ID"
                    style={{
                      background: INSET_BG,
                      color: TEXT,
                      border: "0.5px solid rgba(255,255,255,0.18)",
                      borderRadius: 6,
                      padding: "7px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: FAINT,
                    fontFamily: "monospace",
                    textAlign: "right",
                  }}
                >
                  seed {generation.seed} · poolSeed {generation.poolSeed}
                </div>
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
                {generation.dreamAvatar === null ? (
                  <div style={{ color: MUTED, fontSize: 13 }}>
                    No avatar catalog available.
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <DreamAvatarPortrait
                        dreamAvatar={{
                          imageNumber: generation.dreamAvatar.imageNumber,
                          name: generation.dreamAvatar.name,
                          title: generation.dreamAvatar.title,
                        }}
                        variant="panel"
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: "#f8fafc",
                      }}
                    >
                      {generation.dreamAvatar.name}
                    </div>
                    <div
                      style={{ fontSize: 12, color: "#a78bfa", marginBottom: 8 }}
                    >
                      {generation.dreamAvatar.title}
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
                      {generation.dreamAvatar.renderedText}
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
                  {(view?.statRows ?? []).map((row) => (
                    <StatTile
                      key={row.label}
                      label={row.label}
                      value={row.value}
                    />
                  ))}
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

                {view === null || view.unavailable === true ? (
                  <div style={{ fontSize: 13, color: MUTED, padding: 12 }}>
                    {algoId === "corpus"
                      ? "Corpus opponent deck unavailable (no known-good decklists in the corpus)."
                      : "Coherent-draft simulation unavailable (no fit model, draft records, or usable packs). A real battle here would fall back to a sampled draftable deck."}
                  </div>
                ) : (
                  <>
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
                        <CardView key={`${card.id}:${String(index)}`} card={card} />
                      ))}
                    </div>
                    {view.provenance}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
