import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Dreamsign, SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import { Dreamsign as DreamsignEntity } from "../tango/components/hud/Dreamsign";
import { EssenceGlyph } from "../tango/components/hud/EssenceValue";
import { RulesText } from "../tango/components/card/RulesText";

/** Props for the RewardSiteScreen component. */
interface RewardSiteScreenProps {
  site: SiteState;
}

/**
 * Displays the Dreamsign Reward site: a known Dreamsign drawn from the run's
 * shared pool with accept/decline buttons. Accepting at the 12-Dreamsign cap
 * opens a purge overlay so the player can replace an existing Dreamsign,
 * matching the other Dreamsign acquisition paths.
 */
export function RewardSiteScreen({ site }: RewardSiteScreenProps) {
  const { state, mutations } = useQuest();
  const { dreamsigns: currentDreamsigns, maxDreamsigns } = state;
  const runtime = state.siteRuntime[site.id];
  const rewardRuntime = runtime?.kind === "reward" ? runtime : null;
  const rewardData = rewardRuntime?.reward ?? null;
  const remainingDreamsignPoolKey = state.remainingDreamsignPool.join("\u0000");

  const [purging, setPurging] = useState(false);

  useEffect(() => {
    if (runtime === undefined) {
      mutations.ensureRewardSiteRuntime(site.id);
    }
  }, [
    mutations,
    remainingDreamsignPoolKey,
    runtime,
    site.id,
  ]);

  useEffect(() => {
    if (rewardData === null) {
      return;
    }

    logEvent("site_entered", {
      siteType: "Reward",
      isEnhanced: site.isEnhanced,
      rewardType: rewardData.rewardType,
    });
  }, [rewardData, rewardData?.rewardType, site.isEnhanced]);

  const completeSite = useCallback(() => {
    mutations.completeSite(site.id, "reward_site");
  }, [site, mutations]);

  const handleAccept = useCallback(() => {
    if (rewardData === null) {
      return;
    }
    if (
      rewardData.rewardType === "dreamsign" &&
      currentDreamsigns.length >= maxDreamsigns
    ) {
      setPurging(true);
      return;
    }
    mutations.acceptRewardSite(site.id);
  }, [currentDreamsigns.length, mutations, rewardData, site.id]);

  const handlePurge = useCallback(
    (index: number) => {
      mutations.acceptRewardSite(site.id, index);
      setPurging(false);
    },
    [mutations, site.id],
  );

  const handleDecline = useCallback(() => {
    if (rewardData === null) {
      return;
    }
    logEvent("reward_declined", {
      rewardType: rewardData.rewardType,
    });
    completeSite();
  }, [rewardData, completeSite]);

  if (rewardData === null) {
    return (
      <div className="flex min-h-full items-center justify-center p-8 text-sm opacity-70">
        Revealing reward...
      </div>
    );
  }

  if (purging && rewardData.rewardType === "dreamsign") {
    return (
      <motion.div
        className="flex min-h-full flex-col items-center px-4 py-6 md:px-8 md:py-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="mb-2 text-2xl font-bold" style={{ color: "#ef4444" }}>
          Dreamsign Limit Reached
        </h2>
        <p className="mb-6 text-sm opacity-70">
          You have {String(maxDreamsigns)} dreamsigns. Remove one to accept
          the new dreamsign.
        </p>

        <div className="mb-6">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-wider opacity-50">
            New Dreamsign
          </p>
          <DreamsignRewardDisplay dreamsign={rewardData.dreamsign} />
        </div>

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
          }}
        >
          Cancel
        </button>
      </motion.div>
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
          Dreamsign Reward
        </h2>
        <p className="mt-1 text-sm opacity-50">
          A known dreamsign from the dreamscape awaits
        </p>
      </div>

      {/* Reward display */}
      <motion.div
        className="mb-8 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        {rewardData.rewardType === "dreamsign" ? (
          <DreamsignRewardDisplay dreamsign={rewardData.dreamsign} />
        ) : (
          <EssenceRewardDisplay amount={rewardData.essenceAmount} />
        )}
      </motion.div>

      {/* Action buttons */}
      <div className="flex gap-4">
        <motion.button
          className="rounded-lg px-8 py-3 text-lg font-bold text-white transition-opacity"
          style={{
            background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
            boxShadow: "0 0 20px rgba(124, 58, 237, 0.3)",
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleAccept}
        >
          Accept
        </motion.button>
        <button
          className="rounded-lg px-8 py-3 text-lg font-medium transition-colors"
          style={{
            background: "rgba(107, 114, 128, 0.2)",
            border: "1px solid rgba(107, 114, 128, 0.4)",
            color: "#9ca3af",
          }}
          onClick={handleDecline}
        >
          Decline
        </button>
      </div>
    </motion.div>
  );
}

/**
 * Renders a dreamsign reward. The dreamsign's artwork comes from the shared
 * `DreamsignArtTile`, so the reward site matches the shop tile, deck viewer,
 * dreamsign draft, and dreamsign offering. The tile carries its own bane
 * styling (red border + grayscale) and hover popover with the full card.
 */
function DreamsignRewardDisplay({ dreamsign }: { dreamsign: Dreamsign }) {
  return (
    <div
      data-dreamsign-reward-display=""
      className="flex w-64 flex-col items-center gap-3 rounded-xl p-6"
      style={{
        background:
          "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
        border: "1px solid rgba(168, 85, 247, 0.3)",
        boxShadow: "0 0 30px rgba(168, 85, 247, 0.12)",
      }}
    >
      <DreamsignEntity dreamsign={dreamsign} sizePx={96} />
      {dreamsign.isBane && (
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{
            background: "rgba(239, 68, 68, 0.16)",
            color: "#fecaca",
            border: "1px solid rgba(239, 68, 68, 0.35)",
          }}
        >
          Bane
        </span>
      )}
      <h3
        className="text-center text-lg font-bold"
        style={{ color: "#f8fafc" }}
      >
        {dreamsign.name}
      </h3>
      <div
        className="text-center text-sm leading-relaxed opacity-70"
        style={{ color: "#e2e8f0" }}
      >
        <RulesText text={dreamsign.effectDescription} />
      </div>
    </div>
  );
}

/** Renders an essence reward with a glowing amount display. */
function EssenceRewardDisplay({ amount }: { amount: number }) {
  return (
    <div
      data-essence-reward-display=""
      className="flex flex-col items-center gap-4 rounded-xl p-8"
      style={{
        background:
          "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
        border: "1px solid var(--color-essence-border)",
        boxShadow: "0 0 30px var(--color-essence-glow-soft)",
      }}
    >
      <p className="text-xs font-bold uppercase tracking-wider opacity-50">
        Essence Reward
      </p>
      <motion.div
        className="flex h-24 w-24 items-center justify-center rounded-full"
        style={{
          background:
            "radial-gradient(circle, var(--color-essence-glow-soft) 0%, rgba(216,180,254,0.05) 60%, transparent 100%)",
        }}
        animate={{
          boxShadow: [
            "0 0 20px rgba(216, 180, 254, 0.3)",
            "0 0 40px rgba(216, 180, 254, 0.5)",
            "0 0 20px rgba(216, 180, 254, 0.3)",
          ],
        }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <span
          className="text-4xl font-black tabular-nums"
          style={{ color: "var(--color-essence)", whiteSpace: "nowrap" }}
          data-essence-reward-value=""
        >
          +{String(amount)}
          <EssenceGlyph />
        </span>
      </motion.div>
    </div>
  );
}
