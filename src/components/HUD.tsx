import { useEffect, useRef, useState } from "react";
import { useQuest } from "../state/quest-context";
import { downloadLog } from "../logging";
import { DreamcallerPortrait } from "./DreamcallerPortrait";
import { DreamcallerPopover } from "./DreamcallerPopover";
import { HudDreamsignRow } from "./HudDreamsignRow";
import {
  HUD_BUTTON_BASE_CLASS,
  HUD_DREAMSIGN_DEBUG_SLOT_ID,
} from "./hud-button-styles";

/** Duration in ms for the essence count animation. */
const ESSENCE_ANIM_DURATION = 500;

/** Animates a number from one value to another over a duration. */
function useAnimatedNumber(target: number, duration: number): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    const start = displayRef.current;

    if (start === target) return;

    const delta = target - start;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(start + delta * eased);
      displayRef.current = value;
      setDisplay(value);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return display;
}

/** Props for the HUD component. */
interface HudProps {
  onOpenDeckViewer: () => void;
  onOpenGlossary: () => void;
  onOpenDebugScreen: () => void;
  onToggleCardSourceOverlay: () => void;
  onToggleJourneyExplanation: () => void;
  hasDraftData: boolean;
  hasCardSourceDebug: boolean;
  isCardSourceOverlayOpen: boolean;
  hasJourneyExplanation: boolean;
  isJourneyExplanationOpen: boolean;
}

/** Persistent HUD bar anchored to the bottom of the viewport. */
export function HUD({
  onOpenDeckViewer,
  onOpenGlossary,
  onOpenDebugScreen,
  onToggleCardSourceOverlay,
  onToggleJourneyExplanation,
  hasDraftData,
  hasCardSourceDebug,
  isCardSourceOverlayOpen,
  hasJourneyExplanation,
  isJourneyExplanationOpen,
}: HudProps) {
  const { state } = useQuest();
  const animatedEssence = useAnimatedNumber(
    state.essence,
    ESSENCE_ANIM_DURATION,
  );

  function handleDownloadLog() {
    downloadLog();
  }

  const dreamcallerName = state.dreamcaller?.name ?? null;
  const dreamcallerColor = dreamcallerName !== null ? "#e2e8f0" : "#6b7280";

  return (
    <div
      // FIND-10-13 (Stage 4): the 1024x768 layout previously let the
      // dreamcaller subtitle truncate under pressure from the center
      // Battles counter. Switch to a 3-column grid so the left/center/right
      // sections do not shove each other at narrow viewports, and drop
      // the dreamcaller subtitle below lg so it never collides with the
      // Dreamsigns counter.
      className="fixed right-0 bottom-0 left-0 z-50 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2 md:gap-x-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_auto_auto]"
      data-quest-bottom-hud=""
      style={{
        background:
          "linear-gradient(180deg, rgba(10, 6, 18, 0.85) 0%, rgba(10, 6, 18, 0.95) 100%)",
        borderTop: "1px solid rgba(124, 58, 237, 0.3)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Left section: essence, deck, dreamcaller */}
      <div className="flex min-w-0 items-center gap-2 overflow-visible md:gap-5">
        {/* Essence counter. Color identity is the only marker for
            essence across the prototype; no glyph is rendered so the
            HUD stays consistent with shop / battle-reward surfaces.
            The "Essence" label sits inline with the number at every
            breakpoint so the purple value reads as currency rather
            than as a free-floating count. */}
        <div
          className="flex shrink-0 items-baseline gap-1.5"
          aria-label="Essence"
          data-hud-essence=""
        >
          <span
            className="text-sm font-bold tabular-nums md:text-base"
            style={{ color: "var(--color-essence)" }}
          >
            {String(animatedEssence)}
          </span>
          <span
            className="text-xs md:text-sm"
            style={{ color: "var(--color-essence)" }}
          >
            Essence
          </span>
        </div>

        {/* Omens counter. Spent only on shop Dreamsign purchases and rerolls. */}
        <div
          className="flex shrink-0 items-baseline gap-1.5"
          aria-label="Omens"
          data-hud-omens=""
        >
          <span
            className="text-sm font-bold tabular-nums md:text-base"
            style={{ color: "#fbbf24" }}
          >
            {String(state.omens)}
          </span>
          <span className="text-xs md:text-sm" style={{ color: "#fbbf24" }}>
            Omens
          </span>
        </div>

        {/* Deck size */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-sm opacity-70 md:text-base" aria-label="Deck">
            {"\uD83C\uDCCF"}
          </span>
          <span className="text-sm font-bold md:text-base">
            {String(state.deck.length)}
          </span>
          <span className="hidden text-xs opacity-50 xl:inline">Cards</span>
        </div>

        {/* Dreamcaller portrait */}
        <div className="group relative flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            style={{
              color: dreamcallerColor,
            }}
          >
            {state.dreamcaller !== null ? (
              <>
                <DreamcallerPortrait
                  dreamcaller={state.dreamcaller}
                  variant="thumb"
                  style={{ height: 30, width: 30, flexShrink: 0 }}
                />
                {/* FIND-10-13 (Stage 4): only expose the dreamcaller text
                    beside the portrait at xl+ viewports. At 1024px only the
                    portrait is shown, so the subtitle cannot truncate next
                    to the Battles counter. */}
                <span className="hidden min-w-0 flex-col xl:flex">
                  <span
                    className="max-w-[140px] truncate text-xs font-semibold"
                    style={{ color: dreamcallerColor }}
                  >
                    {state.dreamcaller.name}
                  </span>
                  <span
                    className="max-w-[140px] truncate text-[11px] italic opacity-70"
                    style={{ color: "#cbd5f5" }}
                  >
                    {state.dreamcaller.title}
                  </span>
                </span>
              </>
            ) : (
              <div
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] text-[10px]"
                style={{
                  border: "1px solid rgba(255, 255, 255, 0.14)",
                  background: "rgba(0, 0, 0, 0.35)",
                  color: "#6b7280",
                }}
              >
                {"--"}
              </div>
            )}
          </button>
          {state.dreamcaller !== null && (
            <div
              data-testid="hud-dreamcaller-popover-layer"
              className="pointer-events-none absolute bottom-full left-0 z-30 mb-3 hidden origin-bottom-left opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 lg:block"
            >
              <DreamcallerPopover dreamcaller={state.dreamcaller} />
            </div>
          )}
        </div>

        {/* Dreamsign row \u2014 one art thumbnail per owned dreamsign, hover for full
            card. Renders nothing when the player has no dreamsigns so the HUD
            does not reserve width for an empty list. */}
        <HudDreamsignRow dreamsigns={state.dreamsigns} />
      </div>

      {/* Center: completion level (FIND-01-13: labelled so "0/7" is not ambiguous). */}
      <div className="hidden shrink-0 items-center whitespace-nowrap sm:flex">
        <span className="text-xs font-medium opacity-70 md:text-sm">
          Battles won {String(state.completionLevel)}/7
        </span>
      </div>

      {/* Right section: buttons */}
      <div className="col-span-2 flex min-w-0 flex-wrap items-center justify-end gap-2 md:gap-3 lg:col-span-1">
        <button
          className={`${HUD_BUTTON_BASE_CLASS} focus-visible:ring-fuchsia-300`}
          style={{
            background: "rgba(124, 58, 237, 0.2)",
            border: "1px solid rgba(124, 58, 237, 0.4)",
            color: "#c084fc",
          }}
          onClick={onOpenDeckViewer}
        >
          <span className="lg:hidden">{"\uD83C\uDCCF"}</span>
          <span className="hidden lg:inline">View Deck</span>
        </button>
        {/* Glossary opens a popup of every gameplay term that has a
            card-text hover tooltip. Sits beside View Deck so the
            reference is always one click from anywhere the HUD
            renders. */}
        <button
          className={`${HUD_BUTTON_BASE_CLASS} focus-visible:ring-violet-300`}
          style={{
            background: "rgba(124, 58, 237, 0.12)",
            border: "1px solid rgba(124, 58, 237, 0.32)",
            color: "#c4b5fd",
          }}
          onClick={onOpenGlossary}
          data-testid="hud-glossary-button"
        >
          <span className="lg:hidden" aria-hidden="true">{"\uD83D\uDCD6"}</span>
          <span className="hidden lg:inline">Glossary</span>
          <span className="sr-only lg:hidden">Glossary</span>
        </button>
        {hasCardSourceDebug && (
          <button
            className={`${HUD_BUTTON_BASE_CLASS} focus-visible:ring-sky-300`}
            style={{
              background: isCardSourceOverlayOpen
                ? "rgba(96, 165, 250, 0.24)"
                : "rgba(96, 165, 250, 0.14)",
              border: `1px solid ${isCardSourceOverlayOpen ? "rgba(96, 165, 250, 0.5)" : "rgba(96, 165, 250, 0.28)"}`,
              color: isCardSourceOverlayOpen ? "#dbeafe" : "#93c5fd",
            }}
            onClick={onToggleCardSourceOverlay}
          >
            <span className="lg:hidden">{"?"}</span>
            <span className="hidden lg:inline">Why Cards</span>
          </button>
        )}
        <span
          id={HUD_DREAMSIGN_DEBUG_SLOT_ID}
          data-testid="hud-dreamsign-debug-slot"
          className="contents"
        />
        {hasDraftData && (
          <>
            {hasJourneyExplanation && (
              <button
                className={`${HUD_BUTTON_BASE_CLASS} focus-visible:ring-cyan-300`}
                style={{
                  background: isJourneyExplanationOpen
                    ? "rgba(34, 211, 238, 0.24)"
                    : "rgba(34, 211, 238, 0.14)",
                  border: `1px solid ${
                    isJourneyExplanationOpen
                      ? "rgba(34, 211, 238, 0.52)"
                      : "rgba(34, 211, 238, 0.3)"
                  }`,
                  color: isJourneyExplanationOpen ? "#cffafe" : "#67e8f9",
                }}
                onClick={onToggleJourneyExplanation}
                data-testid="hud-why-journey-button"
                aria-pressed={isJourneyExplanationOpen}
              >
                <span className="lg:hidden" aria-hidden="true">{"?"}</span>
                <span className="hidden lg:inline">Why Journey</span>
                <span className="sr-only lg:hidden">Why Journey</span>
              </button>
            )}
            <button
              className={`${HUD_BUTTON_BASE_CLASS} focus-visible:ring-rose-300`}
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
              }}
              onClick={onOpenDebugScreen}
            >
              <span className="lg:hidden">{"\uD83D\uDC1B"}</span>
              <span className="hidden lg:inline">Debug</span>
            </button>
          </>
        )}
        <button
          className={`${HUD_BUTTON_BASE_CLASS} focus-visible:ring-amber-300`}
          style={{
            background: "rgba(212, 160, 23, 0.15)",
            border: "1px solid rgba(212, 160, 23, 0.3)",
            color: "#fbbf24",
          }}
          onClick={handleDownloadLog}
        >
          <span className="lg:hidden">{"\u2B73"}</span>
          <span className="hidden lg:inline">Download Log</span>
        </button>
      </div>
    </div>
  );
}
