import { useCallback, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  CardSourceDebugEntry,
  CardSourceDebugState,
} from "../types/quest";
import type {
  Idf3CardProvenance,
  Idf3ProvenanceSummary,
} from "../types/content";

interface CardSourceOverlayProps {
  cardSourceDebug: CardSourceDebugState | null;
  /**
   * Full idf3 provenance for the run's pool, recomputed on demand. When present
   * the overlay walks the whole signature -> anchors -> starter -> growth chain
   * and explains each shown card's place in it; when absent it falls back to a
   * starter-deck / pool-copies summary.
   */
  idf3Provenance: Idf3ProvenanceSummary | null;
  isOpen: boolean;
  onClose: () => void;
}

function surfaceCopy(surface: CardSourceDebugState["surface"]): string {
  switch (surface) {
    case "Draft":
      return "These draft cards come from your Dreamcaller's idf3 pool, grown from a starter deck the signature steered toward.";
    case "Shop":
    case "SpecialtyShop":
      return "Shop cards are drawn from your Dreamcaller's idf3 pool, grown from a starter deck the signature steered toward.";
    case "BattleReward":
    case "Reward":
      return "Rewards are drawn from your Dreamcaller's idf3 pool, grown from a starter deck the signature steered toward.";
  }
}

function pct(value: number): string {
  return `${String(Math.round(value * 100))}%`;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${String(n)}th`;
  switch (n % 10) {
    case 1:
      return `${String(n)}st`;
    case 2:
      return `${String(n)}nd`;
    case 3:
      return `${String(n)}rd`;
    default:
      return `${String(n)}th`;
  }
}

const PANEL_BG = "rgba(15, 23, 42, 0.5)";
const PANEL_BORDER = "1px solid rgba(148, 163, 184, 0.18)";

function CardChips({ names }: { names: readonly string[] }) {
  if (names.length === 0) {
    return <span className="text-xs opacity-50">none</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <span
          key={name}
          className="rounded-md px-2 py-0.5 text-[11px]"
          style={{
            background: "rgba(30, 41, 59, 0.62)",
            border: "1px solid rgba(148, 163, 184, 0.16)",
            color: "#e2e8f0",
          }}
        >
          {name}
        </span>
      ))}
    </div>
  );
}

function Step({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: PANEL_BG, border: PANEL_BORDER }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
          style={{
            background: "rgba(96, 165, 250, 0.25)",
            border: "1px solid rgba(96, 165, 250, 0.45)",
            color: "#bfdbfe",
          }}
        >
          {String(index)}
        </span>
        <p
          className="text-xs font-bold tracking-[0.14em] uppercase"
          style={{ color: "#cbd5e1" }}
        >
          {title}
        </p>
      </div>
      <div className="space-y-2 text-xs opacity-90">{children}</div>
    </div>
  );
}

/** Pool-wide counts derived from the per-card provenance map. */
interface PoolStats {
  total: number;
  fromStarter: number;
  fromNeighbours: number;
  signatureInPool: number;
  doubled: number;
}

function computePoolStats(
  cardProvenanceByNumber: Record<string, Idf3CardProvenance>,
): PoolStats {
  const entries = Object.values(cardProvenanceByNumber);
  let fromStarter = 0;
  let signatureInPool = 0;
  let doubled = 0;
  for (const entry of entries) {
    if (entry.inStarterDeck) fromStarter += 1;
    if (entry.isSignature) signatureInPool += 1;
    if (entry.copies >= 2) doubled += 1;
  }
  return {
    total: entries.length,
    fromStarter,
    fromNeighbours: entries.length - fromStarter,
    signatureInPool,
    doubled,
  };
}

/** The algorithm walkthrough: signature -> anchors -> starter -> growth. */
function ProvenanceWalkthrough({
  provenance,
  stats,
}: {
  provenance: Idf3ProvenanceSummary;
  stats: PoolStats;
}) {
  const neighbourDeckCount = Math.max(0, provenance.sourceDecks.length - 1);
  const topSourceDecks = [...provenance.sourceDecks]
    .filter((deck) => deck.rank > 0 && deck.contributedCardCount > 0)
    .sort((a, b) => b.contributedCardCount - a.contributedCardCount)
    .slice(0, 4);

  return (
    <div className="space-y-2.5">
      <Step index={1} title="Signature">
        <p>
          Your Dreamcaller carries a <strong>signature</strong> — a short list of
          cards standing in for what it wants to do. It is the only steer the pool
          builder reads.
        </p>
        <CardChips names={provenance.signatureCardNames} />
        {provenance.signatureDroppedNames.length > 0 ? (
          <p className="opacity-70">
            Ignored as too common or absent from real decks (no steering signal):{" "}
            {provenance.signatureDroppedNames.join(", ")}.
          </p>
        ) : null}
      </Step>

      <Step index={2} title="Anchor decks">
        {provenance.anchors.length > 0 ? (
          <>
            <p>
              The signature located the real decks most like it — the{" "}
              <strong>anchors</strong>. The whole archetype around each anchor
              scores high, not only decks running the literal signature cards.
            </p>
            <div className="space-y-1.5">
              {provenance.anchors.map((anchor, i) => (
                <div
                  key={i}
                  className="rounded-md px-2.5 py-1.5"
                  style={{
                    background: "rgba(30, 41, 59, 0.5)",
                    border: PANEL_BORDER,
                  }}
                >
                  <p
                    className="mb-1 text-[11px] font-semibold"
                    style={{ color: "#e0f2fe" }}
                  >
                    Anchor {String(i + 1)} · {pct(anchor.similarityToSignature)}{" "}
                    match to signature
                  </p>
                  <p className="mb-1 text-[10px] uppercase tracking-wide opacity-50">
                    features
                  </p>
                  <CardChips names={anchor.distinctiveCardNames} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="opacity-70">
            No anchors — the signature is empty or carries no distinctive cards, so
            the pool falls back to a diversity-only draw across all real decks.
          </p>
        )}
      </Step>

      <Step index={3} title="Starter deck">
        <p>
          One real deck near the anchors was drawn as the <strong>starter</strong>{" "}
          — the seed the whole pool grows from (
          {String(provenance.starterCardCount)} cards). A different starter each run
          keeps pools varied but on-theme.
        </p>
        <p className="text-[10px] uppercase tracking-wide opacity-50">features</p>
        <CardChips names={provenance.starterDistinctiveCardNames} />
      </Step>

      <Step index={4} title="Growth">
        <p>
          The pool grew by folding in the {String(neighbourDeckCount)} decks most
          similar to the starter, closest first, until it reached its target size.
          A card from a deck close to the starter is a tight fit; a card from a
          distant deck is a looser one that rode in on partial overlap.
        </p>
        <div
          className="grid grid-cols-3 gap-2 rounded-md p-2 text-center"
          style={{ background: "rgba(30, 41, 59, 0.5)", border: PANEL_BORDER }}
        >
          <div>
            <p className="text-base font-bold" style={{ color: "#f8fafc" }}>
              {String(stats.total)}
            </p>
            <p className="text-[10px] opacity-60">pool cards</p>
          </div>
          <div>
            <p className="text-base font-bold" style={{ color: "#f8fafc" }}>
              {String(stats.fromStarter)}
            </p>
            <p className="text-[10px] opacity-60">from starter</p>
          </div>
          <div>
            <p className="text-base font-bold" style={{ color: "#f8fafc" }}>
              {String(stats.fromNeighbours)}
            </p>
            <p className="text-[10px] opacity-60">from neighbours</p>
          </div>
        </div>
        {topSourceDecks.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide opacity-50">
              Decks that contributed the most cards
            </p>
            {topSourceDecks.map((deck) => (
              <div
                key={deck.rank}
                className="rounded-md px-2.5 py-1.5"
                style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  border: PANEL_BORDER,
                }}
              >
                <p
                  className="mb-1 text-[11px] font-semibold"
                  style={{ color: "#e0f2fe" }}
                >
                  Deck #{String(deck.rank)} · {pct(deck.similarityToStarter)} like
                  starter · {String(deck.contributedCardCount)} cards
                </p>
                <CardChips names={deck.distinctiveCardNames} />
              </div>
            ))}
          </div>
        ) : null}
      </Step>
    </div>
  );
}

/** Per-card "why is THIS card here" explanation, provenance-aware. */
function CardExplanation({
  entry,
  provenance,
}: {
  entry: CardSourceDebugEntry;
  provenance: Idf3ProvenanceSummary | null;
}) {
  const cardProvenance =
    provenance?.cardProvenanceByNumber[String(entry.cardNumber)] ?? null;
  const inStarter =
    cardProvenance?.inStarterDeck ?? entry.inStarterDecklist ?? false;
  const isSignature = cardProvenance?.isSignature ?? false;
  const copies = cardProvenance?.copies ?? entry.draftPoolCopies ?? 0;
  const sourceRank = cardProvenance?.sourceRank ?? -1;
  const sourceDeck =
    provenance !== null && sourceRank >= 0
      ? (provenance.sourceDecks[sourceRank] ?? null)
      : null;
  const totalSourceDecks = provenance?.sourceDecks.length ?? 0;

  const badge = isSignature
    ? {
        label: "Signature",
        bg: "rgba(34, 197, 94, 0.28)",
        border: "rgba(34, 197, 94, 0.5)",
      }
    : inStarter
      ? {
          label: "Starter deck",
          bg: "rgba(168, 85, 247, 0.28)",
          border: "rgba(168, 85, 247, 0.45)",
        }
      : {
          label: "Pool",
          bg: "rgba(148, 163, 184, 0.22)",
          border: "rgba(148, 163, 184, 0.4)",
        };

  const copiesLabel = `${String(copies)} ${copies === 1 ? "copy" : "copies"} in the pool`;

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: PANEL_BG, border: PANEL_BORDER }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "#f8fafc" }}>
            {entry.cardName}
          </p>
          <p className="text-[11px] opacity-50">#{String(entry.cardNumber)}</p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            background: badge.bg,
            color: "#f1f5f9",
            border: `1px solid ${badge.border}`,
          }}
        >
          {badge.label}
        </span>
      </div>

      <div className="mt-3 space-y-2 text-xs opacity-85">
        {isSignature ? (
          <p>
            One of this Dreamcaller's <strong>signature cards</strong> — part of
            what steered the whole pool. {copiesLabel}.
          </p>
        ) : inStarter ? (
          <p>
            In your <strong>starter deck</strong>, the seed the pool grew from — as
            on-theme as a card gets. {copiesLabel}.
          </p>
        ) : sourceDeck !== null && sourceRank > 0 ? (
          <>
            <p>
              Folded in during growth from source deck{" "}
              <strong>#{String(sourceRank)}</strong> — the {ordinal(sourceRank)}{" "}
              closest of {String(totalSourceDecks - 1)} neighbour decks, at{" "}
              <strong>{pct(cardProvenance?.sourceSimilarity ?? 0)}</strong>{" "}
              similarity to your starter. {copiesLabel}.
            </p>
            <p className="text-[10px] uppercase tracking-wide opacity-50">
              that deck features
            </p>
            <CardChips names={sourceDeck.distinctiveCardNames} />
          </>
        ) : (
          <p>
            {provenance !== null
              ? `Drawn from your Dreamcaller's pool. ${copiesLabel}.`
              : `Draft-pool card. ${copiesLabel}.`}
          </p>
        )}
      </div>
    </div>
  );
}

export function CardSourceOverlay({
  cardSourceDebug,
  idf3Provenance,
  isOpen,
  onClose,
}: CardSourceOverlayProps) {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handleClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose, isOpen]);

  const stats = useMemo(
    () =>
      idf3Provenance !== null
        ? computePoolStats(idf3Provenance.cardProvenanceByNumber)
        : null,
    [idf3Provenance],
  );

  return (
    <AnimatePresence>
      {isOpen && cardSourceDebug !== null && (
        <motion.aside
          key="card-source-overlay"
          className="fixed top-4 right-4 left-4 z-[55] flex max-h-[80vh] flex-col overflow-hidden rounded-2xl md:left-auto md:w-[460px]"
          style={{
            background:
              "linear-gradient(180deg, rgba(7, 10, 18, 0.97) 0%, rgba(11, 17, 30, 0.97) 100%)",
            border: "1px solid rgba(96, 165, 250, 0.28)",
            boxShadow: "0 20px 60px rgba(2, 6, 23, 0.5)",
            backdropFilter: "blur(12px)",
          }}
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22 }}
        >
          <div
            className="flex items-start justify-between gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.14)" }}
          >
            <div>
              <p className="text-xs font-bold tracking-[0.18em] uppercase opacity-60">
                Why am I seeing these cards?
              </p>
              <h2 className="text-lg font-bold" style={{ color: "#f8fafc" }}>
                {cardSourceDebug.screenLabel}
              </h2>
              <p className="mt-1 text-xs opacity-70">
                {surfaceCopy(cardSourceDebug.surface)}
              </p>
            </div>
            <button
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
              style={{ background: "rgba(255, 255, 255, 0.08)", color: "#e2e8f0" }}
              onClick={handleClose}
              aria-label="Close card source overlay"
            >
              {"✕"}
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {idf3Provenance !== null && stats !== null ? (
              <section className="space-y-2">
                <p className="text-[11px] font-bold tracking-[0.18em] uppercase opacity-50">
                  How this pool was built
                </p>
                <ProvenanceWalkthrough provenance={idf3Provenance} stats={stats} />
              </section>
            ) : null}

            <section className="space-y-2">
              <p className="text-[11px] font-bold tracking-[0.18em] uppercase opacity-50">
                The cards in front of you
              </p>
              {(cardSourceDebug.entries ?? []).map((entry) => (
                <CardExplanation
                  key={`${String(entry.cardNumber)}-${cardSourceDebug.surface}`}
                  entry={entry}
                  provenance={idf3Provenance}
                />
              ))}
            </section>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
