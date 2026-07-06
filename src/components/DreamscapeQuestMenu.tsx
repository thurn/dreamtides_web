// DreamscapeQuestMenu — the top-left utility menu for the Tango quest map
// screens (the dreamscape and the Dream Atlas). Those screens suppress the
// legacy bottom HUD (the persistent bar is re-homed into the Tango
// `QuestStatusBar`), so the HUD's utility actions — deck viewer, glossary, pool
// viewer, save/load, and the debug tools — are re-homed here: a floating
// hamburger in the top-left corner that drops a solid-surface menu, styled from
// Tango tokens and pressed through the shared `Pressable` feedback. The atlas
// screen additionally supplies its debug "Regenerate Atlas" action here.
//
// It is App-shell chrome (mounted beside the screen router, like the legacy
// HUD), so it owns its own open/submenu/save state and wires the App's overlay
// handlers directly. Save/Load talk to the same saved-quest dev-server routes
// the legacy HUD uses.

import { useEffect, useRef, useState } from "react";
import { useQuest } from "../state/quest-context";
import { downloadLog, logEvent } from "../logging";
import {
  getSavedQuest,
  listSavedQuests,
  saveQuest,
  type SavedQuestSummary,
} from "../state/saved-quests";
import { BUILD_GIT_SHA } from "../runtime/build-info";
import type { QuestState } from "../types/quest";
import { Pressable } from "../tango/primitives/Pressable";
import { token } from "../tango/primitives/tokens";
import { useIsDesktop } from "../tango/screens/use-is-desktop";
import { glassIconButtonChrome } from "../tango/components/controls/control-treatment";

/** The App-shell overlay handlers the menu triggers. */
interface DreamscapeQuestMenuProps {
  onOpenDeckViewer: () => void;
  onOpenGlossary: () => void;
  onOpenPoolViewer: () => void;
  onOpenDebugScreen: () => void;
  onOpenQuestEditor: () => void;
  /** Package Debug is only meaningful once a pool has been resolved. */
  hasDraftData: boolean;
  /**
   * Replaces the running quest with a saved snapshot loaded by name. Optional
   * because only the live multiplayer provider supplies it (matching the HUD).
   */
  onLoadQuestState?: (state: QuestState, source: string) => void;
  /**
   * Debug: rebuild the atlas with the current generation logic. Supplied only
   * on the atlas screen; when present, a "Regenerate Atlas" row is shown.
   */
  onRegenerateAtlas?: () => void;
  /**
   * Lifts the menu above a full-screen overlay so it stays reachable from on
   * top of it — set while the mobile deck viewer is open, which otherwise
   * paints over this corner chrome.
   */
  elevated?: boolean;
}

type MenuView = "root" | "load";
type LoadStatus = "idle" | "loading" | "ready" | "error";

/** One row in the dropdown: a glyph, a label, and its action. */
function MenuRow({
  icon,
  label,
  accent = false,
  onClick,
}: {
  icon: string;
  label: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <Pressable
      as="div"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 10px",
        borderRadius: token("--radius-inset"),
        color: accent ? token("--accent-bright") : token("--text-secondary"),
        font: token("--t-body"),
        cursor: "pointer",
      }}
    >
      <i
        className={icon}
        aria-hidden="true"
        style={{ fontSize: 17, color: accent ? token("--accent-bright") : token("--text-faint") }}
      />
      {label}
    </Pressable>
  );
}

/**
 * The dreamscape's top-left utility menu. Renders the hamburger trigger and,
 * while open, the dropdown of quest actions (with a Load-Quest submenu).
 */
export function DreamscapeQuestMenu({
  onOpenDeckViewer,
  onOpenGlossary,
  onOpenPoolViewer,
  onOpenDebugScreen,
  onOpenQuestEditor,
  hasDraftData,
  onLoadQuestState,
  onRegenerateAtlas,
  elevated = false,
}: DreamscapeQuestMenuProps) {
  const { state } = useQuest();
  const isDesktop = useIsDesktop();
  // Trigger sizing. The button clears the 44px touch floor on mobile and grows
  // again on desktop to sit alongside the larger dreamscape chrome; the edge
  // inset keeps it clear of the screen corner (more so on desktop, where there
  // is no safe-area inset doing that job).
  const menuBtnSize = isDesktop ? 56 : 48;
  const menuGlyphSize = isDesktop ? 30 : 26;
  const menuEdgeInset = isDesktop ? 22 : 18;
  const [open, setOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>("root");
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [loadSaves, setLoadSaves] = useState<SavedQuestSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const statusTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current !== null) {
        clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  function flashStatus(text: string): void {
    setStatus(text);
    if (statusTimerRef.current !== null) {
      clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = window.setTimeout(() => {
      setStatus(null);
      statusTimerRef.current = null;
    }, 4000);
  }

  function closeMenu(): void {
    setOpen(false);
    setMenuView("root");
  }

  function runAction(action: () => void): void {
    closeMenu();
    action();
  }

  async function handleSaveQuest(): Promise<void> {
    closeMenu();
    const entered = window.prompt(
      'Save current quest as (reload with `npm run load-quest -- "<name>"`):',
    );
    if (entered === null) {
      return;
    }
    const trimmed = entered.trim();
    if (trimmed === "") {
      flashStatus("Save cancelled: a name is required.");
      return;
    }
    try {
      const summary = await saveQuest(trimmed, state);
      logEvent("debug_quest_saved", {
        source: "dreamscape_menu_save_quest",
        name: summary.name,
        screen: summary.screenType,
      });
      flashStatus(`Saved "${summary.name}".`);
    } catch (error) {
      flashStatus(
        error instanceof Error ? error.message : "Failed to save quest.",
      );
    }
  }

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
          error instanceof Error ? error.message : "Failed to list saved quests.",
        );
        setLoadStatus("error");
      });
  }

  async function handleSelectLoad(summary: SavedQuestSummary): Promise<void> {
    if (onLoadQuestState === undefined) {
      flashStatus("Loading is unavailable in this context.");
      return;
    }
    try {
      const loaded = await getSavedQuest(summary.name);
      if (loaded === null) {
        flashStatus(`Saved quest "${summary.name}" could not be found.`);
        return;
      }
      logEvent("debug_quest_loaded", {
        source: "dreamscape_menu_load_quest",
        name: summary.name,
        screen: loaded.screen?.type ?? "unknown",
      });
      onLoadQuestState(loaded, "dreamscape_menu_load_quest");
      closeMenu();
      flashStatus(`Loaded "${summary.name}".`);
    } catch (error) {
      flashStatus(
        error instanceof Error ? error.message : "Failed to load quest.",
      );
    }
  }

  function handleViewBuildSha(): void {
    closeMenu();
    logEvent("build_sha_viewed", {
      source: "dreamscape_menu",
      gitSha: BUILD_GIT_SHA,
    });
    flashStatus(`Build Git SHA: ${BUILD_GIT_SHA}`);
  }

  const panelStyle = {
    position: "absolute",
    left: 0,
    top: "calc(100% + 6px)",
    zIndex: 62,
    width: 220,
    padding: 6,
    background: token("--surface-glass-strong"),
    border: `1px solid ${token("--border-soft")}`,
    borderRadius: token("--radius-control"),
    boxShadow: token("--shadow-lg"),
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } as const;

  return (
    <div
      className="tango"
      data-dreamscape-menu=""
      style={{
        position: "fixed",
        top: `max(env(safe-area-inset-top), ${String(menuEdgeInset)}px)`,
        left: `max(env(safe-area-inset-left), ${String(menuEdgeInset)}px)`,
        // Above the deck-viewer overlay (z 60) when it is open, so the menu stays
        // reachable from on top of it; the default corner chrome level otherwise.
        zIndex: elevated ? 65 : 60,
      }}
    >
      <Pressable
        as="button"
        onClick={() => {
          setMenuView("root");
          setOpen((value) => !value);
        }}
        aria-label="Open menu"
        aria-expanded={open}
        data-testid="dreamscape-menu-button"
        style={{
          width: menuBtnSize,
          height: menuBtnSize,
          display: "grid",
          placeItems: "center",
          color: token("--text-primary"),
          fontSize: menuGlyphSize,
          cursor: "pointer",
          // The shared glass icon-button surface — a fully-round liquid-glass
          // disc, matching the deck viewer's close control and glass filter/sort
          // controls, on the dreamscape and while elevated over the deck viewer.
          ...glassIconButtonChrome(),
        }}
      >
        <i className="bxf bx-menu" aria-hidden="true" />
      </Pressable>

      {open && (
        <>
          <div
            onClick={closeMenu}
            style={{ position: "fixed", inset: 0, zIndex: 61 }}
          />
          <div data-testid="dreamscape-menu" style={panelStyle}>
            {menuView === "root" ? (
              <>
                <MenuRow icon="bxf bx-rectangle-vertical" label="View Deck" onClick={() => runAction(onOpenDeckViewer)} />
                <MenuRow icon="bxf bx-book-open" label="Glossary" onClick={() => runAction(onOpenGlossary)} />
                <MenuRow icon="bxf bx-grid" label="Pool Viewer" onClick={() => runAction(onOpenPoolViewer)} />
                {hasDraftData && (
                  <MenuRow icon="bxf bx-package" label="Package Debug" onClick={() => runAction(onOpenDebugScreen)} />
                )}
                <MenuRow icon="bxf bx-edit-alt" label="Edit Quest State" onClick={() => runAction(onOpenQuestEditor)} />
                {onRegenerateAtlas !== undefined && (
                  <MenuRow icon="bxf bx-refresh-cw" label="Regenerate Atlas" onClick={() => runAction(onRegenerateAtlas)} />
                )}
                <MenuRow icon="bxf bx-save" label="Save Quest" onClick={() => void handleSaveQuest()} />
                {onLoadQuestState !== undefined && (
                  <MenuRow icon="bxf bx-folder-open" label="Load Quest" onClick={handleOpenLoadMenu} />
                )}
                <MenuRow icon="bxf bx-code-alt" label="Build SHA" onClick={handleViewBuildSha} />
                <MenuRow icon="bxf bx-arrow-to-bottom" label="Download Log" onClick={() => runAction(downloadLog)} />
              </>
            ) : (
              <LoadSubmenu
                status={loadStatus}
                saves={loadSaves}
                error={loadError}
                onBack={() => setMenuView("root")}
                onRetry={handleOpenLoadMenu}
                onSelect={(summary) => void handleSelectLoad(summary)}
              />
            )}
          </div>
        </>
      )}

      {status !== null && !open && (
        <div
          role="status"
          data-testid="dreamscape-menu-status"
          style={{
            position: "absolute",
            left: 0,
            top: "calc(100% + 6px)",
            zIndex: 62,
            maxWidth: 260,
            padding: "8px 10px",
            background: token("--surface-glass-strong"),
            border: `1px solid ${token("--border-soft")}`,
            borderRadius: token("--radius-control"),
            boxShadow: token("--shadow-lg"),
            color: token("--text-secondary"),
            font: token("--t-caption"),
          }}
        >
          {status}
        </div>
      )}
    </div>
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

/** The "Load Quest" view: a back control plus the fetched saved-quest list. */
function LoadSubmenu({
  status,
  saves,
  error,
  onBack,
  onRetry,
  onSelect,
}: {
  status: LoadStatus;
  saves: SavedQuestSummary[];
  error: string | null;
  onBack: () => void;
  onRetry: () => void;
  onSelect: (summary: SavedQuestSummary) => void;
}) {
  return (
    <div data-testid="dreamscape-load-menu" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <MenuRow icon="bxf bx-chevron-left" label="Back" onClick={onBack} />
      <div style={{ height: 1, margin: "2px 6px", background: token("--border-soft") }} />
      {status === "loading" && (
        <p style={{ padding: "8px 10px", margin: 0, color: token("--text-muted"), font: token("--t-caption") }}>
          Loading saved quests…
        </p>
      )}
      {status === "error" && (
        <div style={{ padding: "8px 10px", color: token("--text-muted"), font: token("--t-caption") }}>
          <p style={{ margin: 0 }}>{error ?? "Failed to list saved quests."}</p>
          <Pressable as="div" onClick={onRetry} style={{ marginTop: 4, color: token("--accent-bright"), cursor: "pointer" }}>
            Retry
          </Pressable>
        </div>
      )}
      {status === "ready" && saves.length === 0 && (
        <p style={{ padding: "8px 10px", margin: 0, color: token("--text-muted"), font: token("--t-caption") }}>
          No saved quests.
        </p>
      )}
      {status === "ready" && saves.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: "50vh", overflow: "auto" }}>
          {saves.map((save) => (
            <Pressable
              as="div"
              key={save.name}
              data-load-quest-option={save.name}
              onClick={() => onSelect(save)}
              style={{ padding: "9px 10px", borderRadius: token("--radius-inset"), cursor: "pointer" }}
            >
              <span style={{ display: "block", color: token("--text-primary"), font: token("--t-body") }}>
                {save.name}
              </span>
              <span style={{ display: "block", color: token("--text-muted"), font: token("--t-caption") }}>
                {save.screenType} · {formatSavedAt(save.savedAt)}
              </span>
            </Pressable>
          ))}
        </div>
      )}
    </div>
  );
}
