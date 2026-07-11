import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { CardData } from "../types/cards";
import type { DreamcallerContent } from "../types/content";
import { loadQuestContent, type QuestContent } from "../data/quest-content";
import { DEFAULT_POOL_VARIANT } from "../draft/pool/types";
import { GameCard } from "../tango/components/card/CardView";
import {
  DreamcallerPortrait,
  dreamcallerImageSrc,
} from "../tango/components/hud/DreamcallerPortrait";
import { HoverPopover } from "../tango/components/overlay/HoverPopover";
import { DreamcallerPopover } from "../components/DreamcallerPopover";
import { extractGlossaryTerms } from "../data/glossary-terms";
import { GlossaryDefinitionCard } from "../tango/components/card/GlossaryDefinitionCard";
import { INFO_CARD_WIDTH } from "../tango/components/overlay/InfoCard";
import { logEvent } from "../logging";
import { buildIdfStats, signatureFit } from "../draft/idf-fit.ts";
import { idfCosine } from "../draft/pool/variant-idf.ts";

/**
 * `/sigdecks` — a temporary visualization tool. For each Dreamcaller that
 * carries `signature-cards` (see `data/tabula/dreamcallers_v2.toml`), it finds
 * the single real draft deck in the adapted draft corpus
 * (`docs/draft_records_adapted`, bundled as `/draft-records-data.json`) most
 * strongly correlated with that Dreamcaller and renders the whole mainboard.
 *
 * Correlation metric: IDF cosine similarity. Each card is weighted by its
 * inverse document frequency `ln(N / df)` (`df` = number of corpus mainboards
 * containing it), so sharing a *rare* signature card weighs more than sharing a
 * common one (the same idea `idf3` pool steering uses). The score is the cosine
 * between the signature vector and the deck vector — the IDF overlap normalized
 * by both vectors' norms. Normalizing by the deck norm is what keeps the metric
 * scale-invariant: a raw overlap sum favours large decks (more slots to contain
 * any given signature card), whereas the cosine measures correlation, not size.
 * The deck with the highest cosine wins; ties break toward more distinct
 * signature cards matched. Mainboards larger than 28 cards are excluded
 * entirely — those are sprawling draft piles rather than focused decks, and
 * they correlate with a Dreamcaller only by holding more of everything.
 *
 * Two selection modes, toggled in the header and mirrored to `?mode=`:
 * `match` (default) picks the single closest deck to the signature, while
 * `typical` picks the most representative deck among those that fit — the one
 * most central to the cluster of signature-fitting decks. See
 * {@link SelectionMode}.
 *
 * Everything is derived live in the browser from the same quest content the
 * battle integration loads, so the result tracks the current card names and
 * the current signature lists with no precomputed artifact to go stale.
 */

const BG = "#070d1a";
const PANEL_BG = "#111a2e";
const INSET_BG = "#0b1220";
const BORDER = "0.5px solid rgba(255,255,255,0.12)";
const TEXT = "#e2e8f0";
const MUTED = "#94a3b8";
const FAINT = "#64748b";
const ACCENT = "#a78bfa";

/** Viewport width (px) at or below which the layout switches to its compact
 * mobile form: a fixed 3-column card grid plus long-press preview. */
const MOBILE_MAX_WIDTH_PX = 640;

/** Fixed number of card columns in the compact mobile grid. */
const MOBILE_GRID_COLUMNS = 3;

/** Press duration (ms) that promotes a touch to a card preview. */
const LONG_PRESS_MS = 350;

/** Touch travel (px) past which a press is treated as a scroll, not a hold. */
const LONG_PRESS_MOVE_TOLERANCE_PX = 12;

interface Viewport {
  /** True on a narrow viewport — drives the 3-column compact grid. */
  isMobile: boolean;
  /** True when the primary pointer is coarse (touch), so long-press preview is on. */
  isTouch: boolean;
}

/**
 * Tracks whether the layout should use its compact mobile form and whether the
 * device is touch-primary. Recomputes on resize and on changes to the
 * `(pointer: coarse)` media query.
 */
function useViewport(): Viewport {
  const read = (): Viewport => {
    if (typeof window === "undefined") {
      return { isMobile: false, isTouch: false };
    }
    return {
      isMobile: window.innerWidth <= MOBILE_MAX_WIDTH_PX,
      isTouch: window.matchMedia("(pointer: coarse)").matches,
    };
  };
  const [viewport, setViewport] = useState<Viewport>(read);
  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const update = () => {
      setViewport(read());
    };
    window.addEventListener("resize", update);
    const coarse = window.matchMedia("(pointer: coarse)");
    coarse.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      coarse.removeEventListener("change", update);
    };
  }, []);
  return viewport;
}

/**
 * How the winning deck is chosen:
 * - `match`: the single deck with the highest cosine similarity to the
 *   signature vector. A pointwise nearest-neighbour to the query; it can land
 *   on an idiosyncratic outlier that happens to align with the signature.
 * - `typical`: among the decks that fit the signature, the most central /
 *   representative one — the deck with the highest fit-weighted similarity to
 *   the other signature-fitting decks. Rewards "the common way this signature
 *   gets built" and is robust to one-off outliers, at the cost of some literal
 *   fit.
 */
export type SelectionMode = "match" | "typical";

const SELECTION_MODES: SelectionMode[] = ["match", "typical"];

/** Deck–deck cosine at or above this counts as "similar" for the neighbour
 * count surfaced in the UI. */
const SIMILAR_THRESHOLD = 0.45;

interface SignatureCard {
  /** Stable cards_v2 UUID (lowercased). */
  id: string;
  /** Current display name, resolved from the id. */
  name: string;
  idf: number;
  df: number;
}

export interface SignatureDeck {
  dreamcaller: DreamcallerContent;
  signatureCards: SignatureCard[];
  /** The winning deck's mainboard, resolved to renderable cards. */
  cards: CardData[];
  /** UUIDs of the signature cards the chosen deck contains. */
  matchedIds: Set<string>;
  /** Cosine similarity between the signature vector and the chosen deck. */
  cosine: number;
  /** How many other pool decks are similar (deck–deck cosine ≥ threshold). */
  neighbors: number;
  sourceFile: string;
  seatName: string;
}

/**
 * Build the per-Dreamcaller signature deck assignment from quest content.
 *
 * Everything keys on stable cards_v2 UUIDs, never display names: 24 cards share
 * a name with another distinct card, so name matching would conflate them (and
 * render the wrong card). The draft records carry `mainboardIds` and the
 * Dreamcallers carry `signatureCardIds` for exactly this reason.
 */
export function computeSignatureDecks(
  content: QuestContent,
  mode: SelectionMode,
): SignatureDeck[] {
  // Resolve a UUID to its card record (for rendering and signature names).
  const byId = new Map<string, CardData>();
  for (const card of content.cardDatabase.values()) {
    byId.set(card.id.toLowerCase(), card);
  }

  // Oversized mainboards (large draft piles rather than focused decks) are
  // excluded from consideration: a deck with many cards correlates with a
  // Dreamcaller only by virtue of holding more of everything, which makes it a
  // weird outlier as a "signature deck". Keep only decks at or below this size.
  const MAX_DECK_SIZE = 28;
  const records = (content.draftRecords ?? []).filter(
    (r) => r.mainboardIds.length <= MAX_DECK_SIZE,
  );

  // Per-record deduped mainboard UUID sets, computed once and reused across
  // every Dreamcaller.
  const recordSets = records.map((r) => ({
    record: r,
    idSet: new Set(r.mainboardIds.map((id) => id.toLowerCase())),
  }));

  // Build the IDF corpus once from all filtered record sets.  corpus.decks[i]
  // corresponds to recordSets[i] BY INDEX so they stay zipped.
  // buildIdfStats populates corpus.df (document frequency) so we don't
  // need a separate pass.
  const corpus = buildIdfStats(recordSets.map((r) => r.idSet));
  const idfOf = (id: string): number => corpus.idf.get(id) ?? 0;

  // Display helper: a signature card absent from every corpus deck has df=0
  // and no entry in corpus.idf, but its "ideal" idf weight is ln(N/1)=ln(N)
  // (it would be maximally rare). Show that ceiling rather than 0 so the
  // tooltip conveys that the card is simply not in the corpus.
  const N = corpus.decks.length;
  const idfForDisplay = (id: string): number =>
    corpus.idf.get(id) ?? Math.log(N || 1);

  const result: SignatureDeck[] = [];

  for (const dc of content.dreamcallers) {
    const sigIds = (dc.signatureCardIds ?? []).map((id) => id.toLowerCase());
    if (sigIds.length === 0) continue;

    const signatureCards: SignatureCard[] = sigIds.map((id) => ({
      id,
      name: byId.get(id)?.name ?? id,
      idf: idfForDisplay(id),
      df: corpus.df?.get(id) ?? 0,
    }));

    // Candidate decks: every deck containing at least one signature card, with
    // its cosine fit to the signature vector (via shared signatureFit).
    const sigIdSet = new Set(sigIds);
    const candidates = [];
    for (let i = 0; i < recordSets.length; i++) {
      const { record, idSet } = recordSets[i];
      const matched = sigIds.filter((id) => idSet.has(id));
      if (matched.length === 0) continue;
      const fit = signatureFit(sigIdSet, corpus.decks[i], corpus);
      candidates.push({
        record,
        idSet,
        deckIdx: i,
        matchedIds: new Set(matched),
        fit,
      });
    }
    if (candidates.length === 0) continue;

    let best = candidates[0];
    if (mode === "match") {
      // Highest cosine fit to the signature; ties → more distinct matches.
      for (const c of candidates) {
        if (
          c.fit > best.fit ||
          (c.fit === best.fit && c.matchedIds.size > best.matchedIds.size)
        ) {
          best = c;
        }
      }
    } else {
      // Most representative: maximize fit-weighted similarity to the other
      // signature-fitting decks (centrality of the fitting region). Ties → the
      // candidate with the higher raw fit.
      let bestScore = -Infinity;
      for (const x of candidates) {
        let centrality = 0;
        for (const y of candidates) {
          centrality += y.fit * idfCosine(corpus.decks[x.deckIdx], corpus.decks[y.deckIdx], idfOf);
        }
        if (centrality > bestScore || (centrality === bestScore && x.fit > best.fit)) {
          bestScore = centrality;
          best = x;
        }
      }
    }

    // Count how many other pool decks are similar to the chosen deck via
    // deck–deck idf cosine.
    let neighbors = 0;
    for (let i = 0; i < recordSets.length; i++) {
      if (recordSets[i].idSet === best.idSet) continue;
      if (idfCosine(corpus.decks[best.deckIdx], corpus.decks[i], idfOf) >= SIMILAR_THRESHOLD) {
        neighbors++;
      }
    }

    const cards = best.record.mainboardIds
      .map((id) => byId.get(id.toLowerCase()))
      .filter((c): c is CardData => c != null);

    result.push({
      dreamcaller: dc,
      signatureCards,
      cards,
      matchedIds: best.matchedIds,
      cosine: best.fit,
      neighbors,
      sourceFile: best.record.sourceFile,
      seatName: best.record.id,
    });
  }

  return result;
}

/**
 * Wraps a card tile so that a touch long-press fires `onLongPress` (used to
 * open the fullscreen preview). Only touch pointers arm the hold; mouse and pen
 * fall through untouched. The hold is cancelled if the finger travels far
 * enough to read as a scroll, so dragging the page never opens a preview.
 */
function LongPressCard({
  onLongPress,
  children,
}: {
  onLongPress: () => void;
  children: ReactNode;
}) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  return (
    <div
      onPointerDown={(event) => {
        if (event.pointerType !== "touch") {
          return;
        }
        origin.current = { x: event.clientX, y: event.clientY };
        clear();
        timer.current = window.setTimeout(() => {
          timer.current = null;
          origin.current = null;
          onLongPress();
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(event) => {
        const start = origin.current;
        if (start === null || timer.current === null) {
          return;
        }
        if (
          Math.abs(event.clientX - start.x) > LONG_PRESS_MOVE_TOLERANCE_PX ||
          Math.abs(event.clientY - start.y) > LONG_PRESS_MOVE_TOLERANCE_PX
        ) {
          clear();
        }
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
      onContextMenu={(event) => {
        // Suppress the iOS/Android long-press callout so the preview is the
        // only thing the hold produces.
        event.preventDefault();
      }}
      style={{
        touchAction: "pan-y",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Fullscreen card preview shown after a long-press on touch. Renders the card
 * at a comfortably legible width with its glossary definitions stacked beneath,
 * over a dimming backdrop. Tapping anywhere or pressing Escape dismisses it.
 */
function CardLightbox({
  card,
  onClose,
}: {
  card: CardData;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const terms = extractGlossaryTerms(card.renderedText ?? "");

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onPointerDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(3, 7, 18, 0.88)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: 16,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div style={{ width: "min(86vw, 360px)", flexShrink: 0 }}>
        <GameCard model={{ cardId: card.id, displaySnapshot: card }} large />
      </div>
      {terms.length > 0 && (
        <div
          style={{
            width: `min(86vw, ${String(INFO_CARD_WIDTH)}px)`,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {terms.map((entry) => (
            <GlossaryDefinitionCard key={entry.term} entry={entry} />
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, color: MUTED, paddingBottom: 8 }}>
        Tap anywhere to close
      </div>
    </div>,
    document.body,
  );
}

function DeckSection({
  deck,
  viewport,
  onPreview,
}: {
  deck: SignatureDeck;
  viewport: Viewport;
  onPreview: (card: CardData) => void;
}) {
  const dc = deck.dreamcaller;
  const matched = deck.matchedIds;
  const { isMobile } = viewport;
  return (
    <section
      style={{
        background: PANEL_BG,
        border: BORDER,
        borderRadius: 10,
        padding: isMobile ? 10 : 16,
        marginBottom: isMobile ? 14 : 20,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: isMobile ? "wrap" : "nowrap",
          gap: 14,
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        {/* Hovering the portrait or the name/title reveals a card showing the
            Dreamcaller's ability. The popover self-sizes (280px), so the
            max-width cap is disabled; it portals to the body and is
            viewport-aware. */}
        <div style={{ flex: 1, minWidth: 0 }}>
        <HoverPopover
          triggerAs="div"
          placement="top"
          delayMs={200}
          maxWidthPx={null}
          content={<DreamcallerPopover dreamcaller={dc} />}
        >
          <div
            style={{
              display: "flex",
              gap: 14,
              alignItems: "center",
              minWidth: 0,
              cursor: "help",
            }}
          >
          <div style={{ width: 64, height: 64, flexShrink: 0 }}>
            <DreamcallerPortrait
              dreamcaller={{
                imageNumber: dc.imageNumber,
                name: dc.name,
                title: dc.title,
              }}
              variant="thumb"
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 600, color: "#f8fafc" }}>
              {dc.name}
            </div>
            <div style={{ fontSize: 13, color: ACCENT, marginBottom: 4 }}>
              {dc.title}
            </div>
            <div style={{ fontSize: 12, color: MUTED }}>
              {deck.cards.length}-card mainboard · matched {matched.size}/
              {deck.signatureCards.length} signature cards · cosine{" "}
              {deck.cosine.toFixed(3)} · {deck.neighbors} similar
              {deck.neighbors === 1 ? " deck" : " decks"} in pool
            </div>
          </div>
          </div>
        </HoverPopover>
        </div>
        <div
          style={{
            fontSize: 10,
            color: FAINT,
            fontFamily: "monospace",
            textAlign: isMobile ? "left" : "right",
            maxWidth: isMobile ? "100%" : 260,
            width: isMobile ? "100%" : undefined,
            wordBreak: "break-all",
          }}
        >
          {deck.sourceFile}
          <div>seat {deck.seatName}</div>
        </div>
      </div>

      {/* Signature card chips: which of this Dreamcaller's signature cards the
          chosen deck actually contains (filled) versus missed (faint). */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 14,
        }}
      >
        {deck.signatureCards.map((s) => {
          const hit = matched.has(s.id);
          return (
            <span
              key={s.id}
              title={`${s.id} · in ${String(s.df)} decks · idf ${s.idf.toFixed(2)}`}
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 999,
                border: hit
                  ? "0.5px solid rgba(167,139,250,0.6)"
                  : "0.5px solid rgba(255,255,255,0.12)",
                background: hit ? "rgba(124,92,255,0.18)" : INSET_BG,
                color: hit ? "#ddd6fe" : FAINT,
              }}
            >
              {hit ? "★ " : "○ "}
              {s.name}
            </span>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? `repeat(${String(MOBILE_GRID_COLUMNS)}, 1fr)`
            : "repeat(auto-fill, minmax(198px, 1fr))",
          gap: isMobile ? 6 : 12,
        }}
      >
        {deck.cards.map((card, index) => (
          <LongPressCard
            key={`${card.id}:${String(index)}`}
            onLongPress={() => {
              onPreview(card);
            }}
          >
            <GameCard model={{ cardId: card.id, displaySnapshot: card }} />
          </LongPressCard>
        ))}
      </div>
    </section>
  );
}

function parseMode(search: string): SelectionMode {
  const raw = new URLSearchParams(search).get("mode");
  return raw === "typical" ? "typical" : "match";
}

export default function SignatureDecksApp() {
  const [content, setContent] = useState<QuestContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<SelectionMode>(() =>
    parseMode(window.location.search),
  );
  const viewport = useViewport();
  const [preview, setPreview] = useState<CardData | null>(null);

  const openPreview = useCallback((card: CardData) => {
    setPreview(card);
    logEvent("card_long_press_preview", {
      surface: "sigdecks",
      cardId: card.id,
    });
  }, []);

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

  // Keep the address bar in sync so the chosen mode is a shareable link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (mode === "match") params.delete("mode");
    else params.set("mode", mode);
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, [mode]);

  const decks = useMemo(
    () => (content === null ? [] : computeSignatureDecks(content, mode)),
    [content, mode],
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT,
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        padding: viewport.isMobile ? 12 : 20,
        boxSizing: "border-box",
      }}
    >
      {/* Preload portrait art so the thumbnails do not pop in one by one. */}
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#f8fafc" }}>
              Signature decks
            </div>
            <div style={{ fontSize: 12, color: MUTED }}>
              {mode === "match"
                ? "The single draft deck most strongly correlated with each signature-carrying Dreamcaller (IDF cosine similarity; decks over 28 cards excluded)."
                : "The most typical / representative draft deck for each signature-carrying Dreamcaller — the deck most central to the cluster of signature-fitting decks, rather than the single closest match."}{" "}
              {viewport.isTouch
                ? "Long-press a card to enlarge it."
                : "Hover a card to enlarge it, or a Dreamcaller for its ability."}
            </div>
          </div>

          {/* Selection-mode toggle, mirrored to ?mode= in the URL. */}
          <div
            style={{
              display: "flex",
              flexShrink: 0,
              background: INSET_BG,
              border: BORDER,
              borderRadius: 8,
              padding: 3,
              gap: 3,
            }}
          >
            {SELECTION_MODES.map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                  }}
                  title={
                    m === "match"
                      ? "Closest single deck to the signature"
                      : "Most representative deck among those that fit the signature"
                  }
                  style={{
                    background: active ? ACCENT : "transparent",
                    color: active ? "#0b1020" : MUTED,
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {m === "match" ? "Best match" : "Most typical"}
                </button>
              );
            })}
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

        {content !== null && decks.length === 0 && loadError === null && (
          <div style={{ color: MUTED, fontSize: 14, padding: 24 }}>
            No signature-carrying Dreamcallers found, or the draft corpus is
            unavailable.
          </div>
        )}

        {decks.map((deck) => (
          <DeckSection
            key={deck.dreamcaller.id}
            deck={deck}
            viewport={viewport}
            onPreview={openPreview}
          />
        ))}

        {/* hidden preloads */}
        <div style={{ display: "none" }}>
          {decks.map((d) => (
            <img
              key={d.dreamcaller.id}
              src={dreamcallerImageSrc(d.dreamcaller.imageNumber)}
              alt=""
            />
          ))}
        </div>
      </div>

      {preview !== null && (
        <CardLightbox
          card={preview}
          onClose={() => {
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}
