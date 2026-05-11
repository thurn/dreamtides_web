import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Dreamsign, SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import { DreamsignHoverCard } from "../components/DreamsignHoverCard";
import { HoverPopover } from "../components/HoverPopover";
import { RulesText } from "../components/RulesText";
import { DreamsignSourceOverlay } from "./DreamsignSourceOverlay";

const MAX_DREAMSIGNS = 12;
/**
 * Delay before showing the full-Dreamsign hover popover on an offering /
 * draft card. Tighter than the glossary-tooltip default (500ms) because
 * players are scanning a short list of dreamsigns and want quick previews
 * while moving across them.
 */
const DREAMSIGN_HOVER_DELAY_MS = 300;

/** Props for the DreamsignDraftScreen component. */
interface DreamsignDraftScreenProps {
  site: SiteState;
}

/** Shows 3 (or 4 enhanced) dreamsign options. Pick 1 or skip. */
export function DreamsignDraftScreen({ site }: DreamsignDraftScreenProps) {
  const { state, mutations, questContent } = useQuest();
  const { dreamsigns: currentDreamsigns } = state;

  const optionCount = site.isEnhanced ? 4 : 3;
  const runtime = state.siteRuntime[site.id];
  const offerRuntime = runtime?.kind === "dreamsignOffer" ? runtime : null;
  const options = offerRuntime?.offeredDreamsigns ?? null;
  const resolvedPackage = state.resolvedPackage;
  const remainingPoolSize =
    offerRuntime?.remainingDreamsignPool.length
    ?? state.remainingDreamsignPool.length;
  const remainingDreamsignPoolKey = state.remainingDreamsignPool.join("\u0000");

  const [purging, setPurging] = useState(false);
  const [pendingDreamsign, setPendingDreamsign] = useState<Dreamsign | null>(
    null,
  );
  const [sourceOverlayOpen, setSourceOverlayOpen] = useState(false);

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
      siteType: "DreamsignDraft",
      isEnhanced: site.isEnhanced,
      optionCount,
    });
  }, [site.isEnhanced, optionCount, options]);

  const completeSite = useCallback(() => {
    mutations.completeSite(site.id, "dreamsign_draft");
  }, [site, mutations]);

  const handleSelect = useCallback(
    (dreamsign: Dreamsign) => {
      if (currentDreamsigns.length >= MAX_DREAMSIGNS) {
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
          You have {String(MAX_DREAMSIGNS)} dreamsigns. Remove one to accept
          the new dreamsign.
        </p>

        {pendingDreamsign && (
          <div className="mb-6">
            <p className="mb-2 text-center text-xs font-bold uppercase tracking-wider opacity-50">
              New Dreamsign
            </p>
            <DreamsignCard dreamsign={pendingDreamsign} />
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
              onClick={() => handlePurge(index)}
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
            background: "rgba(107, 114, 128, 0.2)",
            border: "1px solid rgba(107, 114, 128, 0.4)",
            color: "#9ca3af",
          }}
          onClick={() => {
            setPurging(false);
            setPendingDreamsign(null);
          }}
        >
          Cancel
        </button>
      </motion.div>
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
    <motion.div
      className="flex min-h-full flex-col items-center px-4 py-6 md:px-8 md:py-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="mb-6 text-center">
        <h2
          className="text-2xl font-bold tracking-wide md:text-3xl"
          style={{ color: "#a855f7" }}
        >
          Dreamsign Draft
        </h2>
        <p className="mt-1 text-sm opacity-50">
          Choose one dreamsign or skip
        </p>
        {site.isEnhanced && (
          <span
            className="mt-2 inline-block rounded-full px-3 py-1 text-sm font-bold"
            style={{
              background: "rgba(168, 85, 247, 0.15)",
              color: "#c084fc",
              border: "1px solid rgba(168, 85, 247, 0.3)",
            }}
          >
            Enhanced -- 4 Options
          </span>
        )}
      </div>

      {/* Dreamsign options */}
      {options.length === 0 ? (
        <p className="text-sm opacity-60">
          The Dreamsign pool is exhausted.
        </p>
      ) : (
        <div className="flex max-w-4xl flex-wrap justify-center gap-5">
          {options.map((dreamsign, index) => {
            const triggerId = dreamsign.id ?? dreamsign.name;
            return (
              <motion.div
                key={`draft-${dreamsign.name}`}
                className="flex flex-col items-center gap-3"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.12, duration: 0.4 }}
              >
                <HoverPopover
                  triggerAs="div"
                  delayMs={DREAMSIGN_HOVER_DELAY_MS}
                  maxWidthPx={null}
                  content={<DreamsignHoverCard dreamsign={dreamsign} />}
                >
                  <div
                    data-testid={`dreamsign-draft-hover-trigger-${triggerId}`}
                    tabIndex={0}
                    aria-label={`Dreamsign: ${dreamsign.name}`}
                    className="outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                  >
                    <DreamsignCard dreamsign={dreamsign} />
                  </div>
                </HoverPopover>
                <button
                  className="w-full rounded-lg px-5 py-2.5 font-bold text-white transition-opacity"
                  style={{ backgroundColor: "#7c3aed" }}
                  onClick={() => handleSelect(dreamsign)}
                >
                  Select
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Footer toolbar: Skip + Why Dreamsigns? */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          className="rounded-lg px-6 py-2.5 text-base font-medium transition-colors"
          style={{
            background: "rgba(148, 163, 184, 0.18)",
            border: "1px solid rgba(203, 213, 225, 0.55)",
            color: "#e2e8f0",
          }}
          onClick={handleSkip}
          title="Skips this offering. Both shown Dreamsigns are removed from this run's pool."
        >
          Skip (discards both Dreamsigns)
        </button>
        <button
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          style={{
            background: "rgba(168, 85, 247, 0.14)",
            border: "1px solid rgba(168, 85, 247, 0.35)",
            color: "#d8b4fe",
          }}
          onClick={() => {
            setSourceOverlayOpen(true);
          }}
        >
          Why Dreamsigns?
        </button>
      </div>

      <DreamsignSourceOverlay
        isOpen={sourceOverlayOpen}
        onClose={() => {
          setSourceOverlayOpen(false);
        }}
        screenLabel="Dreamsign Draft"
        offeredDreamsigns={options}
        dreamsignTemplates={questContent.dreamsignTemplates}
        mandatoryTides={resolvedPackage?.mandatoryTides ?? []}
        optionalTides={resolvedPackage?.optionalSubset ?? []}
        remainingPoolSize={remainingPoolSize}
      />
    </motion.div>
  );
}

/** Renders a dreamsign card with image, name and effect description. */
function DreamsignCard({ dreamsign }: { dreamsign: Dreamsign }) {
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = Boolean(dreamsign.imageName) && !imageBroken;
  return (
    <div
      className="flex w-52 flex-1 flex-col items-center gap-2 rounded-lg p-4"
      style={{
        background:
          "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
        border: "1px solid rgba(168, 85, 247, 0.35)",
        boxShadow: "0 0 12px rgba(168, 85, 247, 0.16)",
      }}
    >
      {showImage && (
        <img
          src={`/dreamsigns/${String(dreamsign.imageName)}`}
          alt={dreamsign.imageAlt ?? dreamsign.name}
          className="h-20 w-20 object-contain"
          style={{ filter: "drop-shadow(0 2px 6px rgba(168, 85, 247, 0.25))" }}
          onError={() => {
            setImageBroken(true);
          }}
        />
      )}
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
        style={{
          background: "rgba(168, 85, 247, 0.16)",
          color: "#c4b5fd",
          border: "1px solid rgba(168, 85, 247, 0.35)",
        }}
      >
        Dreamsign
      </span>
      <h3
        className="text-center text-sm font-bold"
        style={{ color: "#f8fafc" }}
      >
        {dreamsign.name}
      </h3>
      <p
        className="text-center text-xs leading-relaxed opacity-70"
        style={{ color: "#e2e8f0" }}
      >
        <RulesText text={dreamsign.effectDescription} />
      </p>
    </div>
  );
}
