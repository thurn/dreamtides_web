import { useRef } from "react";
import { motion } from "framer-motion";
import { selectDreamcallerOffer } from "../data/dreamcaller-selection";
import { DreamcallerPortrait } from "../components/DreamcallerPortrait";
import { RulesText } from "../components/RulesText";
import type { DraftDreamcaller } from "./dreamcallers-v2-database";

const DREAMCALLER_ACCENT = "#c084fc";
const DREAMCALLER_HOVER_TRANSITION = { duration: 0.12, delay: 0 } as const;
const DREAMCALLER_TAP_TRANSITION = { duration: 0.08, delay: 0 } as const;

/** Pretty-print one draft-archetype key, e.g. `wb-aristocrats` -> `WB Aristocrats`. */
function prettyArchetype(archetype: string): string {
  const [head, ...rest] = archetype.split("-");
  const isColors = head.length > 0 && [...head].every((c) => "wubrg".includes(c));
  const colors = isColors ? head.toUpperCase() : head;
  const body = rest
    .join(" ")
    .replace(/\b\w/gu, (c) => c.toUpperCase());
  return body.length > 0 ? `${colors} ${body}` : colors;
}

/**
 * Dreamcaller selection for the draft test harness. Offers three random v2
 * Dreamcallers; the chosen one seeds draft-pool construction. Reuses the
 * offer logic and portrait/rules-text rendering from the main quest prototype.
 */
export function DraftDreamcallerSelect({
  dreamcallers,
  onSelect,
}: {
  dreamcallers: readonly DraftDreamcaller[];
  onSelect: (dreamcaller: DraftDreamcaller) => void;
}) {
  const offeredRef = useRef<DraftDreamcaller[] | null>(null);
  if (offeredRef.current === null) {
    offeredRef.current = selectDreamcallerOffer(dreamcallers);
  }
  const offered = offeredRef.current;

  return (
    <div
      data-testid="draft-test-dreamcaller-select"
      className="flex min-h-screen flex-col items-center justify-center px-4 py-6"
    >
      <motion.h1
        className="mb-2 text-center text-5xl font-extrabold tracking-wide md:text-7xl"
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
        Draft Test
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
        className="flex w-full max-w-[1200px] flex-col items-center gap-3 px-6 md:flex-row md:items-start md:gap-6 xl:max-w-[1440px] xl:gap-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
      >
        {offered.map((dreamcaller, index) => {
          const accentColor = DREAMCALLER_ACCENT;
          const archetypes = dreamcaller.draftArchetypes ?? [];
          return (
            <motion.div
              key={dreamcaller.id}
              className="flex w-full max-w-[286px] flex-1 flex-col items-center gap-3 xl:max-w-[380px]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.6 + index * 0.1 }}
            >
              <motion.button
                type="button"
                data-testid={`draft-test-dreamcaller-option-${dreamcaller.id}`}
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
                  onSelect(dreamcaller);
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
              </motion.button>
              <div className="flex w-full flex-col gap-1.5 px-1">
                <span
                  className="text-xs font-medium"
                  style={{ color: "#94a3b8" }}
                >
                  {archetypes.length > 0 ? "Draft archetypes:" : "Open pool"}
                </span>
                {archetypes.length > 0 ? (
                  <div
                    data-testid={`draft-test-dreamcaller-archetypes-${dreamcaller.id}`}
                    className="flex max-h-28 flex-wrap content-start gap-1 overflow-y-auto"
                  >
                    {archetypes.map((archetype) => (
                      <span
                        key={archetype}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          background: "rgba(124, 58, 237, 0.16)",
                          border: "1px solid rgba(124, 58, 237, 0.32)",
                          color: "#c084fc",
                        }}
                      >
                        {prettyArchetype(archetype)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[11px] leading-relaxed opacity-50">
                    Suited to any pool — drafts the full random experience.
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
