import { useCallback, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  CardSourceDebugEntry,
  CardSourceDebugState,
} from "../types/quest";
import type {
  Idf3CardProvenance,
  Idf3ProvenanceSummary,
  SeedCardProvenance,
  SeedProvenanceSummary,
  Tides4CardProvenance,
  Tides4ProvenanceSummary,
  Tides4TideSummary,
} from "../types/content";
import { seedProvenanceVariantCopy } from "../draft/pool/seed-provenance-copy";
import { HoverPopover } from "../components/HoverPopover";

interface CardSourceOverlayProps {
  cardSourceDebug: CardSourceDebugState | null;
  /**
   * Full idf3 provenance for the run's pool, recomputed on demand. When present
   * the overlay walks the whole signature -> anchors -> starter -> growth chain
   * and explains each shown card's place in it; when absent it falls back to a
   * starter-deck / pool-copies summary.
   */
  idf3Provenance: Idf3ProvenanceSummary | null;
  /**
   * Full `seed`-variant provenance, recomputed on demand. When present the
   * overlay walks the seed-card -> affinity -> growth story instead of the idf3
   * chain and explains each shown card by how it grew out from the seed.
   */
  seedProvenance?: SeedProvenanceSummary | null;
  /**
   * Full `tides4`-variant provenance, recomputed on demand. When present the
   * overlay walks the signature-tide -> theme-tide draw -> deal story and names
   * the source tide of each shown card, so the player can see which tide it came
   * from and why that tide was part of the run.
   */
  tides4Provenance?: Tides4ProvenanceSummary | null;
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

function seedSurfaceCopy(
  surface: CardSourceDebugState["surface"],
  tail: string,
): string {
  const grown = `from a pool grown around a single card drawn at random, expanding ${tail}.`;
  switch (surface) {
    case "Draft":
      return `These draft cards come ${grown}`;
    case "Shop":
    case "SpecialtyShop":
      return `Shop cards are drawn ${grown}`;
    case "BattleReward":
    case "Reward":
      return `Rewards are drawn ${grown}`;
  }
}

function tides4SurfaceCopy(surface: CardSourceDebugState["surface"]): string {
  const dealt =
    "dealt from your Dreamcaller's tides — preconstructed decks shuffled together: its signature tide plus a random few theme tides, topped up with broad tides.";
  switch (surface) {
    case "Draft":
      return `These draft cards were ${dealt}`;
    case "Shop":
    case "SpecialtyShop":
      return `Shop cards are ${dealt}`;
    case "BattleReward":
    case "Reward":
      return `Rewards are ${dealt}`;
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

/**
 * Chips naming the tides that built the pool, by their thematic `displayName`.
 * Each chip hovers to a popover with the tide's one-line player-facing blurb.
 */
function TideChips({ tides }: { tides: readonly Tides4TideSummary[] }) {
  if (tides.length === 0) {
    return <span className="text-xs opacity-50">none</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {tides.map((tide) => {
        const chip = (
          <span
            className="rounded-md px-2 py-0.5 text-[11px]"
            data-why-tide-chip={tide.id}
            style={{
              background: "rgba(30, 41, 59, 0.62)",
              border: "1px solid rgba(148, 163, 184, 0.16)",
              color: "#e2e8f0",
              cursor: tide.displayDescription != null ? "help" : "default",
            }}
          >
            {tide.displayName ?? tide.name}
          </span>
        );
        if (tide.displayDescription == null) {
          return <span key={tide.id}>{chip}</span>;
        }
        return (
          <HoverPopover
            key={tide.id}
            content={<TideChipTooltip tide={tide} />}
          >
            {chip}
          </HoverPopover>
        );
      })}
    </div>
  );
}

/** Hover tooltip body for a tide chip: thematic name plus its blurb. */
function TideChipTooltip({ tide }: { tide: Tides4TideSummary }) {
  return (
    <span
      data-why-tide-tooltip={tide.id}
      className="block rounded-lg border px-3 py-2 text-left text-xs leading-relaxed shadow-2xl"
      style={{
        background: "#000000",
        borderColor: "rgba(255, 255, 255, 0.16)",
        color: "#ffffff",
        maxWidth: "260px",
      }}
    >
      <span className="font-semibold">{tide.displayName ?? tide.name}</span>
      {tide.displayDescription != null ? (
        <span className="mt-1 block opacity-90">{tide.displayDescription}</span>
      ) : null}
    </span>
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

/** The affinity-grown walkthrough: seed card -> affinity -> growth. */
function SeedProvenanceWalkthrough({
  provenance,
}: {
  provenance: SeedProvenanceSummary;
}) {
  const copy = seedProvenanceVariantCopy(provenance.variant);
  return (
    <div className="space-y-2.5">
      <Step index={1} title="Seed card">
        <p>
          One card was drawn <strong>uniformly at random</strong> from{" "}
          {copy.seedSource}. The whole pool grew out from it.
        </p>
        <CardChips names={[provenance.seedCardName]} />
      </Step>

      <Step index={2} title="Affinity">
        <p>
          {copy.affinityExplanation} The blend leans{" "}
          <strong>{pct(provenance.seedAffinityWeight)}</strong> on the seed,{" "}
          <strong>{pct(1 - provenance.seedAffinityWeight)}</strong> on coherence
          with the growing pool.
        </p>
        {provenance.topPartnerCardNames.length > 0 ? (
          <>
            <p className="text-[10px] uppercase tracking-wide opacity-50">
              the seed's strongest partners in the pool
            </p>
            <CardChips names={provenance.topPartnerCardNames} />
          </>
        ) : null}
      </Step>

      <Step index={3} title="Growth">
        <p>
          Cards were added one copy at a time, highest blended affinity first,
          recomputing pool coherence after each, until the pool reached its target
          of <strong>{String(provenance.targetSize)}</strong> copies. The most
          central cards earned a second copy.
        </p>
        <div
          className="grid grid-cols-3 gap-2 rounded-md p-2 text-center"
          style={{ background: "rgba(30, 41, 59, 0.5)", border: PANEL_BORDER }}
        >
          <div>
            <p className="text-base font-bold" style={{ color: "#f8fafc" }}>
              {String(provenance.totalCopies)}
            </p>
            <p className="text-[10px] opacity-60">total copies</p>
          </div>
          <div>
            <p className="text-base font-bold" style={{ color: "#f8fafc" }}>
              {String(provenance.distinctCardCount)}
            </p>
            <p className="text-[10px] opacity-60">distinct cards</p>
          </div>
          <div>
            <p className="text-base font-bold" style={{ color: "#f8fafc" }}>
              {String(provenance.doubledCardCount)}
            </p>
            <p className="text-[10px] opacity-60">doubled</p>
          </div>
        </div>
      </Step>
    </div>
  );
}

/** Per-card "why is THIS card here" explanation for the `seed` variant. */
function SeedCardExplanation({
  entry,
  provenance,
}: {
  entry: CardSourceDebugEntry;
  provenance: SeedProvenanceSummary;
}) {
  const cardProvenance: SeedCardProvenance | null =
    provenance.cardProvenanceByNumber[String(entry.cardNumber)] ?? null;
  const isSeed = cardProvenance?.isSeed ?? false;
  const copies = cardProvenance?.copies ?? entry.draftPoolCopies ?? 0;
  const copiesLabel = `${String(copies)} ${copies === 1 ? "copy" : "copies"} in the pool`;

  const badge = isSeed
    ? {
        label: "Seed",
        bg: "rgba(234, 179, 8, 0.28)",
        border: "rgba(234, 179, 8, 0.5)",
      }
    : {
        label: "Pool",
        bg: "rgba(148, 163, 184, 0.22)",
        border: "rgba(148, 163, 184, 0.4)",
      };

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
        {isSeed ? (
          <p>
            The <strong>seed card</strong> drawn at random — everything in the pool
            grew out from it. {copiesLabel}.
          </p>
        ) : cardProvenance !== null ? (
          <>
            <p>
              Joined the pool <strong>{ordinal(cardProvenance.addOrder)}</strong> of{" "}
              {String(provenance.distinctCardCount)}, at{" "}
              <strong>{pct(cardProvenance.seedAffinity)}</strong> affinity to the
              seed and <strong>{pct(cardProvenance.poolAffinity)}</strong> to the
              pool by then. {copiesLabel}.
            </p>
          </>
        ) : (
          <p>Draft-pool card. {copiesLabel}.</p>
        )}
      </div>
    </div>
  );
}

/** Role-based badge styling for a tide card's source tide. */
function tideRoleBadge(role: Tides4TideSummary["role"]): {
  label: string;
  bg: string;
  border: string;
} {
  switch (role) {
    case "signature":
      return {
        label: "Signature tide",
        bg: "rgba(34, 197, 94, 0.28)",
        border: "rgba(34, 197, 94, 0.5)",
      };
    case "facet":
      return {
        label: "Theme tide",
        bg: "rgba(45, 212, 191, 0.26)",
        border: "rgba(45, 212, 191, 0.5)",
      };
    case "neutral":
      return {
        label: "Broad tide",
        bg: "rgba(148, 163, 184, 0.22)",
        border: "rgba(148, 163, 184, 0.4)",
      };
  }
}

/** The `tides4` walkthrough: signature tide -> theme-tide draw -> broad fill -> deal. */
function Tides4ProvenanceWalkthrough({
  provenance,
}: {
  provenance: Tides4ProvenanceSummary;
}) {
  const starterTide = provenance.tides.find((t) => t.selection === "starter");
  const drawnFacetTides = provenance.tides.filter(
    (t) => t.selection === "facet-drawn",
  );
  const broadTides = provenance.tides.filter(
    (t) =>
      t.joined &&
      (t.selection === "neutral-fill" || t.selection === "facet-fill"),
  );
  const joinedCount = provenance.tides.filter((t) => t.joined).length;
  const distinctCardCount = Object.keys(
    provenance.cardProvenanceByNumber,
  ).length;

  return (
    <div className="space-y-2.5">
      <Step index={1} title="Signature tide">
        {provenance.signatureless ? (
          <p>
            This Dreamcaller has <strong>no signature</strong>, so the pool
            borrowed the{" "}
            <strong>{provenance.borrowedArchetypeName ?? "a random"}</strong>{" "}
            archetype this run — its signature tide is the pool's identity floor,
            always joined.
          </p>
        ) : (
          <p>
            Your Dreamcaller's <strong>signature tide</strong> is the pool's
            identity floor — always joined, never random.
          </p>
        )}
        <TideChips tides={starterTide ? [starterTide] : []} />
      </Step>

      <Step index={2} title="Theme tides">
        <p>
          A random <strong>{String(provenance.facetDrawnCount)}</strong> of{" "}
          {String(provenance.facetAvailableCount)} theme tides were drawn and
          shuffled in. Drawing a different few each run is the variety engine —
          it leans the same identity a different way every time.
        </p>
        <TideChips tides={drawnFacetTides} />
      </Step>

      <Step index={3} title="Broad fill">
        {broadTides.length > 0 ? (
          <>
            <p>
              Broad, format-spanning tides topped the pool up to full size once
              the signature and theme tides were in.
            </p>
            <TideChips tides={broadTides} />
          </>
        ) : (
          <p className="opacity-70">
            The signature and theme tides alone filled the pool — no broad tides
            were needed this run.
          </p>
        )}
      </Step>

      <Step index={4} title="Deal">
        <p>
          The {String(joinedCount)} joined tides were shuffled into one bag and
          dealt to <strong>{String(provenance.dealSize)}</strong> cards, at most{" "}
          <strong>{String(provenance.cap)}</strong> copies of any card.
        </p>
        <div
          className="grid grid-cols-3 gap-2 rounded-md p-2 text-center"
          style={{ background: "rgba(30, 41, 59, 0.5)", border: PANEL_BORDER }}
        >
          <div>
            <p className="text-base font-bold" style={{ color: "#f8fafc" }}>
              {String(joinedCount)}
            </p>
            <p className="text-[10px] opacity-60">tides joined</p>
          </div>
          <div>
            <p className="text-base font-bold" style={{ color: "#f8fafc" }}>
              {String(provenance.facetDrawnCount)}
            </p>
            <p className="text-[10px] opacity-60">theme tides drawn</p>
          </div>
          <div>
            <p className="text-base font-bold" style={{ color: "#f8fafc" }}>
              {String(distinctCardCount)}
            </p>
            <p className="text-[10px] opacity-60">distinct cards</p>
          </div>
        </div>
      </Step>
    </div>
  );
}

/** Per-card "why is THIS card here" explanation for the `tides4` variant. */
function Tides4CardExplanation({
  entry,
  provenance,
  tideById,
}: {
  entry: CardSourceDebugEntry;
  provenance: Tides4ProvenanceSummary;
  tideById: ReadonlyMap<string, Tides4TideSummary>;
}) {
  const cardProvenance: Tides4CardProvenance | null =
    provenance.cardProvenanceByNumber[String(entry.cardNumber)] ?? null;
  const primaryTide =
    cardProvenance !== null
      ? (tideById.get(cardProvenance.primaryTideId) ?? null)
      : null;
  const copies = cardProvenance?.copies ?? entry.draftPoolCopies ?? 0;
  const copiesLabel = `${String(copies)} ${copies === 1 ? "copy" : "copies"} in the pool`;
  const otherTideCount =
    cardProvenance !== null ? Math.max(0, cardProvenance.tideIds.length - 1) : 0;

  const badge =
    primaryTide !== null
      ? tideRoleBadge(primaryTide.role)
      : {
          label: "Pool",
          bg: "rgba(148, 163, 184, 0.22)",
          border: "rgba(148, 163, 184, 0.4)",
        };

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
        {primaryTide !== null ? (
          <p>
            {tideCardReason(primaryTide, provenance)} {copiesLabel}.
            {otherTideCount > 0
              ? ` Also appears in ${String(otherTideCount)} other of your tides.`
              : ""}
          </p>
        ) : (
          <p>
            Dealt from your Dreamcaller's tides. {copiesLabel}.
          </p>
        )}
      </div>
    </div>
  );
}

/** Player-facing reason a card's source tide was part of the run. */
function tideCardReason(
  tide: Tides4TideSummary,
  provenance: Tides4ProvenanceSummary,
): string {
  const label = tide.displayName ?? tide.name;
  switch (tide.selection) {
    case "starter":
      return provenance.signatureless
        ? `From the borrowed signature tide ${label} — the ${
            provenance.borrowedArchetypeName ?? "borrowed"
          } archetype's identity floor.`
        : `From your signature tide ${label} — the pool's identity floor.`;
    case "facet-drawn":
      return `From the theme tide ${label}, one of the ${String(
        provenance.facetDrawnCount,
      )} drawn at random this run.`;
    case "facet-fill":
      return `From ${label}, an on-theme tide folded in to top the pool up.`;
    case "neutral-fill":
      return `From the broad tide ${label}, folded in to top the pool up.`;
  }
}

export function CardSourceOverlay({
  cardSourceDebug,
  idf3Provenance,
  seedProvenance = null,
  tides4Provenance = null,
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

  const tideById = useMemo(() => {
    const map = new Map<string, Tides4TideSummary>();
    for (const tide of tides4Provenance?.tides ?? []) {
      map.set(tide.id, tide);
    }
    return map;
  }, [tides4Provenance]);

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
                {tides4Provenance !== null
                  ? tides4SurfaceCopy(cardSourceDebug.surface)
                  : seedProvenance !== null
                    ? seedSurfaceCopy(
                        cardSourceDebug.surface,
                        seedProvenanceVariantCopy(seedProvenance.variant)
                          .headerAffinityTail,
                      )
                    : surfaceCopy(cardSourceDebug.surface)}
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
            {tides4Provenance !== null ? (
              <section className="space-y-2">
                <p className="text-[11px] font-bold tracking-[0.18em] uppercase opacity-50">
                  How this pool was built
                </p>
                <Tides4ProvenanceWalkthrough provenance={tides4Provenance} />
              </section>
            ) : seedProvenance !== null ? (
              <section className="space-y-2">
                <p className="text-[11px] font-bold tracking-[0.18em] uppercase opacity-50">
                  How this pool was built
                </p>
                <SeedProvenanceWalkthrough provenance={seedProvenance} />
              </section>
            ) : idf3Provenance !== null && stats !== null ? (
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
              {(cardSourceDebug.entries ?? []).map((entry) =>
                tides4Provenance !== null ? (
                  <Tides4CardExplanation
                    key={`${String(entry.cardNumber)}-${cardSourceDebug.surface}`}
                    entry={entry}
                    provenance={tides4Provenance}
                    tideById={tideById}
                  />
                ) : seedProvenance !== null ? (
                  <SeedCardExplanation
                    key={`${String(entry.cardNumber)}-${cardSourceDebug.surface}`}
                    entry={entry}
                    provenance={seedProvenance}
                  />
                ) : (
                  <CardExplanation
                    key={`${String(entry.cardNumber)}-${cardSourceDebug.surface}`}
                    entry={entry}
                    provenance={idf3Provenance}
                  />
                ),
              )}
            </section>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
