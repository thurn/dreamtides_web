import { useEffect, useRef, useState } from "react";
import { useQuest } from "../state/quest-context";
import { downloadLog } from "../logging";
import { DreamcallerPortrait } from "./DreamcallerPortrait";
import { DreamcallerPopover } from "./DreamcallerPopover";
import { HudDreamsignRow } from "./HudDreamsignRow";

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
  onOpenDebugScreen: () => void;
  onToggleCardSourceOverlay: () => void;
  hasDraftData: boolean;
  hasCardSourceDebug: boolean;
  isCardSourceOverlayOpen: boolean;
}

/** Persistent HUD bar anchored to the bottom of the viewport. */
export function HUD({
  onOpenDeckViewer,
  onOpenDebugScreen,
  onToggleCardSourceOverlay,
  hasDraftData,
  hasCardSourceDebug,
  isCardSourceOverlayOpen,
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

  // FIND-10-11 / FIND-10-12 (Stage 4): shared class for right-side HUD
  // buttons. Gives every button ≥36px height, visible hover/focus rings,
  // and rounded design-token chrome.
  const hudButtonBase =
    "flex min-h-[36px] cursor-pointer items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors md:text-sm "
    + "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 "
    + "disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      // FIND-10-13 (Stage 4): the 1024x768 layout previously let the
      // dreamcaller subtitle truncate under pressure from the center
      // Battles counter. Switch to a 3-column grid so the left/center/right
      // sections do not shove each other at narrow viewports, and drop
      // the dreamcaller subtitle below lg so it never collides with the
      // Dreamsigns counter.
      className="fixed right-0 bottom-0 left-0 z-50 grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 md:gap-6 md:px-6"
      style={{
        background:
          "linear-gradient(180deg, rgba(10, 6, 18, 0.85) 0%, rgba(10, 6, 18, 0.95) 100%)",
        borderTop: "1px solid rgba(124, 58, 237, 0.3)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Left section: essence, deck, dreamcaller */}
      <div className="flex min-w-0 items-center gap-3 md:gap-5">
        {/* Essence counter */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className="text-base md:text-lg"
            style={{ color: "#fbbf24" }}
            aria-label="Essence"
          >
            {"\u25C6"}
          </span>
          <span
            className="text-sm font-bold md:text-base"
            style={{ color: "#fbbf24" }}
          >
            {String(animatedEssence)}
          </span>
          <span className="hidden text-xs opacity-50 xl:inline">Essence</span>
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
              className="pointer-events-none absolute bottom-full left-0 z-30 mb-3 hidden origin-bottom-left opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 lg:block"
            >
              <DreamcallerPopover
                dreamcaller={state.dreamcaller}
                resolvedPackage={state.resolvedPackage}
              />
            </div>
          )}
        </div>

        {/* Dreamsign row \u2014 one art thumbnail per owned dreamsign, hover for full
            card. Renders nothing when the player has no dreamsigns so the HUD
            does not reserve width for an empty list. */}
        <HudDreamsignRow dreamsigns={state.dreamsigns} />
      </div>

      {/* Center: completion level (FIND-01-13: labelled so "0/7" is not ambiguous). */}
      <div className="flex shrink-0 items-center whitespace-nowrap">
        <span className="text-xs font-medium opacity-70 md:text-sm">
          Battles won {String(state.completionLevel)}/7
        </span>
      </div>

      {/* Right section: buttons */}
      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        <button
          className={`${hudButtonBase} focus-visible:ring-fuchsia-300`}
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
        {hasCardSourceDebug && (
          <button
            className={`${hudButtonBase} focus-visible:ring-sky-300`}
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
        {hasDraftData && (
          <button
            className={`${hudButtonBase} focus-visible:ring-rose-300`}
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
        )}
        <button
          className={`${hudButtonBase} focus-visible:ring-amber-300`}
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
