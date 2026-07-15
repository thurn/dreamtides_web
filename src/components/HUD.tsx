import { useEffect, useRef, useState } from "react";
import { useQuest } from "../state/quest-context";
import type { QuestState } from "../types/quest";
import { DreamcallerPortrait } from "../cumulus/components/hud/DreamcallerPortrait";
import { DreamcallerPopover } from "./DreamcallerPopover";
import { HudDreamsignRow } from "./HudDreamsignRow";
import { EssenceValue } from "../cumulus/components/hud/EssenceValue";
import {
  HUD_BUTTON_BASE_CLASS,
  HUD_DREAMSIGN_DEBUG_SLOT_ID,
} from "./hud-button-styles";
import { QuestUtilityMenu, type QuestUtilityMenuAction } from "./QuestUtilityMenu";

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
  onOpenPoolViewer: () => void;
  onOpenDebugScreen: () => void;
  onOpenQuestEditor: () => void;
  onToggleCardSourceOverlay: () => void;
  onToggleJourneyExplanation: () => void;
  hasDraftData: boolean;
  hasCardSourceDebug: boolean;
  isCardSourceOverlayOpen: boolean;
  hasJourneyExplanation: boolean;
  isJourneyExplanationOpen: boolean;
  /**
   * Replaces the entire quest state with a saved snapshot loaded by name.
   * Optional because only the live multiplayer provider supplies it, matching
   * the Package Debug overlay's own load wiring.
   */
  onLoadQuestState?: (state: QuestState, source: string) => void;
}

/** Persistent HUD bar anchored to the bottom of the viewport. */
export function HUD({
  onOpenDeckViewer,
  onOpenPoolViewer,
  onOpenDebugScreen,
  onOpenQuestEditor,
  onToggleCardSourceOverlay,
  onToggleJourneyExplanation,
  hasDraftData,
  hasCardSourceDebug,
  isCardSourceOverlayOpen,
  hasJourneyExplanation,
  isJourneyExplanationOpen,
  onLoadQuestState,
}: HudProps) {
  const { state } = useQuest();
  const animatedEssence = useAnimatedNumber(
    state.essence,
    ESSENCE_ANIM_DURATION,
  );

  const dreamcallerName = state.dreamcaller?.name ?? null;
  const dreamcallerColor = dreamcallerName !== null ? "#e2e8f0" : "#6b7280";
  const utilityActions: QuestUtilityMenuAction[] = [
    { id: "pool", label: "Pool Viewer", onClick: onOpenPoolViewer },
    ...(hasCardSourceDebug
      ? [{
          id: "whyCards",
          label: "Why Cards",
          active: isCardSourceOverlayOpen,
          onClick: onToggleCardSourceOverlay,
        }]
      : []),
    ...(hasDraftData
      ? [{ id: "package", label: "Package Debug", onClick: onOpenDebugScreen }]
      : []),
    ...(hasJourneyExplanation
      ? [{
          id: "whyJourney",
          label: "Why Journey",
          active: isJourneyExplanationOpen,
          onClick: onToggleJourneyExplanation,
          testId: "hud-why-journey-button",
        }]
      : []),
    {
      id: "editor",
      label: "Edit Quest State",
      onClick: onOpenQuestEditor,
      testId: "hud-quest-editor-button",
    },
  ];

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
        {/* Essence counter. The purple value is glued to the crypto glyph that
            marks essence everywhere in the prototype, so the wallet reads as a
            currency value the same way card and dreamsign rules text show it. */}
        <div
          className="flex shrink-0 items-baseline gap-1.5"
          aria-label="Essence"
          data-hud-essence=""
        >
          <span className="text-sm font-bold md:text-base">
            <EssenceValue amount={String(animatedEssence)} />
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
                  size={30}
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
        {hasCardSourceDebug && (
          <span className="sr-only">Card source debug available</span>
        )}
        <span
          id={HUD_DREAMSIGN_DEBUG_SLOT_ID}
          data-testid="hud-dreamsign-debug-slot"
          className="contents"
        />
        {hasDraftData && (
          <>
            {hasJourneyExplanation && (
              <span className="sr-only">Journey explanation available</span>
            )}
          </>
        )}
        <div className="relative">
          <QuestUtilityMenu
            variant="hud"
            actions={utilityActions}
            builtIns={["saveQuest", "loadQuest", "downloadLog"]}
            onLoadQuestState={onLoadQuestState}
            saveSource="hud_save_quest"
            loadSource="hud_load_quest"
            menuTestId="hud-utility-menu"
            loadMenuTestId="hud-load-quest-menu"
            statusTestId="hud-save-status"
            panelClassName="absolute right-0 bottom-full z-50 mb-2 flex min-w-48 flex-col gap-1 rounded-md border border-slate-600 bg-slate-950 p-2 shadow-xl"
            statusClassName="absolute right-0 bottom-full z-50 mb-2 max-w-xs rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-100 shadow-xl"
            renderTrigger={({ open, toggle }) => (
              <button
                type="button"
                aria-label="Open utility menu"
                aria-expanded={open}
                data-testid="hud-utility-menu-button"
                className={`${HUD_BUTTON_BASE_CLASS} min-w-9 focus-visible:ring-cyan-300`}
                style={{
                  background: "rgba(15, 23, 42, 0.72)",
                  border: "1px solid rgba(148, 163, 184, 0.32)",
                  color: "#e2e8f0",
                }}
                onClick={toggle}
              >
                {"\u22ef"}
              </button>
            )}
          />
        </div>
      </div>
    </div>
  );
}
