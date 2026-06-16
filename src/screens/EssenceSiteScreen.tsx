import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SiteState } from "../types/quest";
import { EssenceGlyph } from "../components/EssenceValue";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";

/** Props for the EssenceSiteScreen component. */
interface EssenceSiteScreenProps {
  site: SiteState;
}

/** Grants essence with a count-up animation and auto-completes. */
export function EssenceSiteScreen({ site }: EssenceSiteScreenProps) {
  const { state, mutations } = useQuest();
  const runtime = state.siteRuntime[site.id];
  const essenceRuntime = runtime?.kind === "essence" ? runtime : null;
  const essenceAmount = essenceRuntime?.amount ?? null;

  const [displayValue, setDisplayValue] = useState(0);
  const [phase, setPhase] = useState<"counting" | "done">("counting");

  const handleComplete = useCallback(() => {
    if (essenceRuntime === null || essenceRuntime.accepted) {
      return;
    }
    mutations.acceptEssenceSite(site.id);
  }, [essenceRuntime, site, mutations]);

  useEffect(() => {
    if (runtime === undefined) {
      mutations.ensureEssenceSiteRuntime(site.id, site.isEnhanced);
    }
  }, [mutations, runtime, site.id, site.isEnhanced]);

  // Count-up animation
  useEffect(() => {
    if (essenceAmount === null) {
      return;
    }

    const duration = 800;
    const steps = 20;
    const interval = duration / steps;
    let step = 0;

    const timer = setInterval(() => {
      step += 1;
      const progress = step / steps;
      setDisplayValue(Math.round(essenceAmount * progress));

      if (step >= steps) {
        clearInterval(timer);
        setDisplayValue(essenceAmount);
        setPhase("done");
      }
    }, interval);

    return () => clearInterval(timer);
  }, [essenceAmount]);

  // Log site entry once on mount
  useEffect(() => {
    if (essenceAmount === null) {
      return;
    }

    logEvent("site_entered", {
      siteType: "Essence",
      isEnhanced: site.isEnhanced,
    });
  }, [essenceAmount, site.isEnhanced]);

  // Auto-complete after animation finishes
  useEffect(() => {
    if (phase !== "done") return;
    const timer = setTimeout(handleComplete, 600);
    return () => clearTimeout(timer);
  }, [phase, handleComplete]);

  if (essenceAmount === null) {
    return (
      <div className="flex min-h-full items-center justify-center p-8 text-sm opacity-70">
        Gathering essence...
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        className="flex min-h-full flex-col items-center justify-center gap-6 p-8"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        {/* Essence particle effect: the purple currency glow pulses
            around the count-up number so the surface reads as
            essence at a glance. */}
        <motion.div
          data-essence-site-glow=""
          className="relative flex h-32 w-32 items-center justify-center"
          animate={{
            boxShadow: [
              "0 0 20px rgba(216, 180, 254, 0.3)",
              "0 0 60px rgba(216, 180, 254, 0.6)",
              "0 0 20px rgba(216, 180, 254, 0.3)",
            ],
          }}
          transition={{ duration: 1.2, repeat: Infinity }}
          style={{
            borderRadius: "50%",
            background:
              "radial-gradient(circle, var(--color-essence-glow-soft) 0%, rgba(216,180,254,0.05) 60%, transparent 100%)",
          }}
        >
          <motion.span
            className="text-5xl font-black tabular-nums"
            style={{ color: "var(--color-essence)", whiteSpace: "nowrap" }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.6, repeat: Infinity }}
            data-essence-site-value=""
          >
            +{String(displayValue)}
            <EssenceGlyph />
          </motion.span>
        </motion.div>

        {site.isEnhanced && (
          <motion.span
            className="rounded-full px-3 py-1 text-sm font-bold"
            style={{
              background: "rgba(168, 85, 247, 0.15)",
              color: "#c084fc",
              border: "1px solid rgba(168, 85, 247, 0.3)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Enhanced
          </motion.span>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
