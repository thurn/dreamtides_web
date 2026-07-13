import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { logEvent, logEventOnce } from "../../logging";
import { EssenceGlyph } from "../../cumulus/components/hud/EssenceValue";
import { buttonVariant, typography } from "../design-tokens";

// L-3 exception (bug-090): this module is a pure UI surface that only knows
// `battleId` (plus reward-specific payloads). It does not receive a
// `BattleMutableState` and therefore cannot populate the full L-3 common
// field set (`turnNumber`, `phase`, `activeSide`, `sourceSurface`,
// `selectedCardId`). The paired `battle_proto_completion_applied` emitted
// from the battle-completion-bridge carries the authoritative `battleId`;
// reward-surface events are decorative and include only what the surface
// can observe.

function EssenceCountUp({ target, duration }: { target: number; duration: number }) {
  const [value, setValue] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return (
    <span
      className="text-3xl font-bold tabular-nums md:text-4xl"
      style={{ color: "var(--color-essence)", whiteSpace: "nowrap" }}
      data-battle-reward-essence-value=""
    >
      +{String(value)}
      <EssenceGlyph />
    </span>
  );
}

export function BattleRewardSurface({
  battleId,
  canCancel,
  enemyName,
  essenceReward,
  playerScore,
  enemyScore,
  rewardSource,
  turnNumber,
  isLocked,
  onCancel,
  onContinue,
}: {
  battleId: string;
  canCancel: boolean;
  enemyName?: string | null;
  essenceReward: number;
  playerScore?: number | null;
  enemyScore?: number | null;
  rewardSource: string;
  turnNumber?: number | null;
  isLocked: boolean;
  onCancel: () => void;
  onContinue: () => void;
}) {
  useEffect(() => {
    logEventOnce(
      `battle_proto_reward_opened:${battleId}`,
      "battle_proto_reward_opened",
      {
        battleId,
        essenceReward,
        rewardSource,
      },
    );
  }, [battleId, essenceReward, rewardSource]);

  useEffect(() => {
    // bug-112 / spec §H-12: Escape cancels the reward composite so the surface
    // is round-trippable with the rest of the history envelope. Gate on
    // canCancel so a finalised selection cannot be undone by a stray
    // keystroke during the post-selection handoff delay.
    if (!canCancel) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      logEvent("battle_proto_reward_cancelled", {
        battleId,
        rewardSource,
        via: "escape",
      });
      onCancel();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [battleId, canCancel, onCancel, rewardSource]);

  function handleCancelClick(): void {
    if (!canCancel) {
      return;
    }

    logEvent("battle_proto_reward_cancelled", {
      battleId,
      rewardSource,
      via: "button",
    });
    onCancel();
  }

  function handleContinueClick(): void {
    if (isLocked) {
      return;
    }
    logEvent("battle_proto_reward_continued", {
      battleId,
      essenceReward,
      rewardSource,
    });
    onContinue();
  }

  const summaryParts: string[] = [];
  if (typeof playerScore === "number" && typeof enemyScore === "number") {
    summaryParts.push(`${String(playerScore)}-${String(enemyScore)}`);
  }
  if (typeof turnNumber === "number" && turnNumber > 0) {
    summaryParts.push(`${String(turnNumber)} turn${turnNumber === 1 ? "" : "s"}`);
  }

  return (
    <motion.div
      data-battle-reward-surface=""
      // FIND-08-8 / FIND-08-9: the reward surface is a true topmost modal so
      // its cancel / continue controls remain reachable above the inspector
      // and other floating battle chrome.
      className="fixed inset-0 z-[70] flex min-h-screen flex-col items-center justify-center overflow-y-auto bg-slate-950/94 px-4 py-6 md:px-8 md:py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {canCancel ? (
        <div className="absolute right-4 top-4 md:right-8 md:top-6">
          <button
            type="button"
            data-battle-reward-action="cancel"
            aria-label="Cancel reward and return to battle"
            className={buttonVariant("secondary")}
            onClick={handleCancelClick}
          >
            Cancel (Undo)
          </button>
        </div>
      ) : null}
      <motion.h1
        className="mb-3 text-center text-4xl font-extrabold tracking-wide md:text-5xl"
        style={{
          // FIND-08-16: solid-color fallback that keeps the victory mood
          // when the bg-clip gradient is unavailable (high-contrast mode,
          // screen-reader / copy-paste, some render layers).
          color: "#fbbf24",
          background: "linear-gradient(135deg, #fbbf24 0%, #d4a017 50%, #f59e0b 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          filter: "drop-shadow(0 0 30px rgba(251, 191, 36, 0.4))",
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
      >
        Victory!
      </motion.h1>

      {/* FIND-08-5: final-score summary (player-score/enemy-score in N
          turns vs. enemy name). Rendered inline under the headline. */}
      {(enemyName ?? null) !== null || summaryParts.length > 0 ? (
        <motion.p
          data-battle-reward-summary=""
          className={`mb-3 text-center ${typography.body} text-slate-300`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          {enemyName === null || enemyName === undefined
            ? summaryParts.join(" · ")
            : summaryParts.length === 0
              ? `Defeated ${enemyName}`
              : `Defeated ${enemyName} · ${summaryParts.join(" · ")}`}
        </motion.p>
      ) : null}

      <motion.div
        // Essence reward callout: a purple-tinted capsule that wraps the
        // count-up value. The number is glued to the crypto glyph that marks
        // essence everywhere in the prototype, so the reward reads as a
        // currency value.
        data-battle-reward-essence-callout=""
        className="mb-6 flex flex-col items-center gap-2 rounded-md px-8 py-3"
        style={{
          background: "var(--color-essence-bg)",
          border: "1px solid var(--color-essence-border)",
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <span
          className={`${typography.caption} font-semibold uppercase tracking-[0.22em]`}
          style={{ color: "var(--color-essence)" }}
        >
          Essence Earned
        </span>
        <div className="flex items-center gap-2">
          <EssenceCountUp target={essenceReward} duration={800} />
        </div>
      </motion.div>

      <motion.div
        data-battle-reward-continue-bar=""
        className="flex items-center justify-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <button
          type="button"
          data-battle-reward-action="continue"
          className={buttonVariant("primary")}
          disabled={isLocked}
          onClick={handleContinueClick}
        >
          Continue
        </button>
      </motion.div>
    </motion.div>
  );
}
