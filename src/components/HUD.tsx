import { useEffect, useRef, useState } from "react";
import { useQuest } from "../state/quest-context";
import { downloadLog, logEvent } from "../logging";
import {
  getSavedQuest,
  listSavedQuests,
  saveQuest,
  type SavedQuestSummary,
} from "../state/saved-quests";
import type { QuestState } from "../types/quest";
import { DreamcallerPortrait } from "../tango/components/DreamcallerPortrait";
import { DreamcallerPopover } from "./DreamcallerPopover";
import { HudDreamsignRow } from "./HudDreamsignRow";
import { EssenceValue } from "../tango/components/EssenceValue";
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
  onOpenGlossary,
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
  const [isUtilityMenuOpen, setIsUtilityMenuOpen] = useState(false);
  // The utility menu has two views: the root list of actions and a "Load
  // Quest" submenu listing saved snapshots. Selecting "Load Quest" swaps the
  // menu into the submenu rather than opening a separate overlay.
  const [menuView, setMenuView] = useState<"root" | "load">("root");
  const [loadSaves, setLoadSaves] = useState<SavedQuestSummary[]>([]);
  const [loadStatus, setLoadStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  // Transient feedback for the "Save Quest" menu action, auto-cleared a few
  // seconds after the save resolves so it does not linger on the HUD.
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const saveStatusTimerRef = useRef<number | null>(null);
  const animatedEssence = useAnimatedNumber(
    state.essence,
    ESSENCE_ANIM_DURATION,
  );

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current !== null) {
        clearTimeout(saveStatusTimerRef.current);
      }
    };
  }, []);

  function showSaveStatus(text: string): void {
    setSaveStatus(text);
    if (saveStatusTimerRef.current !== null) {
      clearTimeout(saveStatusTimerRef.current);
    }
    saveStatusTimerRef.current = window.setTimeout(() => {
      setSaveStatus(null);
      saveStatusTimerRef.current = null;
    }, 4000);
  }

  // Save the current run to disk under a chosen name. That same name is what
  // `npm run load-quest -- "<name>"` (and the Package Debug overlay) reloads.
  async function handleSaveQuest(): Promise<void> {
    setIsUtilityMenuOpen(false);
    const entered = window.prompt(
      "Save current quest as (reload with `npm run load-quest -- \"<name>\"`):",
    );
    if (entered === null) {
      return;
    }
    const trimmed = entered.trim();
    if (trimmed === "") {
      showSaveStatus("Save cancelled: a name is required.");
      return;
    }
    try {
      const summary = await saveQuest(trimmed, state);
      logEvent("debug_quest_saved", {
        source: "hud_save_quest",
        name: summary.name,
        screen: summary.screenType,
      });
      showSaveStatus(`Saved "${summary.name}".`);
    } catch (error) {
      showSaveStatus(
        error instanceof Error ? error.message : "Failed to save quest.",
      );
    }
  }

  function handleDownloadLog() {
    setIsUtilityMenuOpen(false);
    downloadLog();
  }

  // Switch the utility menu into the "Load Quest" submenu and (re)fetch the
  // list of saved snapshots from the dev server every time it is opened so the
  // list reflects any saves made since the menu was last viewed.
  function handleOpenLoadMenu(): void {
    setMenuView("load");
    setLoadStatus("loading");
    setLoadError(null);
    void listSavedQuests()
      .then((entries) => {
        setLoadSaves(entries);
        setLoadStatus("ready");
      })
      .catch((error: unknown) => {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to list saved quests.",
        );
        setLoadStatus("error");
      });
  }

  // Fetch the chosen snapshot and replace the running quest with it. Mirrors
  // the Package Debug overlay's load path so both routes behave identically.
  async function handleSelectLoad(summary: SavedQuestSummary): Promise<void> {
    if (onLoadQuestState === undefined) {
      showSaveStatus("Loading is unavailable in this context.");
      return;
    }
    try {
      const loaded = await getSavedQuest(summary.name);
      if (loaded === null) {
        showSaveStatus(`Saved quest "${summary.name}" could not be found.`);
        return;
      }
      logEvent("debug_quest_loaded", {
        source: "hud_load_quest",
        name: summary.name,
        screen: loaded.screen?.type ?? "unknown",
      });
      onLoadQuestState(loaded, "hud_load_quest");
      closeUtilityMenu();
      showSaveStatus(`Loaded "${summary.name}".`);
    } catch (error) {
      showSaveStatus(
        error instanceof Error ? error.message : "Failed to load quest.",
      );
    }
  }

  function closeUtilityMenu(): void {
    setIsUtilityMenuOpen(false);
    setMenuView("root");
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
          <button
            type="button"
            aria-label="Open utility menu"
            aria-expanded={isUtilityMenuOpen}
            data-testid="hud-utility-menu-button"
            className={`${HUD_BUTTON_BASE_CLASS} min-w-9 focus-visible:ring-cyan-300`}
            style={{
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.32)",
              color: "#e2e8f0",
            }}
            onClick={() => {
              setMenuView("root");
              setIsUtilityMenuOpen((value) => !value);
            }}
          >
            {"\u22ef"}
          </button>
          {isUtilityMenuOpen ? (
            <div
              data-testid="hud-utility-menu"
              className="absolute right-0 bottom-full z-50 mb-2 flex min-w-48 flex-col gap-1 rounded-md border border-slate-600 bg-slate-950 p-2 shadow-xl"
            >
              {menuView === "root" ? (
                <>
                  <UtilityMenuButton
                    label="Pool Viewer"
                    onClick={() => {
                      closeUtilityMenu();
                      onOpenPoolViewer();
                    }}
                  />
                  {hasCardSourceDebug ? (
                    <UtilityMenuButton
                      label="Why Cards"
                      active={isCardSourceOverlayOpen}
                      onClick={() => {
                        closeUtilityMenu();
                        onToggleCardSourceOverlay();
                      }}
                    />
                  ) : null}
                  {hasDraftData ? (
                    <UtilityMenuButton
                      label="Package Debug"
                      onClick={() => {
                        closeUtilityMenu();
                        onOpenDebugScreen();
                      }}
                    />
                  ) : null}
                  {hasJourneyExplanation ? (
                    <UtilityMenuButton
                      label="Why Journey"
                      active={isJourneyExplanationOpen}
                      onClick={() => {
                        closeUtilityMenu();
                        onToggleJourneyExplanation();
                      }}
                      testId="hud-why-journey-button"
                    />
                  ) : null}
                  <UtilityMenuButton
                    label="Edit Quest State"
                    onClick={() => {
                      closeUtilityMenu();
                      onOpenQuestEditor();
                    }}
                    testId="hud-quest-editor-button"
                  />
                  <UtilityMenuButton
                    label="Save Quest"
                    onClick={() => {
                      void handleSaveQuest();
                    }}
                    testId="hud-save-quest-button"
                  />
                  {onLoadQuestState !== undefined ? (
                    <UtilityMenuButton
                      label="Load Quest"
                      onClick={handleOpenLoadMenu}
                      testId="hud-load-quest-button"
                    />
                  ) : null}
                  <UtilityMenuButton
                    label="Download Log"
                    onClick={handleDownloadLog}
                  />
                </>
              ) : (
                <LoadQuestSubmenu
                  status={loadStatus}
                  saves={loadSaves}
                  error={loadError}
                  onBack={() => setMenuView("root")}
                  onRetry={handleOpenLoadMenu}
                  onSelect={(summary) => {
                    void handleSelectLoad(summary);
                  }}
                />
              )}
            </div>
          ) : null}
          {saveStatus !== null && !isUtilityMenuOpen ? (
            <div
              data-testid="hud-save-status"
              role="status"
              className="absolute right-0 bottom-full z-50 mb-2 max-w-xs rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-100 shadow-xl"
            >
              {saveStatus}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UtilityMenuButton({
  active = false,
  label,
  onClick,
  testId,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      className="min-h-9 rounded-md px-3 text-left text-sm font-medium hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      style={{
        background: active ? "rgba(34, 211, 238, 0.18)" : "transparent",
        color: active ? "#cffafe" : "#e2e8f0",
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Formats a saved-quest ISO timestamp for the load submenu subtitle. */
function formatSavedAt(savedAt: string): string {
  const parsed = new Date(savedAt);
  if (Number.isNaN(parsed.getTime())) {
    return savedAt;
  }
  return parsed.toLocaleString();
}

/**
 * The "Load Quest" view of the utility menu: a back control plus the list of
 * saved snapshots fetched from the dev server. Picking an entry replaces the
 * running quest with that snapshot.
 */
function LoadQuestSubmenu({
  status,
  saves,
  error,
  onBack,
  onRetry,
  onSelect,
}: {
  status: "idle" | "loading" | "ready" | "error";
  saves: SavedQuestSummary[];
  error: string | null;
  onBack: () => void;
  onRetry: () => void;
  onSelect: (summary: SavedQuestSummary) => void;
}) {
  return (
    <div data-testid="hud-load-quest-menu" className="flex flex-col gap-1">
      <button
        type="button"
        className="min-h-9 rounded-md px-3 text-left text-sm font-medium text-slate-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        onClick={onBack}
      >
        {"‹"} Back
      </button>
      <div className="my-1 border-t border-slate-700" />
      {status === "loading" ? (
        <p className="px-3 py-2 text-xs text-slate-400">
          Loading saved quests...
        </p>
      ) : null}
      {status === "error" ? (
        <div className="px-3 py-2 text-xs text-rose-300">
          <p>{error ?? "Failed to list saved quests."}</p>
          <button
            type="button"
            className="mt-1 rounded-md px-2 py-1 text-xs font-medium text-cyan-200 hover:bg-white/10"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      ) : null}
      {status === "ready" && saves.length === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-400">No saved quests.</p>
      ) : null}
      {status === "ready" && saves.length > 0 ? (
        <div className="flex max-h-[50vh] flex-col gap-1 overflow-auto">
          {saves.map((save) => (
            <button
              key={save.name}
              type="button"
              data-load-quest-option={save.name}
              className="min-h-9 rounded-md px-3 py-1 text-left hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              onClick={() => {
                onSelect(save);
              }}
            >
              <span className="block truncate text-sm font-medium text-slate-100">
                {save.name}
              </span>
              <span className="block truncate text-xs text-slate-400">
                {save.screenType} · {formatSavedAt(save.savedAt)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
