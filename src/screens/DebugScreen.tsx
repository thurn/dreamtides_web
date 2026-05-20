import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CardData } from "../types/cards";
import type {
  PackageTideId,
  DreamsignTemplate,
  ResolvedDreamcallerPackage,
} from "../types/content";
import type { DraftState } from "../types/draft";
import { TideDocumentationHover } from "../components/TideDocumentationHover";
import {
  extractDraftDebugInfo,
  extractPackageDebugInfo,
} from "./debug-helpers";

/** Props for the DebugScreen component. */
interface DebugScreenProps {
  isOpen: boolean;
  onClose: () => void;
  draftState: DraftState | null;
  cardDatabase: Map<number, CardData>;
  resolvedPackage: ResolvedDreamcallerPackage | null;
  remainingDreamsignPool: string[];
  dreamsignTemplates: readonly DreamsignTemplate[];
  /**
   * QA-only debug action: replace the current draft offer with up to four
   * legendary cards drawn from the card database. Wired through `App.tsx`
   * to `mutations.setDraftState`. Used to verify the legendary frame
   * treatment surfaces correctly when an offer is filled with legendaries.
   */
  onForceLegendaryOffer?: (
    draftState: DraftState,
    source: string,
  ) => void;
}

/** Full-screen overlay showing package and draft pool debug info. */
export function DebugScreen({
  isOpen,
  onClose,
  draftState,
  cardDatabase,
  resolvedPackage,
  remainingDreamsignPool,
  dreamsignTemplates,
  onForceLegendaryOffer,
}: DebugScreenProps) {
  const debugInfo = useMemo(
    () => extractDraftDebugInfo(draftState, cardDatabase),
    [draftState, cardDatabase],
  );
  const packageDebugInfo = useMemo(
    () =>
      extractPackageDebugInfo(
        resolvedPackage,
        remainingDreamsignPool,
        dreamsignTemplates,
      ),
    [resolvedPackage, remainingDreamsignPool, dreamsignTemplates],
  );

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
  }, [isOpen, handleClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="debug-screen-backdrop"
          className="fixed inset-0 z-[60] flex flex-col"
          style={{ backgroundColor: "rgba(5, 2, 10, 0.95)" }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.3 }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 md:px-6"
            style={{
              borderBottom: "1px solid rgba(124, 58, 237, 0.3)",
              background:
                "linear-gradient(180deg, rgba(10, 6, 18, 0.95) 0%, rgba(10, 6, 18, 0.8) 100%)",
            }}
          >
            <h2
              className="text-lg font-bold md:text-xl"
              style={{ color: "#e2e8f0" }}
            >
              Debug: Package State
            </h2>
            <button
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-lg transition-colors"
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                color: "#e2e8f0",
              }}
              onClick={handleClose}
              aria-label="Close debug screen"
            >
              {"\u2715"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
            {packageDebugInfo === null ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm opacity-40">
                  No package data available yet.
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-4xl space-y-4">
                <div className="flex flex-wrap gap-3">
                  <StatBadge
                    label="Starting Essence"
                    value={String(packageDebugInfo.startingEssence)}
                  />
                  <StatBadge
                    label="Required"
                    value={String(packageDebugInfo.mandatoryTides.length)}
                  />
                  <StatBadge
                    label="Optional"
                    value={String(packageDebugInfo.optionalSubset.length)}
                  />
                  <StatBadge
                    label="Draft Pool"
                    value={String(packageDebugInfo.draftPoolSize)}
                  />
                  <StatBadge
                    label="Dreamsigns Left"
                    value={String(packageDebugInfo.remainingDreamsigns.length)}
                  />
                  <StatBadge
                    label="Dreamsigns Spent"
                    value={String(packageDebugInfo.spentDreamsigns.length)}
                  />
                  {debugInfo !== null && (
                    <>
                      <StatBadge
                        label="Pick"
                        value={String(debugInfo.pickNumber)}
                      />
                      <StatBadge
                        label="Remaining"
                        value={String(debugInfo.remainingCards)}
                      />
                      <StatBadge
                        label="Unique"
                        value={String(debugInfo.remainingUniqueCards)}
                      />
                    </>
                  )}
                </div>

                <InfoCard title="Dreamcaller">
                  <p className="text-sm font-bold" style={{ color: "#e2e8f0" }}>
                    {packageDebugInfo.dreamcallerName}
                  </p>
                </InfoCard>

                <InfoCard title="Required Packages">
                  <p className="mb-2 text-xs opacity-60">
                    Fixed package IDs always used for this Dreamcaller.
                  </p>
                  <DebugChipList
                    emptyLabel="No required packages."
                    items={packageDebugInfo.mandatoryTides.map((packageTideId) => ({
                      key: packageTideId,
                      label: packageTideId,
                      tideId: packageTideId,
                    }))}
                  />
                </InfoCard>

                <InfoCard title="Selected Optional Packages">
                  <p className="mb-2 text-xs opacity-60">
                    Optional package IDs selected for this run's draft pool.
                  </p>
                  <DebugChipList
                    emptyLabel="No optional packages were selected."
                    items={packageDebugInfo.optionalSubset.map((packageTideId) => ({
                      key: packageTideId,
                      label: packageTideId,
                      tideId: packageTideId,
                    }))}
                  />
                </InfoCard>

                <InfoCard title="Full Draft Pool Packages">
                  <p className="mb-2 text-xs opacity-60">
                    Combined required and selected optional package IDs.
                  </p>
                  <DebugChipList
                    emptyLabel="No package IDs are active."
                    items={packageDebugInfo.selectedTides.map((packageTideId) => ({
                      key: packageTideId,
                      label: packageTideId,
                      tideId: packageTideId,
                    }))}
                  />
                </InfoCard>

                <InfoCard title="Package Validation">
                  <div className="grid gap-2 text-sm opacity-80 md:grid-cols-2">
                    <p>
                      Mandatory-only pool:{" "}
                      {String(packageDebugInfo.mandatoryOnlyPoolSize)}
                    </p>
                    <p>
                      Doubled cards: {String(packageDebugInfo.doubledCardCount)}
                    </p>
                    <p>
                      Legal subsets: {String(packageDebugInfo.legalSubsetCount)}
                    </p>
                    <p>
                      Preferred subsets:{" "}
                      {String(packageDebugInfo.preferredSubsetCount)}
                    </p>
                  </div>
                </InfoCard>

                <InfoCard title="Dreamsign Pool">
                  <p className="mb-2 text-xs opacity-60">
                    Remaining {String(packageDebugInfo.remainingDreamsigns.length)}
                    {" / "}
                    {String(packageDebugInfo.initialDreamsignPoolSize)}
                  </p>
                  <DebugChipList
                    emptyLabel="Dreamsign pool exhausted."
                    items={packageDebugInfo.remainingDreamsigns.map((dreamsign) => ({
                      key: dreamsign.id,
                      label: dreamsign.name,
                    }))}
                  />
                </InfoCard>

                <InfoCard title="Spent Dreamsigns">
                  <DebugChipList
                    emptyLabel="No Dreamsigns have been spent yet."
                    items={packageDebugInfo.spentDreamsigns.map((dreamsign) => ({
                      key: dreamsign.id,
                      label: dreamsign.name,
                    }))}
                  />
                </InfoCard>

                {debugInfo !== null && (
                  <InfoCard title="Current Offer">
                    <DebugChipList
                      emptyLabel="No offer is currently active."
                      items={debugInfo.currentOffer.map((card) => ({
                        key: String(card.cardNumber),
                        label: card.name,
                      }))}
                    />
                    {draftState !== null
                      && onForceLegendaryOffer !== undefined
                      && draftState.currentOffer.length > 0 && (
                        <ForceLegendaryOfferButton
                          draftState={draftState}
                          cardDatabase={cardDatabase}
                          onApply={onForceLegendaryOffer}
                          onClose={handleClose}
                        />
                      )}
                  </InfoCard>
                )}

                {debugInfo !== null && (
                  <InfoCard title="Top Remaining Draft Cards">
                    <DebugChipList
                      emptyLabel="No cards remain in the draft pool."
                      items={debugInfo.topRemainingCards.map((card) => ({
                        key: String(card.cardNumber),
                        label: `${card.name} x${String(card.copiesRemaining)}`,
                      }))}
                    />
                  </InfoCard>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DebugChipList({
  emptyLabel,
  items,
}: {
  emptyLabel: string;
  items: Array<{ key: string; label: string; tideId?: PackageTideId }>;
}) {
  if (items.length === 0) {
    return <p className="text-sm opacity-50">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item.key}
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: "rgba(168, 85, 247, 0.12)",
            border: "1px solid rgba(168, 85, 247, 0.24)",
            color: "#c084fc",
          }}
        >
          {item.tideId === undefined ? (
            item.label
          ) : (
            <TideDocumentationHover tideId={item.tideId}>
              {item.label}
            </TideDocumentationHover>
          )}
        </span>
      ))}
    </div>
  );
}

/** Small stat badge. */
function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-3 py-1.5"
      style={{
        background: "rgba(124, 58, 237, 0.1)",
        border: "1px solid rgba(124, 58, 237, 0.2)",
      }}
    >
      <span className="text-[10px] uppercase tracking-wider opacity-50">
        {label}
      </span>
      <span className="ml-1.5 text-sm font-bold" style={{ color: "#c084fc" }}>
        {value}
      </span>
    </div>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className="space-y-1 rounded-lg p-3"
      style={{
        background: "rgba(0, 0, 0, 0.3)",
        border: "1px solid rgba(124, 58, 237, 0.15)",
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: "#a855f7" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * QA-only button that overrides the current draft offer with up to four
 * legendary cards drawn from the live card database. Useful for verifying
 * the legendary frame treatment without rerolling a draft until a
 * legendary surfaces naturally.
 */
function ForceLegendaryOfferButton({
  draftState,
  cardDatabase,
  onApply,
  onClose,
}: {
  draftState: DraftState;
  cardDatabase: Map<number, CardData>;
  onApply: (draftState: DraftState, source: string) => void;
  onClose: () => void;
}) {
  const legendaryCards = useMemo(
    () =>
      Array.from(cardDatabase.values()).filter(
        (card) => card.rarity === "Legendary",
      ),
    [cardDatabase],
  );
  const canForce = legendaryCards.length >= 1;

  const handleClick = useCallback(() => {
    if (!canForce) return;
    const offerCount = Math.min(4, legendaryCards.length);
    const offer = legendaryCards
      .slice(0, offerCount)
      .map((card) => card.cardNumber);
    const nextDraftState: DraftState = {
      ...draftState,
      currentOffer: offer,
    };
    onApply(nextDraftState, "debug_force_legendary_offer");
    onClose();
  }, [canForce, legendaryCards, draftState, onApply, onClose]);

  if (!canForce) return null;

  return (
    <button
      data-testid="debug-force-legendary-offer"
      type="button"
      onClick={handleClick}
      className="mt-2 cursor-pointer rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
      style={{
        background: "linear-gradient(135deg, #d4a017 0%, #fbbf24 100%)",
        color: "#1a1025",
        border: "1px solid rgba(255, 232, 150, 0.6)",
      }}
    >
      Force Legendary Offer (QA)
    </button>
  );
}
