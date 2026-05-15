import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import { DREAM_JOURNEYS, type JourneyEffect, type DreamJourney } from "../data/dream-journeys";

/** Props for the DreamJourneyScreen component. */
interface DreamJourneyScreenProps {
  site: SiteState;
}

/** Describes the result of a journey effect for the result message. */
function describeEffect(effect: JourneyEffect): string {
  switch (effect.type) {
    case "addEssence":
      return `Gained ${String(effect.amount)} essence`;
    case "removeEssence":
      return `Lost ${String(effect.amount)} essence`;
    case "removeRandomCards":
      return `Lost ${String(effect.count)} cards`;
    case "addRandomCards":
      return `Gained ${String(effect.count)} card${effect.count === 1 ? "" : "s"}`;
    case "addEssenceAndRemoveCards":
      return `Gained ${String(effect.essenceAmount)} essence, lost ${String(effect.removeCount)} cards`;
    case "removeCardsAndAddRandomCards":
      return `Lost ${String(effect.removeCount)} cards, gained ${String(effect.addCount)} card${effect.addCount === 1 ? "" : "s"}`;
    case "upgradeRandomCards":
      return `Upgraded ${String(effect.count)} cards`;
    case "addBaneCards":
      return `Gained ${String(effect.count)} bane card${effect.count === 1 ? "" : "s"}`;
    case "addEssenceAndAddBaneCards":
      return `Gained ${String(effect.essenceAmount)} essence and ${String(effect.baneCount)} bane card${effect.baneCount === 1 ? "" : "s"}`;
    case "addRandomCardsAndAddBaneCards":
      return `Gained ${String(effect.addCount)} card${effect.addCount === 1 ? "" : "s"} and ${String(effect.baneCount)} bane card${effect.baneCount === 1 ? "" : "s"}`;
    case "reduceMaxDreamsigns":
      return `Maximum dreamsigns reduced by ${String(effect.amount)}`;
  }
}

/** Shows 2 (or 3 enhanced) journey options. Choose one or skip. */
export function DreamJourneyScreen({ site }: DreamJourneyScreenProps) {
  const { state, mutations } = useQuest();
  const runtime = state.siteRuntime[site.id];
  const dreamJourneyRuntime =
    runtime !== undefined && runtime.kind === "dreamJourney" ? runtime : null;

  const optionCount = site.isEnhanced ? 3 : 2;

  const options = useMemo<DreamJourney[]>(
    () =>
      dreamJourneyRuntime === null ? [] : DREAM_JOURNEYS.slice(0, optionCount),
    [dreamJourneyRuntime, optionCount],
  );

  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    if (runtime === undefined) {
      mutations.ensureDreamJourneyRuntime(site.id);
    }
  }, [mutations, runtime, site.id]);

  useEffect(() => {
    logEvent("site_entered", {
      siteType: "DreamJourney",
      isEnhanced: site.isEnhanced,
      optionCount,
    });
  }, [site.isEnhanced, optionCount]);

  const handleChoose = useCallback(
    (journey: DreamJourney) => {
      const message = describeEffect(journey.effect);
      setResultMessage(message);
      mutations.completeDreamJourneyOption(site.id, journey.name);
    },
    [mutations, site.id],
  );

  const handleSkip = useCallback(() => {
    mutations.completeSite(site.id, "dream_journey_skipped");
  }, [mutations, site.id]);

  if (dreamJourneyRuntime === null) {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-6">
        <p className="text-lg opacity-60">Revealing journey...</p>
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
          Dream Journey
        </h2>
        <p className="mt-1 text-sm opacity-50">
          Choose a path through the dream
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
            Enhanced -- 3 Paths
          </span>
        )}
      </div>

      {/* Result overlay */}
      <AnimatePresence>
        {resultMessage !== null && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0, 0, 0, 0.7)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="rounded-xl px-8 py-6 text-center"
              style={{
                background:
                  "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
                border: "1px solid rgba(168, 85, 247, 0.4)",
                boxShadow: "0 0 30px rgba(168, 85, 247, 0.2)",
              }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <p
                className="text-xl font-bold"
                style={{ color: "#c084fc" }}
              >
                {resultMessage}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Journey options */}
      <div className="flex max-w-4xl flex-wrap justify-center gap-6">
        {options.map((journey, index) => (
          <motion.div
            key={`journey-${journey.name}`}
            className="flex w-64 flex-col items-center gap-3"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.15, duration: 0.4 }}
          >
            <JourneyCard journey={journey} />
            <button
              className="w-full rounded-lg px-5 py-2.5 font-bold text-white transition-opacity"
              style={{ backgroundColor: "#7c3aed" }}
              disabled={resultMessage !== null}
              onClick={() => handleChoose(journey)}
            >
              Choose
            </button>
          </motion.div>
        ))}
      </div>

      {/* Skip */}
      <button
        className="mt-8 rounded-lg px-6 py-2.5 text-base font-medium transition-colors"
        style={{
          background: "rgba(107, 114, 128, 0.2)",
          border: "1px solid rgba(107, 114, 128, 0.4)",
          color: "#9ca3af",
        }}
        disabled={resultMessage !== null}
        onClick={handleSkip}
      >
        Skip
      </button>
    </motion.div>
  );
}

/** Renders a journey card with circular styling, name, and description. */
function JourneyCard({ journey }: { journey: DreamJourney }) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl p-5"
      style={{
        background:
          "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
        border: "1px solid rgba(168, 85, 247, 0.3)",
        boxShadow: "0 0 16px rgba(168, 85, 247, 0.1)",
      }}
    >
      {/* Circular icon */}
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full text-2xl"
        style={{
          background:
            "radial-gradient(circle, rgba(168, 85, 247, 0.2) 0%, rgba(168, 85, 247, 0.05) 100%)",
          border: "2px solid rgba(168, 85, 247, 0.4)",
        }}
      >
        {"\u2728"}
      </div>

      <h3
        className="text-center text-base font-bold"
        style={{ color: "#c084fc" }}
      >
        {journey.name}
      </h3>
      <p
        className="text-center text-xs leading-relaxed opacity-70"
        style={{ color: "#e2e8f0" }}
      >
        {journey.description}
      </p>
    </div>
  );
}
