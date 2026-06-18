import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Dreamsign, SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import { DreamGuideFrame } from "../components/DreamGuideFrame";
import {
  DREAMSIGN_HOVER_DELAY_MS,
  DreamsignHoverCard,
} from "../components/DreamsignHoverCard";
import { HoverPopover } from "../components/HoverPopover";
import {
  OFFERING_NEUTRAL,
  OfferingAcceptButton,
  OfferingCardFrame,
  OfferingDreamsignBody,
  OfferingFooter,
  OfferingGrid,
  OfferingScreenHeader,
  OfferingScreenLayout,
  OfferingSkipButton,
} from "../components/OfferingScreen";

/** Props for the DreamsignDraftScreen component. */
interface DreamsignDraftScreenProps {
  site: SiteState;
}

/** Shows 3 (or 4 enhanced) dreamsign options. Pick 1 or skip. */
export function DreamsignDraftScreen({ site }: DreamsignDraftScreenProps) {
  const { state, mutations } = useQuest();
  const { dreamsigns: currentDreamsigns, maxDreamsigns } = state;

  const optionCount = site.isEnhanced ? 4 : 3;
  const runtime = state.siteRuntime[site.id];
  const offerRuntime = runtime?.kind === "dreamsignOffer" ? runtime : null;
  const options = offerRuntime?.offeredDreamsigns ?? null;
  const remainingDreamsignPoolKey = state.remainingDreamsignPool.join("\u0000");

  const [purging, setPurging] = useState(false);
  const [pendingDreamsign, setPendingDreamsign] = useState<Dreamsign | null>(
    null,
  );

  useEffect(() => {
    if (runtime === undefined) {
      mutations.ensureDreamsignOfferRuntime(site.id, optionCount);
    }
  }, [mutations, optionCount, remainingDreamsignPoolKey, runtime, site.id]);

  useEffect(() => {
    if (options === null) {
      return;
    }

    logEvent("site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      optionCount,
    });
  }, [site.type, site.isEnhanced, optionCount, options]);

  // The same screen serves both the DreamsignDraft and DreamsignRevelation site
  // types; the completion source mirrors the actual site type so log readers can
  // tell the two visit kinds apart.
  const completeSource =
    site.type === "DreamsignRevelation"
      ? "dreamsign_revelation"
      : "dreamsign_draft";

  const completeSite = useCallback(() => {
    mutations.completeSite(site.id, completeSource);
  }, [site, mutations, completeSource]);

  const handleSelect = useCallback(
    (dreamsign: Dreamsign) => {
      if (currentDreamsigns.length >= maxDreamsigns) {
        setPendingDreamsign(dreamsign);
        setPurging(true);
        return;
      }
      mutations.acceptDreamsignOffer(site.id, dreamsign);
    },
    [currentDreamsigns.length, mutations, site.id],
  );

  const handlePurge = useCallback(
    (index: number) => {
      if (pendingDreamsign) {
        mutations.acceptDreamsignOffer(site.id, pendingDreamsign, index);
      }
      setPurging(false);
      setPendingDreamsign(null);
    },
    [pendingDreamsign, mutations, site.id],
  );

  const handleSkip = useCallback(() => {
    completeSite();
  }, [completeSite]);

  if (purging) {
    return (
      <DreamsignPurgeOverlay
        maxDreamsigns={maxDreamsigns}
        pendingDreamsign={pendingDreamsign}
        currentDreamsigns={currentDreamsigns}
        onPurge={handlePurge}
        onCancel={() => {
          setPurging(false);
          setPendingDreamsign(null);
        }}
      />
    );
  }

  if (options === null) {
    return (
      <div className="flex min-h-full items-center justify-center p-8 text-sm opacity-70">
        Revealing Dreamsigns...
      </div>
    );
  }

  return (
    <OfferingScreenLayout
      testId="dreamsign-draft-screen"
      className="dreamsign-draft-screen"
    >
      <DreamGuideFrame site={site} />
      <OfferingScreenHeader
        title="Dreamsign Draft"
        subtitle="Choose one dreamsign or skip"
        enhancedLabel={site.isEnhanced ? "Enhanced -- 4 Options" : undefined}
      />

      {options.length === 0 ? (
        <p className="text-sm opacity-60">
          The Dreamsign pool is exhausted.
        </p>
      ) : (
        <OfferingGrid>
          {options.map((dreamsign, index) => {
            const triggerId = dreamsign.id ?? dreamsign.name;
            return (
              <motion.div
                key={`draft-${dreamsign.name}`}
                data-testid={`dreamsign-draft-option-${triggerId}`}
                className="dreamsign-draft-option flex w-[224px] flex-col items-center gap-3 self-stretch"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.12, duration: 0.4 }}
              >
                <HoverPopover
                  triggerAs="div"
                  className="flex w-full flex-1"
                  delayMs={DREAMSIGN_HOVER_DELAY_MS}
                  placement="left"
                  maxWidthPx={null}
                  content={({ side, anchorRect }) => (
                    <DreamsignHoverCard
                      dreamsign={dreamsign}
                      popoverSide={side}
                      anchorRect={anchorRect}
                    />
                  )}
                >
                  <div
                    data-testid={`dreamsign-draft-hover-trigger-${triggerId}`}
                    tabIndex={0}
                    aria-label={`Dreamsign: ${dreamsign.name}`}
                    className="flex h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                  >
                    <OfferingCardFrame className="h-full flex-1">
                      <OfferingDreamsignBody dreamsign={dreamsign} />
                    </OfferingCardFrame>
                  </div>
                </HoverPopover>
                <OfferingAcceptButton
                  onClick={() => handleSelect(dreamsign)}
                  testId={`dreamsign-draft-select-${triggerId}`}
                >
                  Select
                </OfferingAcceptButton>
              </motion.div>
            );
          })}
        </OfferingGrid>
      )}

      <OfferingFooter>
        <OfferingSkipButton
          onClick={handleSkip}
          title="Skips this offering. Every shown Dreamsign is removed from this run's pool."
        >
          Skip (discards the shown Dreamsigns)
        </OfferingSkipButton>
      </OfferingFooter>
    </OfferingScreenLayout>
  );
}

/**
 * Purge overlay shown when the player accepts a dreamsign at the cap. Uses
 * the offering palette but switches the primary border tone to red so the
 * destructive intent reads at a glance.
 */
function DreamsignPurgeOverlay({
  maxDreamsigns,
  pendingDreamsign,
  currentDreamsigns,
  onPurge,
  onCancel,
}: {
  readonly maxDreamsigns: number;
  readonly pendingDreamsign: Dreamsign | null;
  readonly currentDreamsigns: readonly Dreamsign[];
  readonly onPurge: (index: number) => void;
  readonly onCancel: () => void;
}) {
  return (
    <motion.div
      className="flex min-h-full flex-col items-center px-4 py-6 md:px-8 md:py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <h2
        className="mb-2 text-2xl font-bold"
        style={{ color: "#ef4444" }}
      >
        Dreamsign Limit Reached
      </h2>
      <p className="mb-6 text-sm opacity-70">
        You have {String(maxDreamsigns)} dreamsigns. Remove one to accept
        the new dreamsign.
      </p>

      {pendingDreamsign && (
        <div className="mb-6">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-wider opacity-50">
            New Dreamsign
          </p>
          <OfferingCardFrame>
            <OfferingDreamsignBody dreamsign={pendingDreamsign} />
          </OfferingCardFrame>
        </div>
      )}

      <p className="mb-3 text-xs font-bold uppercase tracking-wider opacity-50">
        Select one to remove
      </p>
      <div className="grid max-w-3xl grid-cols-3 gap-3 md:grid-cols-4">
        {currentDreamsigns.map((sign, index) => (
          <button
            key={`purge-${sign.name}-${String(index)}`}
            className="cursor-pointer rounded-lg p-2 text-left transition-colors"
            style={{
              background: "rgba(239, 68, 68, 0.05)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
            onClick={() => onPurge(index)}
          >
            <span className="text-xs font-bold text-slate-200">
              {sign.name}
            </span>
          </button>
        ))}
      </div>

      <button
        className="mt-6 rounded-lg px-6 py-2.5 text-base font-medium transition-colors"
        style={{
          background: OFFERING_NEUTRAL.background,
          border: `1px solid ${OFFERING_NEUTRAL.border}`,
          color: OFFERING_NEUTRAL.text,
        }}
        onClick={onCancel}
      >
        Cancel
      </button>
    </motion.div>
  );
}
