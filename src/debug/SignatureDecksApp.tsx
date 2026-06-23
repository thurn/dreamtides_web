import { useEffect, useMemo, useState } from "react";
import type { CardData } from "../types/cards";
import type { DreamcallerContent } from "../types/content";
import { loadQuestContent, type QuestContent } from "../data/quest-content";
import { DEFAULT_POOL_VARIANT } from "../draft/pool/types";
import { CardView } from "../components/CardView";
import { HoverZoomCard } from "../components/HoverZoomCard";
import {
  DreamcallerPortrait,
  dreamcallerImageSrc,
} from "../components/DreamcallerPortrait";

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
 * signature cards matched.
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

interface SignatureDeck {
  dreamcaller: DreamcallerContent;
  /** Lowercased signature card display names resolved from the UUIDs. */
  signatureNames: { name: string; idf: number; df: number }[];
  /** The winning deck's mainboard, resolved to renderable cards. */
  cards: CardData[];
  matchedNames: string[];
  score: number;
  sourceFile: string;
  seatName: string;
}

/** Build the per-Dreamcaller signature deck assignment from quest content. */
function computeSignatureDecks(content: QuestContent): SignatureDeck[] {
  // `signatureCards` arrives as current card display names (the bundle resolves
  // the TOML UUIDs to names), matching how draft-record mainboards are keyed, so
  // matching is name-on-name. `byName` resolves those names to renderable cards.
  const byName = new Map<string, CardData>();
  for (const card of content.cardDatabase.values()) {
    byName.set(card.name.toLowerCase(), card);
  }

  const records = content.draftRecords ?? [];
  const N = records.length;

  // Per-record lowercased mainboard name sets (deduped) and the raw ordered
  // mainboard, computed once and reused across every Dreamcaller.
  const recordSets = records.map((r) => ({
    record: r,
    nameSet: new Set(r.mainboard.map((n) => n.toLowerCase())),
  }));

  // Document frequency by card name across the corpus.
  const df = new Map<string, number>();
  for (const { nameSet } of recordSets) {
    for (const n of nameSet) df.set(n, (df.get(n) ?? 0) + 1);
  }
  const idf = (name: string) => Math.log(N / (df.get(name) ?? 1));

  // Each deck's L2 norm in IDF-vector space, sqrt(Σ idf² over its distinct
  // cards). Dividing the raw overlap by this norm turns the score into a cosine
  // similarity, which is scale-invariant: a bigger deck has more slots to
  // contain any given signature card, so a raw overlap sum mechanically favours
  // large decks. The norm cancels that out so the score measures correlation,
  // not deck size.
  const deckNorm = new Map<(typeof recordSets)[number]["record"], number>();
  for (const { record, nameSet } of recordSets) {
    let sumSq = 0;
    for (const n of nameSet) sumSq += idf(n) ** 2;
    deckNorm.set(record, Math.sqrt(sumSq) || 1);
  }

  const result: SignatureDeck[] = [];

  for (const dc of content.dreamcallers) {
    const sig = dc.signatureCards ?? [];
    if (sig.length === 0) continue;

    const signatureNames = sig.map((n) => ({
      name: n.toLowerCase(),
      idf: idf(n.toLowerCase()),
      df: df.get(n.toLowerCase()) ?? 0,
    }));

    // Signature-vector norm. Constant across decks for this Dreamcaller, so it
    // does not affect the ranking, but including it makes the reported cosine a
    // true [0, 1] value comparable across Dreamcallers.
    const queryNorm =
      Math.sqrt(signatureNames.reduce((a, s) => a + s.idf ** 2, 0)) || 1;

    let best: {
      record: (typeof recordSets)[number]["record"];
      matched: string[];
      score: number;
    } | null = null;

    for (const { record, nameSet } of recordSets) {
      const matched = signatureNames.filter((s) => nameSet.has(s.name));
      if (matched.length === 0) continue;
      // Cosine similarity between the signature vector and the deck vector:
      // Σ idf over matched cards, normalized by both vectors' norms.
      const dot = matched.reduce((a, s) => a + s.idf, 0);
      const score = dot / ((deckNorm.get(record) ?? 1) * queryNorm);
      if (
        best === null ||
        score > best.score ||
        (score === best.score && matched.length > best.matched.length)
      ) {
        best = { record, matched: matched.map((m) => m.name), score };
      }
    }

    if (best === null) continue;

    const cards = best.record.mainboard
      .map((n) => byName.get(n.toLowerCase()))
      .filter((c): c is CardData => c != null);

    result.push({
      dreamcaller: dc,
      signatureNames,
      cards,
      matchedNames: best.matched,
      score: best.score,
      sourceFile: best.record.sourceFile,
      seatName: best.record.id,
    });
  }

  return result;
}

function titleCase(name: string): string {
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

function DeckSection({ deck }: { deck: SignatureDeck }) {
  const dc = deck.dreamcaller;
  const matched = new Set(deck.matchedNames);
  return (
    <section
      style={{
        background: PANEL_BG,
        border: BORDER,
        borderRadius: 10,
        padding: 16,
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "center",
          marginBottom: 14,
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
            {deck.cards.length}-card mainboard · matched{" "}
            {deck.matchedNames.length}/{deck.signatureNames.length} signature
            cards · cosine {deck.score.toFixed(3)}
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            color: FAINT,
            fontFamily: "monospace",
            textAlign: "right",
            maxWidth: 260,
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
        {deck.signatureNames.map((s) => {
          const hit = matched.has(s.name);
          return (
            <span
              key={s.name}
              title={`in ${String(s.df)} decks · idf ${s.idf.toFixed(2)}`}
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
              {titleCase(s.name)}
            </span>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))",
          gap: 12,
        }}
      >
        {deck.cards.map((card, index) => (
          // Same hover behaviour as the /opponent deck viewer: hovering a tile
          // grows the card in place (portaled above the grid) until its rules
          // text is legible, with glossary definitions shown alongside.
          <HoverZoomCard
            key={`${card.id}:${String(index)}`}
            logSurface="sigdecks"
            glossaryText={card.renderedText}
          >
            <CardView card={card} suppressHoverHelp />
          </HoverZoomCard>
        ))}
      </div>
    </section>
  );
}

export default function SignatureDecksApp() {
  const [content, setContent] = useState<QuestContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const decks = useMemo(
    () => (content === null ? [] : computeSignatureDecks(content)),
    [content],
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT,
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        padding: 20,
        boxSizing: "border-box",
      }}
    >
      {/* Preload portrait art so the thumbnails do not pop in one by one. */}
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#f8fafc" }}>
            Signature decks
          </div>
          <div style={{ fontSize: 12, color: MUTED }}>
            The real draft deck most strongly correlated with each
            signature-carrying Dreamcaller (IDF cosine similarity, normalized
            for deck size). Hover any card to enlarge it.
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
          <DeckSection key={deck.dreamcaller.id} deck={deck} />
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
    </div>
  );
}
