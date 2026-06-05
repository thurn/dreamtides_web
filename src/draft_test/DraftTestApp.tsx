import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CardDisplay } from "../components/CardDisplay";
import { CardOverlay } from "../components/CardOverlay";
import { PipBadge } from "../components/PipBadge";
import {
  OFFERING_ACCENT,
  OfferingAcceptButton,
  OfferingScreenHeader,
} from "../components/OfferingScreen";
import { cardImageUrl } from "../data/card-database";
import { CARD_ASPECT_RATIO } from "../components/card-aspect";
import { DRAFT_OFFER_CARD_WIDTH } from "../components/card-size";
import { drawAndSpendUniqueCards } from "../draft/draft-engine";
import type { DraftState } from "../types/draft";
import type { CardData } from "../types/cards";
import {
  buildPoolData,
  generatePoolFromData,
  POOL_VARIANT_IDS,
  resolvePoolVariant,
} from "../draft/pool";
import type { GeneratedPool, PoolData, PoolVariant } from "../draft/pool";
import {
  buildNameIndex,
  loadCardsV2Database,
  loadDecklists,
  loadMergedArchetypeLists,
  resolvePool,
} from "../data/cards-v2-database";
import { loadDreamcallersV2 } from "../data/dreamcallers-v2-database";
import type { DraftDreamcaller } from "../data/dreamcallers-v2-database";
import { DraftDreamcallerSelect } from "./DraftDreamcallerSelect";

const OFFER_SIZE = 4;
const DECK_ROW_HEIGHT_PX = 36;
const DECK_ROW_ART_FOCAL_Y = "25%";

const DRAFT_OFFER_CARD_STYLE = {
  "--draft-offer-card-width": DRAFT_OFFER_CARD_WIDTH,
  aspectRatio: CARD_ASPECT_RATIO,
} as CSSProperties & Record<"--draft-offer-card-width", string>;

/** Strip the `A:`/`D:` source tag and title-case a theme label for display. */
function prettyTheme(theme: string): string {
  const body = theme.replace(/^[AD]:/u, "");
  return body
    .replace(/-/g, " ")
    .replace(/\b\w/gu, (c) => c.toUpperCase());
}

function sortCardsByCost(cards: CardData[]): CardData[] {
  return [...cards].sort((a, b) => {
    const delta = (a.energyCost ?? 0) - (b.energyCost ?? 0);
    if (delta !== 0) return delta;
    return a.name.localeCompare(b.name);
  });
}

/** One row per unique drafted card, with its copy count. */
interface DeckRow {
  card: CardData;
  count: number;
}

function buildDeckRows(
  deck: number[],
  database: Map<number, CardData>,
): DeckRow[] {
  const byNumber = new Map<number, DeckRow>();
  for (const cardNumber of deck) {
    const card = database.get(cardNumber);
    if (!card) continue;
    const existing = byNumber.get(cardNumber);
    if (existing) {
      existing.count += 1;
    } else {
      byNumber.set(cardNumber, { card, count: 1 });
    }
  }
  return [...byNumber.values()].sort((left, right) => {
    const delta = (left.card.energyCost ?? 0) - (right.card.energyCost ?? 0);
    if (delta !== 0) return delta;
    return left.card.name.localeCompare(right.card.name);
  });
}

/** Hearthstone-style deck rail row showing art, cost, name, and count. */
function DeckRowItem({ card, count }: DeckRow) {
  const accentColor = card.cardType === "Event" ? "#c084fc" : "#facc15";
  return (
    <div
      className="relative flex items-center gap-2 overflow-hidden rounded-md px-2"
      style={{
        height: `${String(DECK_ROW_HEIGHT_PX)}px`,
        backgroundImage: `linear-gradient(90deg, rgba(10, 6, 18, 0.85) 0%, rgba(10, 6, 18, 0.35) 35%, rgba(10, 6, 18, 0.05) 65%, rgba(10, 6, 18, 0.45) 100%), url("${cardImageUrl(card.imageNumber)}")`,
        backgroundSize: "cover",
        backgroundPosition: `center ${DECK_ROW_ART_FOCAL_Y}`,
        backgroundRepeat: "no-repeat",
        border: `1px solid ${accentColor}55`,
      }}
    >
      <PipBadge
        variant="energy"
        value={card.energyCost !== null ? String(card.energyCost) : "X"}
        size="sm"
      />
      <span
        className="relative z-10 min-w-0 flex-1 truncate text-sm font-bold"
        style={{
          color: "#ffffff",
          textShadow:
            "0 1px 2px rgba(0, 0, 0, 0.95), 0 0 4px rgba(0, 0, 0, 0.85), 1px 1px 0 rgba(0, 0, 0, 0.9)",
          letterSpacing: "0.01em",
        }}
      >
        {card.name}
      </span>
      {count > 1 && (
        <span
          className="relative z-10 shrink-0 text-sm font-bold tabular-nums"
          style={{
            color: "#fbbf24",
            textShadow:
              "0 1px 2px rgba(0, 0, 0, 0.95), 0 0 4px rgba(0, 0, 0, 0.85)",
          }}
        >
          {String(count)}x
        </span>
      )}
    </div>
  );
}

/** Left-docked deck rail listing drafted cards sorted by energy cost. */
function DeckSidebar({
  deckRows,
  deckSize,
  onShowFullDeck,
  onCollapse,
}: {
  deckRows: DeckRow[];
  deckSize: number;
  onShowFullDeck: () => void;
  onCollapse: () => void;
}) {
  return (
    <div
      data-testid="draft-test-deck-sidebar"
      className="flex h-full w-64 shrink-0 flex-col overflow-hidden border-r lg:w-80"
      style={{
        borderColor: "rgba(124, 58, 237, 0.2)",
        background: "rgba(5, 2, 10, 0.6)",
      }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid rgba(124, 58, 237, 0.15)" }}
      >
        <span
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: OFFERING_ACCENT.primary }}
        >
          Deck ({String(deckSize)})
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="draft-test-full-deck-button"
            onClick={onShowFullDeck}
            disabled={deckSize === 0}
            className="cursor-pointer rounded px-2 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors disabled:cursor-default disabled:opacity-30"
            style={{
              background: "rgba(124, 58, 237, 0.18)",
              border: "1px solid rgba(124, 58, 237, 0.4)",
              color: "#c084fc",
            }}
          >
            Full View
          </button>
          <button
            type="button"
            data-testid="draft-test-deck-collapse"
            aria-label="Collapse deck panel"
            title="Collapse deck panel"
            onClick={onCollapse}
            className="flex h-7 w-6 cursor-pointer items-center justify-center rounded text-base font-bold leading-none"
            style={{
              background: "rgba(124, 58, 237, 0.12)",
              border: "1px solid rgba(124, 58, 237, 0.35)",
              color: "#c084fc",
            }}
          >
            <span aria-hidden="true">◀</span>
          </button>
        </div>
      </div>
      {deckRows.length === 0 ? (
        <div className="flex h-full min-h-0 flex-1 items-center justify-center p-4">
          <p className="text-xs opacity-40">No cards drafted yet.</p>
        </div>
      ) : (
        <div
          data-testid="draft-test-deck-rows"
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2"
        >
          {deckRows.map((row) => (
            <DeckRowItem
              key={row.card.cardNumber}
              card={row.card}
              count={row.count}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Full-screen overlay showing every drafted card as a grid. */
function FullDeckOverlay({
  deckRows,
  onClose,
}: {
  deckRows: DeckRow[];
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const totalCards = deckRows.reduce((sum, row) => sum + row.count, 0);

  return (
    <motion.div
      data-testid="draft-test-full-deck-overlay"
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "rgba(2, 1, 6, 0.92)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-3 px-6 py-3"
        style={{ borderBottom: "1px solid rgba(124, 58, 237, 0.25)" }}
      >
        <h2
          className="text-xl font-bold tracking-wide"
          style={{ color: OFFERING_ACCENT.primary }}
        >
          Drafted Deck ({String(totalCards)})
        </h2>
        <OfferingAcceptButton
          className="px-5 py-2 text-sm"
          onClick={onClose}
          testId="draft-test-full-deck-close"
        >
          Close
        </OfferingAcceptButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div
          className="mx-auto grid max-w-6xl gap-3 md:gap-4"
          style={{
            gridTemplateColumns:
              "repeat(auto-fill, minmax(150px, 1fr))",
            alignItems: "start",
          }}
        >
          {deckRows.map((row) => (
            <div key={row.card.cardNumber} className="relative">
              <CardDisplay card={row.card} />
              {row.count > 1 && (
                <span
                  className="absolute right-1 top-1 z-10 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                  style={{
                    background: "rgba(10, 6, 18, 0.85)",
                    color: "#fbbf24",
                    border: "1px solid rgba(168, 85, 247, 0.5)",
                  }}
                >
                  {String(row.count)}x
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

interface PoolInfo {
  dreamcaller: string;
  identity: string;
  themes: string[];
  size: number;
  uniqueCount: number;
  seed: number;
  variant: PoolVariant;
}

/**
 * Pool-generation variant for this session, from the `?algo=` URL parameter.
 * The accepted ids and the toggle cycle order come from the strategy registry
 * (`POOL_VARIANT_IDS`); invalid or absent values fall back to the registry's
 * default, so adding a strategy automatically extends the harness with no change
 * here.
 */
function readPoolVariant(): PoolVariant {
  const algo = new URLSearchParams(window.location.search).get("algo");
  return resolvePoolVariant(algo);
}

/**
 * A fixed pool seed from the `?seed=` URL parameter, or undefined for a fresh
 * random pool each pick. Set it to the seed logged in the console (or shown in
 * the pool header) to reproduce and inspect a specific session.
 */
function readPoolSeed(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get("seed");
  if (raw === null) return undefined;
  const seed = Number(raw);
  return Number.isFinite(seed) ? seed >>> 0 : undefined;
}

/**
 * A target draft-pool size in copies from the `?size=` URL parameter, applied to
 * whichever `?algo=` variant is active. Every variant honors it: `default` and
 * `diverse` pin their [180, 220] band to this value, while `decklists`,
 * `merged`, `idf`, `idf2`, and `idf3` center their size window on it. A
 * non-positive or non-numeric value is ignored, leaving each variant's own
 * default size.
 */
function readPoolSize(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get("size");
  if (raw === null) return undefined;
  const size = Number(raw);
  return Number.isFinite(size) && size > 0 ? Math.floor(size) : undefined;
}

/** The next variant in the cycle, for the toggle button. */
function nextPoolVariant(current: PoolVariant): PoolVariant {
  const i = POOL_VARIANT_IDS.indexOf(current);
  return POOL_VARIANT_IDS[(i + 1) % POOL_VARIANT_IDS.length];
}

/**
 * Log a compact, reproducible trace of a generated pool so a single draft
 * session can be understood after the fact. It prints the seed (which
 * reproduces the exact pool), the variant, the rolled themes, the identity and
 * size, and — most usefully — the pool's makeup by mechanic archetype (tide),
 * counted in copies. That tide breakdown is what reveals, e.g., that an
 * abandon-focused Dreamcaller's pool actually came out Spirit-Animals-heavy.
 */
function logPoolTrace(dreamcaller: string, pool: GeneratedPool): void {
  console.info(
    `[draft_test] ${dreamcaller} | ${pool.variant} | seed=${String(pool.seed)} | ` +
      `${pool.identity || "—"} | ${String(pool.size)} cards | ` +
      `themes: ${pool.themes.join(", ")}`,
  );
}

/** Reload the harness with the given variant selected via `?algo=`. */
function switchPoolVariant(next: PoolVariant): void {
  const url = new URL(window.location.href);
  url.searchParams.set("algo", next);
  window.location.assign(url.toString());
}

/**
 * Standalone draft test harness for the experimental `cards_v2` pool. The
 * player first picks one of three random v2 Dreamcallers; the chosen
 * Dreamcaller seeds draft-pool construction. A Dreamcaller with
 * `draftArchetypes` builds a pool focused on those archetypes, while one
 * without them rolls the unconstrained random pool. The draft then offers
 * 4 cards at a time to pick from and never ends: when the pool can no longer
 * fill an offer the multiset is recreated, mirroring the quest draft engine. A
 * left-docked deck rail and a full-deck overlay show what has been drafted.
 */
export default function DraftTestApp() {
  const poolVariant = useMemo(readPoolVariant, []);
  const poolSeed = useMemo(readPoolSeed, []);
  const poolSizeOverride = useMemo(readPoolSize, []);
  const [status, setStatus] = useState<
    "loading" | "select" | "ready" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [database, setDatabase] = useState<Map<number, CardData>>(new Map());
  const [dreamcallers, setDreamcallers] = useState<DraftDreamcaller[]>([]);
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
  const [currentOffer, setCurrentOffer] = useState<number[]>([]);
  const [deck, setDeck] = useState<number[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showFullDeck, setShowFullDeck] = useState(false);
  const [overlayCard, setOverlayCard] = useState<CardData | null>(null);

  const draftStateRef = useRef<DraftState | null>(null);
  const poolDataRef = useRef<PoolData | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [db, loadedDreamcallers, decklists, mergedLists] =
          await Promise.all([
            loadCardsV2Database(),
            loadDreamcallersV2(),
            loadDecklists(),
            loadMergedArchetypeLists(),
          ]);
        if (cancelled) return;

        poolDataRef.current = buildPoolData(
          [...db.values()],
          decklists,
          mergedLists,
        );
        setDatabase(db);
        setDreamcallers(loadedDreamcallers);
        setStatus("select");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectDreamcaller = useCallback(
    (dreamcaller: DraftDreamcaller) => {
      const poolData = poolDataRef.current;
      if (!poolData) return;

      const pool: GeneratedPool = generatePoolFromData(
        poolData,
        poolSeed,
        dreamcaller.draftArchetypes,
        poolVariant,
        dreamcaller.themeArchetypes,
        poolSizeOverride,
        dreamcaller.signatureCards,
      );
      const nameIndex = buildNameIndex(database);
      const { draftPoolCopiesByCard, unresolvedNames } = resolvePool(
        pool,
        nameIndex,
      );
      if (unresolvedNames.length > 0) {
        console.warn(
          `[draft_test] ${String(unresolvedNames.length)} pool card names had no match in cards_v2: ${unresolvedNames.join(", ")}`,
        );
      }
      logPoolTrace(dreamcaller.name, pool);

      const draftState: DraftState = {
        draftPoolCopiesByCard,
        remainingCopiesByCard: { ...draftPoolCopiesByCard },
        currentOffer: [],
        activeSiteId: "draft_test",
        pickNumber: 1,
        sitePicksCompleted: 0,
      };
      draftStateRef.current = draftState;

      const firstOffer = drawAndSpendUniqueCards(draftState, OFFER_SIZE);

      setPoolInfo({
        dreamcaller: dreamcaller.name,
        identity: pool.identity,
        themes: pool.themes,
        size: pool.size,
        uniqueCount: pool.counts.size,
        seed: pool.seed,
        variant: pool.variant,
      });
      setCurrentOffer(firstOffer);
      setStatus("ready");
    },
    [database, poolVariant, poolSeed, poolSizeOverride],
  );

  const offerCards = useMemo(() => {
    const cards = currentOffer
      .map((num) => database.get(num))
      .filter((c): c is CardData => c !== undefined);
    return sortCardsByCost(cards);
  }, [currentOffer, database]);

  const deckRows = useMemo(
    () => buildDeckRows(deck, database),
    [deck, database],
  );

  const handlePick = useCallback((cardNumber: number) => {
    const state = draftStateRef.current;
    if (!state) return;
    setDeck((previous) => [...previous, cardNumber]);
    const nextOffer = drawAndSpendUniqueCards(state, OFFER_SIZE);
    setCurrentOffer(nextOffer);
  }, []);

  const handleInspect = useCallback((card: CardData) => {
    setOverlayCard(card);
  }, []);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg opacity-60">Loading Dreamcallers…</p>
      </div>
    );
  }

  if (status === "select") {
    return (
      <DraftDreamcallerSelect
        dreamcallers={dreamcallers}
        onSelect={handleSelectDreamcaller}
      />
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-lg opacity-80">Could not start the draft test.</p>
        <p className="max-w-md text-sm opacity-50">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div
      data-testid="draft-test-screen"
      className="flex overflow-hidden"
      style={{ height: "100vh" }}
    >
      {/* Deck rail (left) */}
      {showSidebar ? (
        <DeckSidebar
          deckRows={deckRows}
          deckSize={deck.length}
          onShowFullDeck={() => {
            setShowFullDeck(true);
          }}
          onCollapse={() => {
            setShowSidebar(false);
          }}
        />
      ) : (
        <div
          className="flex shrink-0 items-start border-r"
          style={{
            borderColor: "rgba(124, 58, 237, 0.2)",
            background: "rgba(5, 2, 10, 0.6)",
          }}
        >
          <button
            type="button"
            data-testid="draft-test-deck-expand"
            aria-label="Expand deck panel"
            title="Expand deck panel"
            onClick={() => {
              setShowSidebar(true);
            }}
            className="flex h-8 w-7 cursor-pointer items-center justify-center rounded text-base font-bold leading-none"
            style={{
              background: "rgba(124, 58, 237, 0.12)",
              border: "1px solid rgba(124, 58, 237, 0.35)",
              color: "#c084fc",
            }}
          >
            <span aria-hidden="true">▶</span>
          </button>
        </div>
      )}

      {/* Main draft area */}
      <div
        className="flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden"
        style={{ containerType: "inline-size" }}
      >
        {/* Pool / pick header */}
        <div className="order-1 w-full px-4 py-2 md:px-8">
          <OfferingScreenHeader
            compact
            title="Draft Test"
            subtitle={`Pick ${String(deck.length + 1)}`}
            rightSlot={
              poolInfo ? (
                <div
                  data-testid="draft-test-pool-info"
                  className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] opacity-80"
                >
                  <span
                    data-testid="draft-test-pool-dreamcaller"
                    className="font-semibold"
                    style={{ color: "#e2e8f0" }}
                  >
                    {poolInfo.dreamcaller}
                  </span>
                  <button
                    type="button"
                    data-testid="draft-test-pool-variant"
                    title={`Pool algorithm: ${poolInfo.variant}. Click to cycle.`}
                    onClick={() => {
                      switchPoolVariant(nextPoolVariant(poolInfo.variant));
                    }}
                    className="cursor-pointer rounded px-2 py-0.5 font-bold uppercase tracking-widest transition-colors"
                    style={{
                      background:
                        poolInfo.variant === "color_pool"
                          ? "rgba(148, 163, 184, 0.16)"
                          : "rgba(16, 185, 129, 0.18)",
                      border:
                        poolInfo.variant === "color_pool"
                          ? "1px solid rgba(148, 163, 184, 0.4)"
                          : "1px solid rgba(16, 185, 129, 0.5)",
                      color:
                        poolInfo.variant === "color_pool" ? "#cbd5e1" : "#34d399",
                    }}
                  >
                    {poolInfo.variant}
                  </button>
                  <span
                    className="rounded px-2 py-0.5 font-bold uppercase tracking-widest"
                    style={{
                      background: "rgba(124, 58, 237, 0.18)",
                      border: "1px solid rgba(124, 58, 237, 0.4)",
                      color: "#c084fc",
                    }}
                  >
                    {poolInfo.identity.toUpperCase()}
                  </span>
                  <span className="opacity-70">
                    {String(poolInfo.size)} cards · {String(poolInfo.uniqueCount)}{" "}
                    unique
                  </span>
                  <span className="opacity-60">
                    {poolInfo.themes.map(prettyTheme).join(" + ")}
                  </span>
                  <span
                    title="Pool seed — reproduces this exact pool. See the console for the full tide breakdown."
                    className="font-mono opacity-40"
                  >
                    seed {String(poolInfo.seed)}
                  </span>
                </div>
              ) : undefined
            }
          />
        </div>

        {/* 2x2 card grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`offer-${currentOffer.join(",")}`}
            className="order-2 grid gap-3 md:gap-4"
            style={{
              gridTemplateColumns: "repeat(2, auto)",
              gridTemplateRows: "repeat(2, auto)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {offerCards.map((card) => (
              <div
                key={`card-${String(card.cardNumber)}`}
                data-testid={`draft-test-offer-card-${String(card.cardNumber)}`}
                className="draft-offer-card-wrapper relative rounded-lg"
                style={DRAFT_OFFER_CARD_STYLE}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleInspect(card);
                }}
              >
                <CardDisplay
                  card={card}
                  className="h-full w-full"
                  large
                  onClick={() => {
                    handlePick(card.cardNumber);
                  }}
                />
              </div>
            ))}
          </motion.div>
        </AnimatePresence>

        <p className="order-3 px-4 py-2 text-center text-[11px] opacity-40">
          Click a card to draft it. Right-click to inspect. Refresh for a new
          pool.
        </p>
      </div>

      <AnimatePresence>
        {showFullDeck && (
          <FullDeckOverlay
            deckRows={deckRows}
            onClose={() => {
              setShowFullDeck(false);
            }}
          />
        )}
      </AnimatePresence>

      <CardOverlay
        card={overlayCard}
        onClose={() => {
          setOverlayCard(null);
        }}
      />
    </div>
  );
}
