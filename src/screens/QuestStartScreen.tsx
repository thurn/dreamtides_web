import { useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { useQuest } from "../state/quest-context";
import { selectDreamcallerOffer } from "../data/dreamcaller-selection";
import { selectedTides4Decks } from "../data/tides4-preview";
import { generateQuestSeed } from "../state/quest-state-actions";
import { DreamcallerPortrait } from "../components/DreamcallerPortrait";
import { HoverPopover } from "../components/HoverPopover";
import { RulesText } from "../components/RulesText";
import type { Tides4Color, Tides4DeckJson } from "../draft/pool/tides4-io";
import type { DreamcallerContent } from "../types/content";

const DREAMCALLER_ACCENT = "#c084fc";

/**
 * Per deck color, the tide chip's dark background, matching border, and the
 * white-outline Boxicons glyph that marks the color. The background is a deep
 * shade of the color and the border a brighter tint of it, so the chip reads as
 * its color while staying legible with white text and icon.
 */
const TIDE_COLOR_CHIP: Record<
  Tides4Color,
  { background: string; border: string; icon: string }
> = {
  purple: { background: "#3b1259", border: "rgba(192, 132, 252, 0.55)", icon: "bx-skull" },
  green: { background: "#0f3d22", border: "rgba(74, 222, 128, 0.55)", icon: "bx-leaf" },
  yellow: { background: "#4a3a00", border: "rgba(250, 204, 21, 0.55)", icon: "bx-shield" },
  blue: { background: "#13315c", border: "rgba(96, 165, 250, 0.55)", icon: "bx-eye-alt" },
  red: { background: "#5c1417", border: "rgba(248, 113, 113, 0.55)", icon: "bx-hot" },
};
const DREAMCALLER_HOVER_TRANSITION = { duration: 0.12, delay: 0 } as const;
const DREAMCALLER_TAP_TRANSITION = { duration: 0.08, delay: 0 } as const;
const SIGNATURE_CARDS_LABEL_HOVER_BLURB =
  "These signature cards define this Dreamcaller's strategy and steer the draft pool toward them.";
const TIDES_LABEL_HOVER_BLURB =
  "Tides are the pools of cards you will see on a quest. Different tides are used every time you play.";
/** The select screen shows at most this many tides per Dreamcaller. */
const MAX_TIDES_SHOWN = 4;

/** The total number of cards (counting copies) in a tide's decklist. */
function tideCardCount(tide: Tides4DeckJson): number {
  return tide.cards.reduce((sum, card) => sum + card.copies, 0);
}

/**
 * Cap the tides shown for a Dreamcaller at {@link MAX_TIDES_SHOWN}, keeping the
 * largest by card count. The kept tides are returned in their original order so
 * the visible list is not reshuffled by the size ranking.
 */
export function largestTides(tides: Tides4DeckJson[]): Tides4DeckJson[] {
  if (tides.length <= MAX_TIDES_SHOWN) return tides;
  const kept = new Set(
    [...tides]
      .sort((a, b) => tideCardCount(b) - tideCardCount(a))
      .slice(0, MAX_TIDES_SHOWN),
  );
  return tides.filter((tide) => kept.has(tide));
}

/** Intro screen where the player picks a dreamcaller to start the quest. */
export function QuestStartScreen() {
  const { mutations, questContent } = useQuest();

  const offeredRef = useRef<DreamcallerContent[] | null>(null);
  if (offeredRef.current === null) {
    offeredRef.current = selectDreamcallerOffer(questContent.dreamcallers);
  }
  const offered = offeredRef.current;

  // Mint the run seed now, before any pick. The `tides4` tide preview below is
  // generated from this seed, and the same seed is handed to `startQuest` so the
  // dealt pool matches the tides shown.
  const seedRef = useRef<string | null>(null);
  if (seedRef.current === null) {
    seedRef.current = generateQuestSeed();
  }
  const questSeed = seedRef.current;

  // For a `tides4` run, the tide decks each offered Dreamcaller's pool will be
  // dealt from. Empty for every other algorithm, which hides the preview.
  const tidesByDreamcaller = useMemo(() => {
    const map = new Map<string, Tides4DeckJson[]>();
    for (const dreamcaller of offered) {
      map.set(
        dreamcaller.id,
        selectedTides4Decks(questContent.poolContext, dreamcaller, questSeed),
      );
    }
    return map;
  }, [offered, questContent.poolContext, questSeed]);

  const handlePickDreamcaller = useCallback(
    (dreamcaller: DreamcallerContent) => {
      mutations.startQuest(dreamcaller, questSeed);
    },
    [mutations, questSeed],
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-6">
      <motion.h1
        className="mb-2 text-center text-5xl font-extrabold tracking-wide md:text-7xl lg:text-8xl"
        style={{
          background:
            "linear-gradient(135deg, #a855f7 0%, #7c3aed 40%, #c084fc 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          textShadow:
            "0 0 60px rgba(168, 85, 247, 0.4), 0 0 120px rgba(124, 58, 237, 0.2)",
          filter: "drop-shadow(0 0 40px rgba(168, 85, 247, 0.3))",
        }}
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        Dreamtides
      </motion.h1>

      <motion.p
        className="mb-6 text-center text-lg opacity-60 md:text-xl"
        style={{ color: "#e2e8f0" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
        Choose Your Dreamcaller
      </motion.p>

      <motion.div
        // FIND-01-12: use the available desktop width. On xl+ viewports the
        // three dreamcaller cards now span a wider column with bigger gaps
        // so 1728 wide no longer leaves ~830 px of empty gutter.
        className="flex w-full max-w-[1200px] flex-col items-center gap-3 px-6 md:flex-row md:items-start md:gap-6 xl:max-w-[1440px] xl:gap-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
      >
        {offered.map((dreamcaller, index) => {
          const accentColor = DREAMCALLER_ACCENT;
          const tides = largestTides(
            tidesByDreamcaller.get(dreamcaller.id) ?? [],
          );
          // A `tides4` run shows the dealt tides in place of the signature
          // cards, so suppress the signature-card list whenever tides exist.
          const signatureCards =
            tides.length > 0 ? [] : (dreamcaller.signatureCards ?? []);
          return (
            <motion.div
              key={dreamcaller.name}
              className="flex w-full max-w-[286px] flex-1 flex-col items-center gap-3 xl:max-w-[380px]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.6 + index * 0.1 }}
            >
              <motion.button
                className="flex h-[472px] w-full cursor-pointer flex-col rounded-[22px] px-4 pt-4 pb-5 text-left md:px-5"
                style={{
                  background:
                    "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
                  border: `2px solid ${accentColor}40`,
                  boxShadow: `0 0 20px ${accentColor}15`,
                }}
                whileHover={{
                  boxShadow: `0 0 40px ${accentColor}50`,
                  borderColor: `${accentColor}90`,
                  y: -4,
                  transition: DREAMCALLER_HOVER_TRANSITION,
                }}
                whileTap={{
                  scale: 0.985,
                  transition: DREAMCALLER_TAP_TRANSITION,
                }}
                onClick={() => {
                  handlePickDreamcaller(dreamcaller);
                }}
              >
                <div className="mb-3 flex min-h-[78px] items-start gap-3">
                  <div className="min-w-0">
                    <h3
                      className="text-xl font-bold leading-tight md:text-2xl"
                      style={{ color: "#f8fafc" }}
                    >
                      {dreamcaller.name}
                    </h3>
                    <p
                      className="mt-1 text-sm italic opacity-80 md:text-base"
                      style={{ color: "#cbd5f5" }}
                    >
                      {dreamcaller.title}
                    </p>
                  </div>
                </div>
                <DreamcallerPortrait
                  dreamcaller={dreamcaller}
                  variant="panel"
                  style={{
                    width: "100%",
                    aspectRatio: "0.8 / 1",
                    marginBottom: 14,
                    borderRadius: 18,
                    boxShadow: `0 14px 28px ${accentColor}16`,
                  }}
                />
                <div
                  className="flex flex-1 items-center justify-center px-2 text-center text-sm leading-relaxed opacity-80"
                  style={{ color: "#e2e8f0" }}
                >
                  <RulesText text={dreamcaller.renderedText} />
                </div>
                <div
                  className="mt-3 flex items-baseline justify-center gap-1.5 text-sm font-semibold"
                  data-starting-essence={dreamcaller.id}
                >
                  <span
                    className="text-xs uppercase tracking-wider opacity-70"
                    style={{ color: "#94a3b8" }}
                  >
                    Starting Essence
                  </span>
                  <span
                    className="text-base font-bold tabular-nums md:text-lg"
                    style={{ color: "var(--color-essence)" }}
                    data-starting-essence-value={dreamcaller.id}
                  >
                    {String(dreamcaller.startingEssence)}
                  </span>
                </div>
              </motion.button>
              {signatureCards.length > 0 && (
                <div className="flex w-full flex-col gap-2 px-1">
                  <span
                    className="inline-flex w-fit items-center gap-1.5"
                    data-signature-cards-label-wrapper={dreamcaller.id}
                  >
                    <span
                      className="text-xs font-medium"
                      data-signature-cards-label={dreamcaller.id}
                      style={{ color: "#94a3b8" }}
                    >
                      Signature Cards:
                    </span>
                    <HoverPopover
                      content={
                        <span
                          className="block rounded-lg border px-3 py-2 text-left text-xs leading-relaxed shadow-2xl"
                          style={{
                            background: "#000000",
                            borderColor: "rgba(255, 255, 255, 0.16)",
                            color: "#ffffff",
                          }}
                          data-signature-cards-label-tooltip={dreamcaller.id}
                        >
                          {SIGNATURE_CARDS_LABEL_HOVER_BLURB}
                        </span>
                      }
                    >
                      <i
                        aria-label="About signature cards"
                        className="bx bx-info-circle text-sm leading-none"
                        data-signature-cards-info-icon={dreamcaller.id}
                        style={{
                          color: "#94a3b8",
                          cursor: "help",
                          pointerEvents: "auto",
                        }}
                      />
                    </HoverPopover>
                  </span>
                  <div className="flex w-full flex-col gap-2">
                    {signatureCards.map((cardName) => (
                      <span
                        key={`${dreamcaller.id}-${cardName}`}
                        className="relative"
                        data-dreamcaller-signature-card={`${dreamcaller.id}:${cardName}`}
                      >
                        <span
                          className="inline-flex min-h-8 w-full items-center justify-start gap-1.5 px-1 py-1 text-xs font-medium"
                          style={{ color: "#ffffff" }}
                        >
                          <i
                            aria-hidden="true"
                            className="bxf bx-star text-sm leading-none"
                            data-dreamcaller-signature-card-icon={`${dreamcaller.id}:${cardName}`}
                            style={{ color: accentColor }}
                          />
                          <span>{cardName}</span>
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {tides.length > 0 && (
                <div
                  className="flex w-full flex-col gap-2 px-1"
                  data-dreamcaller-tides={dreamcaller.id}
                >
                  <span className="inline-flex w-fit items-center gap-1.5">
                    <span
                      className="text-xs font-medium"
                      data-dreamcaller-tides-label={dreamcaller.id}
                      style={{ color: "#94a3b8" }}
                    >
                      Tides:
                    </span>
                    <HoverPopover
                      content={
                        <span
                          className="block rounded-lg border px-3 py-2 text-left text-xs leading-relaxed shadow-2xl"
                          style={{
                            background: "#000000",
                            borderColor: "rgba(255, 255, 255, 0.16)",
                            color: "#ffffff",
                          }}
                          data-dreamcaller-tides-tooltip={dreamcaller.id}
                        >
                          {TIDES_LABEL_HOVER_BLURB}
                        </span>
                      }
                    >
                      <i
                        aria-label="About draft tides"
                        className="bx bx-info-circle text-sm leading-none"
                        data-dreamcaller-tides-info-icon={dreamcaller.id}
                        style={{
                          color: "#94a3b8",
                          cursor: "help",
                          pointerEvents: "auto",
                        }}
                      />
                    </HoverPopover>
                  </span>
                  <div className="flex w-full flex-col items-start gap-1.5">
                    {tides.map((tide) => {
                      const chip = TIDE_COLOR_CHIP[tide.color];
                      return (
                      <HoverPopover
                        key={`${dreamcaller.id}-${tide.id}`}
                        content={
                          <span
                            className="block rounded-lg border px-3 py-2 text-left text-xs leading-relaxed shadow-2xl"
                            style={{
                              background: "#000000",
                              borderColor: "rgba(255, 255, 255, 0.16)",
                              color: "#ffffff",
                            }}
                            data-dreamcaller-tide-tooltip={`${dreamcaller.id}:${tide.id}`}
                          >
                            {tide.displayDescription ??
                              tide.summary ??
                              tide.description ??
                              tide.name}
                          </span>
                        }
                      >
                        <span
                          className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
                          data-dreamcaller-tide={`${dreamcaller.id}:${tide.id}`}
                          style={{
                            background: chip.background,
                            borderColor: chip.border,
                            color: "#ffffff",
                            cursor: "help",
                          }}
                        >
                          <i
                            aria-hidden="true"
                            className={`bx ${chip.icon} text-sm leading-none`}
                            style={{ color: "#ffffff" }}
                          />
                          <span className="truncate">
                            {tide.displayName ?? tide.shortName ?? tide.name}
                          </span>
                        </span>
                      </HoverPopover>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
