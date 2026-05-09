import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import {
  TEMPTING_OFFERS,
  type OfferEffect,
  type TemptingOffer,
} from "../data/tempting-offers";

/** Props for the TemptingOfferScreen component. */
interface TemptingOfferScreenProps {
  site: SiteState;
}

/** Describes an offer effect for logging. */
function describeOfferEffect(effect: OfferEffect): string {
  switch (effect.type) {
    case "addEssence":
      return `+${String(effect.amount)} essence`;
    case "addRandomCards":
      return `+${String(effect.count)} card${effect.count === 1 ? "" : "s"}`;
    case "addBaneCards":
      return `+${String(effect.count)} bane card${effect.count === 1 ? "" : "s"}`;
    case "removeEssence":
      return `-${String(effect.amount)} essence`;
    case "removeDreamsign":
      return "Lose 1 random dreamsign";
    case "reduceMaxDreamsigns":
      return `-${String(effect.amount)} max dreamsign capacity`;
    case "removeRandomCards":
      return `-${String(effect.count)} random card${effect.count === 1 ? "" : "s"}`;
    case "addDreamsign":
      return "+1 random dreamsign";
  }
}

/** Shows 2 (or 3 enhanced) benefit/cost pairs. Accept one or skip. */
export function TemptingOfferScreen({ site }: TemptingOfferScreenProps) {
  const { state, mutations } = useQuest();
  const runtime = state.siteRuntime[site.id];
  const temptingOfferRuntime =
    runtime !== undefined && runtime.kind === "temptingOffer" ? runtime : null;

  const pairCount = site.isEnhanced ? 3 : 2;

  const offers = useMemo<Array<{ optionId: string; offer: TemptingOffer }>>(
    () =>
      temptingOfferRuntime === null
        ? []
        : temptingOfferRuntime.optionIds.flatMap((optionId) => {
          const match = /^offer-(\d+)$/.exec(optionId);
          const offer =
            match === null ? undefined : TEMPTING_OFFERS[Number(match[1])];
          return offer === undefined ? [] : [{ optionId, offer }];
        }),
    [temptingOfferRuntime],
  );

  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    if (runtime === undefined) {
      mutations.ensureTemptingOfferRuntime(site.id);
    }
  }, [mutations, runtime, site.id]);

  useEffect(() => {
    logEvent("site_entered", {
      siteType: "TemptingOffer",
      isEnhanced: site.isEnhanced,
      pairCount,
    });
  }, [site.isEnhanced, pairCount]);

  const handleAccept = useCallback(
    (optionId: string, offer: TemptingOffer) => {
      setResultMessage(
        `${describeOfferEffect(offer.benefit)} / ${describeOfferEffect(offer.cost)}`,
      );
      mutations.completeTemptingOfferOption(site.id, optionId);
    },
    [mutations, site.id],
  );

  const handleSkip = useCallback(() => {
    mutations.completeSite(site.id, "tempting_offer_skipped");
  }, [mutations, site.id]);

  if (runtime === undefined) {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-6">
        <p className="text-lg opacity-60">Revealing offer...</p>
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
          style={{ color: "#ef4444" }}
        >
          Tempting Offer
        </h2>
        <p className="mt-1 text-sm opacity-50">
          Accept a bargain or walk away
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
            Enhanced -- 3 Offers
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
                border: "1px solid rgba(239, 68, 68, 0.4)",
                boxShadow: "0 0 30px rgba(239, 68, 68, 0.2)",
              }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <p className="text-xl font-bold" style={{ color: "#fca5a5" }}>
                {resultMessage}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offer pairs */}
      <div className="flex w-full max-w-3xl flex-col gap-4">
        {offers.map(({ optionId, offer }, index) => (
          <motion.div
            key={`offer-${String(index)}`}
            className="flex flex-col gap-3 rounded-xl p-4"
            style={{
              background:
                "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
              border: "1px solid rgba(107, 114, 128, 0.2)",
            }}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.15, duration: 0.4 }}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
              {/* Benefit */}
              <div
                className="flex flex-1 flex-col gap-2 rounded-lg p-3"
                style={{
                  background: "rgba(16, 185, 129, 0.05)",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: "#10b981" }}
                >
                  Benefit
                </span>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "#a7f3d0" }}
                >
                  {offer.benefitDescription}
                </p>
              </div>

              {/* Cost */}
              <div
                className="flex flex-1 flex-col gap-2 rounded-lg p-3"
                style={{
                  background: "rgba(239, 68, 68, 0.05)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                }}
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: "#ef4444" }}
                >
                  Cost
                </span>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "#fca5a5" }}
                >
                  {offer.costDescription}
                </p>
              </div>
            </div>

            {/* Accept button */}
            <button
              className="w-full rounded-lg px-5 py-2.5 font-bold text-white transition-opacity"
              style={{
                background:
                  "linear-gradient(135deg, #7c3aed 0%, #ef4444 100%)",
              }}
              disabled={resultMessage !== null}
              onClick={() => handleAccept(optionId, offer)}
            >
              Accept Offer
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
