import { motion } from "framer-motion";
import type { SiteState } from "../types/quest";
import { rewardPreviewLabel, siteTypeIcon, siteTypeName } from "../atlas/atlas-generator";
import { draftSitePickCount } from "../draft/draft-site-config";

interface SiteCardProps {
  site: SiteState;
  isLocked: boolean;
  completionLevel: number;
  biomeColor: string;
  remainingSitesToUnlockBattle: number;
  onSiteClick: (siteId: string) => void;
}

/** Returns the battle label based on completion level. */
function battleLabel(completionLevel: number): string {
  if (completionLevel === 6) return "Final Boss";
  if (completionLevel === 3) return "Miniboss";
  return "Battle";
}

/** Returns border color for battle sites based on completion level. */
function battleBorderColor(completionLevel: number): string {
  if (completionLevel === 6) return "#fbbf24";
  if (completionLevel === 3) return "#ef4444";
  return "rgba(124, 58, 237, 0.5)";
}

/** Renders a single site as a clickable card within the dreamscape view. */
export function SiteCard({
  site,
  isLocked,
  completionLevel,
  biomeColor,
  remainingSitesToUnlockBattle,
  onSiteClick,
}: SiteCardProps) {
  const isBattle = site.type === "Battle";
  const isInteractive = !site.isVisited && !isLocked;

  const handleClick = () => {
    if (isInteractive) {
      onSiteClick(site.id);
    }
  };

  const icon = siteTypeIcon(site.type);
  const label = isBattle
    ? battleLabel(completionLevel)
    : site.type === "Draft"
      ? `Draft ${String(draftSitePickCount(site))}x`
      : siteTypeName(site.type);

  // Border styling
  let borderColor = "rgba(124, 58, 237, 0.3)";
  if (isBattle) {
    borderColor = isLocked ? "rgba(107, 114, 128, 0.4)" : battleBorderColor(completionLevel);
  } else if (site.isVisited) {
    borderColor = "rgba(107, 114, 128, 0.3)";
  } else if (site.isEnhanced) {
    borderColor = biomeColor;
  }

  // Background styling
  let background = "rgba(26, 16, 37, 0.6)";
  if (site.isVisited) {
    background = "rgba(20, 14, 30, 0.4)";
  } else if (isBattle && !isLocked) {
    const battleColor = battleBorderColor(completionLevel);
    background = `linear-gradient(135deg, rgba(26, 16, 37, 0.8) 0%, ${battleColor}15 100%)`;
  } else if (site.isEnhanced) {
    background = `linear-gradient(135deg, rgba(26, 16, 37, 0.8) 0%, ${biomeColor}15 100%)`;
  }

  // Opacity for visited/locked states
  const opacity = site.isVisited ? 0.5 : isLocked ? 0.6 : 1;

  return (
    <motion.button
      className="relative flex w-full items-center gap-4 rounded-lg px-4 py-3 text-left transition-colors md:px-6 md:py-4"
      style={{
        border: `2px solid ${borderColor}`,
        background,
        opacity,
      }}
      onClick={handleClick}
      disabled={!isInteractive}
      whileHover={isInteractive ? { scale: 1.02 } : undefined}
      whileTap={isInteractive ? { scale: 0.98 } : undefined}
      layout
    >
      {/* Site type icon */}
      <span className="text-2xl md:text-3xl" style={{ filter: site.isVisited ? "grayscale(1)" : "none" }}>
        {icon}
      </span>

      {/* Site info */}
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-bold md:text-base"
            style={{ color: site.isVisited ? "#6b7280" : "#e2e8f0" }}
          >
            {label}
          </span>

          {/* Enhanced indicator */}
          {site.isEnhanced && !site.isVisited && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold md:text-xs"
              style={{
                background: `${biomeColor}20`,
                color: biomeColor,
                border: `1px solid ${biomeColor}40`,
              }}
            >
              {"\u2B50"} Enhanced
            </span>
          )}
        </div>

        {/* Site type subtext for battle */}
        {isBattle && isLocked && (
          <span className="text-xs opacity-50">
            {remainingSitesToUnlockBattle === 1
              ? "Complete 1 remaining site to unlock"
              : `Complete ${String(remainingSitesToUnlockBattle)} remaining sites to unlock`}
          </span>
        )}
        {/* Reward preview */}
        {rewardPreviewLabel(site) !== null && !site.isVisited && (
          <span
            className="text-xs font-medium"
            style={{ color: "#fbbf24" }}
          >
            {rewardPreviewLabel(site)}
          </span>
        )}
      </div>

      {/* Right side: status indicators */}
      <div className="flex items-center">
        {site.isVisited && (
          <span
            className="text-lg font-bold md:text-xl"
            style={{ color: "#10b981" }}
          >
            {"\u2713"}
          </span>
        )}
        {isLocked && !site.isVisited && (
          <span className="text-lg opacity-50 md:text-xl">
            {"\uD83D\uDD12"}
          </span>
        )}
      </div>

      {/* Unlock pulse animation for battle site when it becomes available */}
      {isBattle && !isLocked && !site.isVisited && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-lg"
          style={{
            border: `2px solid ${battleBorderColor(completionLevel)}`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}
    </motion.button>
  );
}
