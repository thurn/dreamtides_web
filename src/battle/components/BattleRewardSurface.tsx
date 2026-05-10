import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CardDisplay } from "../../components/CardDisplay";
import { logEvent, logEventOnce } from "../../logging";
import { buttonVariant, typography } from "../design-tokens";
import type { CardData, FrozenCardData } from "../../types/cards";

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
      style={{ color: "var(--color-essence)" }}
      data-battle-reward-essence-value=""
    >
      +{String(value)}
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
  rewardCards,
  rewardSource,
  selectedRewardIndex,
  turnNumber,
  onCancel,
  onSelectReward,
}: {
  battleId: string;
  canCancel: boolean;
  enemyName?: string | null;
  essenceReward: number;
  playerScore?: number | null;
  enemyScore?: number | null;
  rewardCards: readonly (CardData | FrozenCardData)[];
  rewardSource: string;
  selectedRewardIndex: number | null;
  turnNumber?: number | null;
  onCancel: () => void;
  onSelectReward: (index: number) => void;
}) {
  // FIND-08-2: two-step selection. The first click on a reward card arms
  // that card (preview + disables others + shows "Confirm Reward"). The
  // second click on the Confirm button commits.
  const [armedRewardIndex, setArmedRewardIndex] = useState<number | null>(null);

  useEffect(() => {
    logEventOnce(
      `battle_proto_reward_opened:${battleId}`,
      "battle_proto_reward_opened",
      {
        battleId,
        essenceReward,
        rewardCardNumbers: rewardCards.map((card) => card.cardNumber),
        rewardSource,
      },
    );
  }, [battleId, essenceReward, rewardCards, rewardSource]);

  useEffect(() => {
    setArmedRewardIndex(null);
  }, [battleId]);

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
      // FIND-08-2: Escape first disarms if a card is armed; only a fresh
      // Escape with no armed card cancels the reward back to battle.
      if (armedRewardIndex !== null) {
        setArmedRewardIndex(null);
        return;
      }
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
  }, [armedRewardIndex, battleId, canCancel, onCancel, rewardSource]);

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

  function handleArmReward(index: number): void {
    if (selectedRewardIndex !== null) {
      return;
    }

    setArmedRewardIndex(index);
    logEvent("battle_proto_reward_armed", {
      battleId,
      rewardCardNumber: rewardCards[index]?.cardNumber ?? null,
      rewardSource,
    });
  }

  function handleRewardKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    handleArmReward(index);
  }

  function handleConfirmReward(): void {
    if (armedRewardIndex === null || selectedRewardIndex !== null) {
      return;
    }
    const selectedCard = rewardCards[armedRewardIndex];
    if (selectedCard === undefined) {
      return;
    }

    logEvent("battle_proto_reward_selected", {
      battleId,
      rewardCardName: selectedCard.name,
      rewardCardNumber: selectedCard.cardNumber,
      rewardSource,
    });
    onSelectReward(armedRewardIndex);
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
      // its cancel / confirm controls remain reachable above the inspector and
      // other floating battle chrome.
      className="fixed inset-0 z-[70] flex min-h-screen flex-col items-center overflow-y-auto bg-slate-950/94 px-4 py-6 md:px-8 md:py-8"
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
        // Essence reward callout: a purple-tinted capsule that wraps
        // the count-up number. Essence is identified by color across
        // the prototype, so the callout does not render any currency
        // glyph alongside the number.
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
        className="w-full max-w-4xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <h2
          className="mb-4 text-center text-lg font-bold md:text-xl"
          style={{ color: "#e2e8f0" }}
        >
          {armedRewardIndex === null
            ? "Choose a Card Reward"
            : "Confirm your selection"}
        </h2>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <AnimatePresence>
            {rewardCards.map((card, index) => {
              const isArmed = armedRewardIndex === index;
              const isDismissedByArm =
                armedRewardIndex !== null && armedRewardIndex !== index;
              const isSelected = selectedRewardIndex === index;
              const isDismissedBySelect =
                selectedRewardIndex !== null && selectedRewardIndex !== index;
              const isDimmed = isDismissedByArm || isDismissedBySelect;

              return (
                <motion.button
                  key={card.cardNumber}
                  type="button"
                  // FIND-10-6 (Stage 4): each reward tile is a real <button>
                  // so Tab lands on it naturally. Enter/Space arms the card
                  // (the outer motion.button handles native button semantics;
                  // the inner CardDisplay is rendered without an onClick so
                  // it does not double-fire).
                  // FIND-10-6: explicit `role="button"` makes the tile
                  // queryable by `[role="button"]` selectors (matching the
                  // prior CardDisplay-inherited role) even though <button>
                  // carries the role implicitly.
                  role="button"
                  aria-label={`Select reward card ${card.name}`}
                  data-battle-reward-card={String(card.cardNumber)}
                  data-battle-reward-action="select"
                  data-battle-reward-armed={isArmed ? "true" : "false"}
                  disabled={selectedRewardIndex !== null && !isSelected}
                  onMouseDownCapture={() => {
                    handleArmReward(index);
                  }}
                  onKeyDownCapture={(event) => {
                    handleRewardKeyDown(event, index);
                  }}
                  onClick={() => {
                    handleArmReward(index);
                  }}
                  // FIND-08-7 / FIND-10-6 / FIND-10-12: pronounced hover +
                  // visible focus-visible ring so Tab focus and hover both
                  // read as interactive states on every reward tile.
                  className={[
                    "group relative cursor-pointer rounded-xl bg-transparent p-0 text-left transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                    !isDimmed && !isSelected
                      ? "hover:scale-[1.03] hover:shadow-[0_0_30px_rgba(251,191,36,0.35)]"
                      : "",
                    isArmed
                      ? "ring-2 ring-amber-300 shadow-[0_0_40px_rgba(251,191,36,0.5)]"
                      : "",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  ].join(" ")}
                  animate={
                    isSelected
                      ? { scale: 1.05, opacity: 1 }
                      : isDimmed
                        ? { opacity: 0.4, scale: 0.97 }
                        : isArmed
                          ? { scale: 1.04, opacity: 1 }
                          : { scale: 1, opacity: 1 }
                  }
                  transition={{ duration: 0.2 }}
                >
                  <CardDisplay
                    card={card}
                    selected={isArmed || isSelected}
                    selectionColor="#fbbf24"
                  />
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>

        {/* FIND-08-2: explicit two-step confirm button appears only once a
            reward is armed. A visible Change Selection button lets the user
            re-arm a different card. */}
        <div
          data-battle-reward-confirm-bar=""
          className="mt-5 flex min-h-[3rem] flex-wrap items-center justify-center gap-3"
        >
          {armedRewardIndex === null ? (
            <p className={`${typography.caption} text-slate-400`}>
              Click a reward to preview it, then press Confirm Reward.
            </p>
          ) : (
            <>
              <button
                type="button"
                data-battle-reward-action="change-selection"
                className={buttonVariant("secondary")}
                disabled={selectedRewardIndex !== null}
                onClick={() => setArmedRewardIndex(null)}
              >
                Change Selection
              </button>
              <button
                type="button"
                data-battle-reward-action="confirm"
                className={buttonVariant("primary")}
                disabled={selectedRewardIndex !== null}
                onClick={handleConfirmReward}
              >
                Confirm Reward
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
