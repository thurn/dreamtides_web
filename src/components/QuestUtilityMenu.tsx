import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { downloadLog, logEvent } from "../logging";
import { BUILD_GIT_SHA } from "../runtime/build-info";
import {
  getSavedQuest,
  listSavedQuests,
  saveQuest,
  type SavedQuestSummary,
} from "../state/saved-quests";
import { useQuest } from "../state/quest-context";
import { Pressable } from "../tango/primitives/Pressable";
import { token } from "../tango/primitives/tokens";
import type { QuestState } from "../types/quest";

type MenuView = "root" | "load";
type LoadStatus = "idle" | "loading" | "ready" | "error";
type QuestUtilityMenuVariant = "hud" | "tango";

export interface QuestUtilityMenuAction {
  id: string;
  label: string;
  onClick: () => void;
  icon?: string;
  active?: boolean;
  accent?: boolean;
  testId?: string;
}

type QuestUtilityMenuBuiltIn =
  | "saveQuest"
  | "loadQuest"
  | "downloadLog"
  | "buildSha";

interface QuestUtilityMenuProps {
  variant: QuestUtilityMenuVariant;
  actions: QuestUtilityMenuAction[];
  builtIns: QuestUtilityMenuBuiltIn[];
  onLoadQuestState?: (state: QuestState, source: string) => void;
  saveSource: string;
  loadSource: string;
  statusTestId: string;
  menuTestId: string;
  loadMenuTestId: string;
  panelStyle?: CSSProperties;
  panelClassName?: string;
  statusStyle?: CSSProperties;
  statusClassName?: string;
  overlay?: boolean;
  statusAnchor?: "left" | "right";
  renderTrigger: (props: {
    open: boolean;
    toggle: () => void;
  }) => ReactNode;
}

export function QuestUtilityMenu({
  variant,
  actions,
  builtIns,
  onLoadQuestState,
  saveSource,
  loadSource,
  statusTestId,
  menuTestId,
  loadMenuTestId,
  panelStyle,
  panelClassName,
  statusStyle,
  statusClassName,
  overlay = false,
  statusAnchor = "right",
  renderTrigger,
}: QuestUtilityMenuProps) {
  const { state } = useQuest();
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
        source: saveSource,
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
        source: loadSource,
        name: summary.name,
        screen: loaded.screen?.type ?? "unknown",
      });
      onLoadQuestState(loaded, loadSource);
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

  function toggle(): void {
    setMenuView("root");
    setOpen((value) => !value);
  }

  const renderedBuiltIns = builtIns
    .filter((builtIn) => builtIn !== "loadQuest" || onLoadQuestState !== undefined)
    .map((builtIn) => {
      switch (builtIn) {
        case "saveQuest":
          return {
            id: "saveQuest",
            icon: "bxf bx-save",
            label: "Save Quest",
            onClick: () => void handleSaveQuest(),
            testId: variant === "hud" ? "hud-save-quest-button" : undefined,
          };
        case "loadQuest":
          return {
            id: "loadQuest",
            icon: "bxf bx-folder-open",
            label: "Load Quest",
            onClick: handleOpenLoadMenu,
            testId: variant === "hud" ? "hud-load-quest-button" : undefined,
          };
        case "downloadLog":
          return {
            id: "downloadLog",
            icon: "bxf bx-arrow-to-bottom",
            label: "Download Log",
            onClick: () => runAction(downloadLog),
          };
        case "buildSha":
          return {
            id: "buildSha",
            icon: "bxf bx-code-alt",
            label: "Build SHA",
            onClick: handleViewBuildSha,
          };
      }
    });

  return (
    <>
      {renderTrigger({ open, toggle })}
      {open && (
        <>
          {overlay && (
            <div
              onClick={closeMenu}
              style={{ position: "fixed", inset: 0, zIndex: 61 }}
            />
          )}
          <div
            data-testid={menuTestId}
            className={panelClassName}
            style={panelStyle}
          >
            {menuView === "root" ? (
              <>
                {[...actions, ...renderedBuiltIns].map((action) => (
                  <MenuActionRow
                    key={action.id}
                    variant={variant}
                    action={action}
                    onClick={() => {
                      if (action.id === "loadQuest") {
                        action.onClick();
                      } else {
                        runAction(action.onClick);
                      }
                    }}
                  />
                ))}
              </>
            ) : (
              <LoadSubmenu
                variant={variant}
                testId={loadMenuTestId}
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
          data-testid={statusTestId}
          className={statusClassName}
          style={
            statusStyle ??
            (statusClassName === undefined
              ? defaultTangoStatusStyle(statusAnchor)
              : undefined)
          }
        >
          {status}
        </div>
      )}
    </>
  );
}

function MenuActionRow({
  variant,
  action,
  onClick,
}: {
  variant: QuestUtilityMenuVariant;
  action: QuestUtilityMenuAction;
  onClick: () => void;
}) {
  if (variant === "hud") {
    return (
      <button
        type="button"
        data-testid={action.testId}
        className="min-h-9 rounded-md px-3 text-left text-sm font-medium hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        style={{
          background: action.active ? "rgba(34, 211, 238, 0.18)" : "transparent",
          color: action.active ? "#cffafe" : "#e2e8f0",
        }}
        onClick={onClick}
      >
        {action.label}
      </button>
    );
  }

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
        color: action.accent ? token("--accent-bright") : token("--text-secondary"),
        font: token("--t-body"),
        cursor: "pointer",
      }}
    >
      {action.icon !== undefined && (
        <i
          className={action.icon}
          aria-hidden="true"
          style={{
            fontSize: 17,
            color: action.accent ? token("--accent-bright") : token("--text-faint"),
          }}
        />
      )}
      {action.label}
    </Pressable>
  );
}

function LoadSubmenu({
  variant,
  testId,
  status,
  saves,
  error,
  onBack,
  onRetry,
  onSelect,
}: {
  variant: QuestUtilityMenuVariant;
  testId: string;
  status: LoadStatus;
  saves: SavedQuestSummary[];
  error: string | null;
  onBack: () => void;
  onRetry: () => void;
  onSelect: (summary: SavedQuestSummary) => void;
}) {
  if (variant === "hud") {
    return (
      <div data-testid={testId} className="flex flex-col gap-1">
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
                onClick={() => onSelect(save)}
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

  return (
    <div data-testid={testId} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <MenuActionRow
        variant="tango"
        action={{ id: "back", icon: "bxf bx-chevron-left", label: "Back", onClick: onBack }}
        onClick={onBack}
      />
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

function defaultTangoStatusStyle(anchor: "left" | "right"): CSSProperties {
  return {
    position: "absolute",
    [anchor]: 0,
    top: "calc(100% + 6px)",
    zIndex: 62,
    maxWidth: 260,
    padding: "8px 10px",
    background: token("--surface-chrome-strong"),
    border: `1px solid ${token("--border-soft")}`,
    borderRadius: token("--radius-control"),
    boxShadow: token("--shadow-lg"),
    color: token("--text-secondary"),
    font: token("--t-caption"),
  };
}

function formatSavedAt(savedAt: string): string {
  const parsed = new Date(savedAt);
  if (Number.isNaN(parsed.getTime())) {
    return savedAt;
  }
  return parsed.toLocaleString();
}
