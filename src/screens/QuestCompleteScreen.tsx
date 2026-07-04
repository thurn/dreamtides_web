import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuest } from "../state/quest-context";
import { logEvent, downloadLog } from "../logging";
import { CardDisplay } from "../components/CardDisplay";
import { DreamcallerPortrait } from "../tango/components/hud/DreamcallerPortrait";
import { EssenceValue } from "../tango/components/hud/EssenceValue";
import type { CardData } from "../types/cards";

/** Final summary screen shown after winning 7 battles. */
export function QuestCompleteScreen() {
  const { state, mutations, cardDatabase } = useQuest();
  const hasLoggedRef = useRef(false);
  const [showDeck, setShowDeck] = useState(false);

  useEffect(() => {
    if (!hasLoggedRef.current) {
      hasLoggedRef.current = true;
      const completedNodes = Object.values(state.atlas.nodes).filter(
        (n) => n.state === "completed",
      ).length;
      logEvent("quest_completed", {
        cardsInDeck: state.deck.length,
        essenceRemaining: state.essence,
        dreamscapesVisited: completedNodes,
        battlesWon: state.completionLevel,
        dreamcallerName: state.dreamcaller?.name ?? "none",
        dreamsignCount: state.dreamsigns.length,
      });
    }
  }, [
    state.atlas.nodes,
    state.completionLevel,
    state.deck.length,
    state.essence,
    state.dreamcaller,
    state.dreamsigns.length,
  ]);

  const handleNewQuest = useCallback(() => {
    mutations.resetQuest();
  }, [mutations]);

  const handleDownloadLog = useCallback(() => {
    downloadLog();
  }, []);

  const toggleDeck = useCallback(() => {
    setShowDeck((prev) => !prev);
  }, []);

  const completedDreamscapes = Object.values(state.atlas.nodes).filter(
    (n) => n.state === "completed",
  ).length;

  const dreamcallerName = state.dreamcaller?.name ?? "None";
  const dreamcallerTitle = state.dreamcaller?.title ?? "Unbound";
  const dreamcallerColor =
    state.dreamcaller !== null ? "#f8fafc" : "#6b7280";

  const stats = [
    { label: "Battles Won", value: String(state.completionLevel) },
    { label: "Cards in Deck", value: String(state.deck.length) },
    { label: "Essence Remaining", value: String(state.essence) },
    { label: "Dreamscapes Visited", value: String(completedDreamscapes) },
    { label: "Dreamsigns", value: String(state.dreamsigns.length) },
  ];

  // Resolve deck card data
  const deckCards: CardData[] = [];
  for (const entry of state.deck) {
    const card = cardDatabase.get(entry.cardNumber);
    if (card) {
      deckCards.push(card);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-12">
      <motion.h1
        className="mb-4 text-center text-5xl font-extrabold tracking-wide md:text-7xl"
        style={{
          background:
            "linear-gradient(135deg, #fbbf24 0%, #d4a017 50%, #f59e0b 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          filter: "drop-shadow(0 0 40px rgba(251, 191, 36, 0.4))",
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        Quest Complete!
      </motion.h1>

      {/* Dreamcaller display */}
      <motion.div
        className="mb-6 flex items-center gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        {state.dreamcaller !== null ? (
          <DreamcallerPortrait
            dreamcaller={state.dreamcaller}
            variant="panel"
            size={56}
          />
        ) : (
          <div
            className="flex h-14 w-14 items-center justify-center rounded-[14px] text-lg font-black"
            style={{
              border: "1px solid rgba(255, 255, 255, 0.14)",
              background: "rgba(255, 255, 255, 0.06)",
              color: dreamcallerColor,
            }}
          >
            {"--"}
          </div>
        )}
        <div className="flex flex-col">
          <span
            className="text-lg font-bold md:text-xl"
            style={{ color: dreamcallerColor }}
          >
            {dreamcallerName}
          </span>
          <span
            className="text-sm italic opacity-80"
            style={{ color: "#cbd5f5" }}
          >
            {dreamcallerTitle}
          </span>
        </div>
      </motion.div>

      {/* Stats grid */}
      <motion.div
        className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        {stats.map((stat) => {
          // Essence Remaining is the one currency value in the stat
          // grid and adopts the prototype-wide purple identity. The
          // other stats stay neutral gold so the grid still reads as
          // a celebratory summary panel.
          const isEssenceStat = stat.label === "Essence Remaining";
          return (
            <div
              key={stat.label}
              className="flex flex-col items-center rounded-lg px-6 py-4"
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: isEssenceStat
                  ? "1px solid var(--color-essence-border)"
                  : "1px solid rgba(212, 160, 23, 0.3)",
              }}
              data-quest-complete-stat={stat.label}
            >
              {isEssenceStat ? (
                <span className="text-3xl font-bold md:text-4xl">
                  <EssenceValue amount={stat.value} />
                </span>
              ) : (
                <span
                  className="text-3xl font-bold tabular-nums md:text-4xl"
                  style={{ color: "#fbbf24" }}
                >
                  {stat.value}
                </span>
              )}
              <span className="mt-1 text-sm opacity-60">{stat.label}</span>
            </div>
          );
        })}
      </motion.div>

      {/* Deck viewer toggle */}
      {deckCards.length > 0 && (
        <motion.div
          className="mb-6 w-full max-w-5xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <button
            className="mb-3 w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: "rgba(124, 58, 237, 0.1)",
              border: "1px solid rgba(124, 58, 237, 0.3)",
              color: "#c084fc",
            }}
            onClick={toggleDeck}
          >
            {showDeck
              ? "Hide Deck"
              : `View Final Deck (${String(deckCards.length)} cards)`}
          </button>

          <AnimatePresence>
            {showDeck && (
              <motion.div
                className="grid grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
                style={{ maxHeight: "400px" }}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                {deckCards.map((card, i) => (
                  <CardDisplay
                    key={`final-${String(i)}-${String(card.cardNumber)}`}
                    card={card}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Action buttons */}
      <motion.div
        className="flex gap-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
      >
        <motion.button
          className="cursor-pointer rounded-lg px-8 py-3 text-lg font-bold tracking-wide text-white transition-colors"
          style={{
            background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
            border: "2px solid rgba(168, 85, 247, 0.6)",
            boxShadow: "0 0 20px rgba(124, 58, 237, 0.3)",
          }}
          whileHover={{
            boxShadow: "0 0 30px rgba(124, 58, 237, 0.5)",
            scale: 1.05,
          }}
          whileTap={{ scale: 0.97 }}
          onClick={handleNewQuest}
        >
          New Quest
        </motion.button>

        <motion.button
          className="cursor-pointer rounded-lg px-6 py-3 text-lg font-medium transition-colors"
          style={{
            background: "rgba(212, 160, 23, 0.15)",
            border: "1px solid rgba(212, 160, 23, 0.3)",
            color: "#fbbf24",
          }}
          whileHover={{
            boxShadow: "0 0 20px rgba(212, 160, 23, 0.3)",
            scale: 1.03,
          }}
          whileTap={{ scale: 0.97 }}
          onClick={handleDownloadLog}
        >
          Download Log
        </motion.button>
      </motion.div>
    </div>
  );
}
