// DreamscapeQuestMenu — the top-left utility menu for the Cumulus quest map
// screens (the dreamscape and the Dream Atlas). Those screens suppress the
// legacy bottom HUD, so the shared QuestUtilityMenu renders its root actions
// here as App-shell corner chrome.

import type { QuestState } from "../types/quest";
import { token } from "../cumulus/primitives/tokens";
import { GLYPHS } from "../cumulus/primitives/glyph";
import { useIsDesktop } from "../cumulus/screens/use-is-desktop";
import {
  MENU_BUTTON_PX,
  MENU_EDGE_INSET_DESKTOP_PX,
  MENU_EDGE_INSET_MOBILE_PX,
} from "../cumulus/screens/chrome-geometry";
import { IconButton } from "../cumulus/components/controls/IconButton";
import { QuestUtilityMenu, type QuestUtilityMenuAction } from "./QuestUtilityMenu";

/** The App-shell overlay handlers the menu triggers. */
interface DreamscapeQuestMenuProps {
  onOpenDeckViewer: () => void;
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
  /** Screen-specific debug commands supplied by the active Cumulus route. */
  contextualActions?: readonly QuestUtilityMenuAction[];
  /**
   * Lifts the menu above a full-screen overlay so it stays reachable from on
   * top of it — set while the mobile deck viewer is open, which otherwise
   * paints over this corner chrome.
   */
  elevated?: boolean;
}

/**
 * The trigger disc's diameter. Both platforms wear the same compact circular
 * glass IconButton (`md`, a 48px disc that clears the 44px touch floor); only
 * the corner and glyph differ. Exported so the corner layout can reserve the
 * disc's footprint. The value flows from the shared chrome geometry
 * (`chrome-geometry.ts`), the source of truth both this menu and screens that
 * must clear it read; re-exported here for footprint-reserving consumers.
 */
export const menuBtnSize = MENU_BUTTON_PX;

/**
 * The dreamscape's top-left utility menu. Renders the screen-appropriate trigger
 * and, while open, the dropdown of quest actions (with a Load-Quest submenu).
 */
export function DreamscapeQuestMenu({
  onOpenDeckViewer,
  onOpenPoolViewer,
  onOpenDebugScreen,
  onOpenQuestEditor,
  hasDraftData,
  onLoadQuestState,
  onRegenerateAtlas,
  contextualActions = [],
  elevated = false,
}: DreamscapeQuestMenuProps) {
  const isDesktop = useIsDesktop();
  // Corner placement. Mobile anchors the menu glyph to the top-left corner;
  // desktop anchors the gear glyph to the top-right. The edge inset keeps the
  // disc clear of the screen corner (more so on desktop, where there is no
  // safe-area inset doing that job).
  const menuEdgeInset = isDesktop
    ? MENU_EDGE_INSET_DESKTOP_PX
    : MENU_EDGE_INSET_MOBILE_PX;
  const menuPanelGap = 6;
  const actions: QuestUtilityMenuAction[] = [
    { id: "deck", icon: "bxf bx-rectangle-vertical", label: "View Deck", onClick: onOpenDeckViewer },
    { id: "pool", icon: "bxf bx-grid", label: "Pool Viewer", onClick: onOpenPoolViewer },
    ...(hasDraftData
      ? [{ id: "package", icon: "bxf bx-package", label: "Package Debug", onClick: onOpenDebugScreen }]
      : []),
    ...contextualActions,
    { id: "editor", icon: "bxf bx-edit-alt", label: "Edit Quest State", onClick: onOpenQuestEditor },
    ...(onRegenerateAtlas !== undefined
      ? [{ id: "regenerateAtlas", icon: "bxf bx-refresh-cw", label: "Regenerate Atlas", onClick: onRegenerateAtlas }]
      : []),
  ];

  const panelStyle = {
    position: "absolute",
    // Anchor the dropdown under whichever corner the trigger occupies so it opens
    // inward and never off the screen edge (right corner on desktop, left on mobile).
    ...(isDesktop ? { right: 0 } : { left: 0 }),
    top: `calc(100% + ${String(menuPanelGap)}px)`,
    zIndex: 62,
    width: 220,
    maxHeight: `calc(100dvh - max(var(--safe-area-inset-top), ${String(menuEdgeInset)}px) - ${String(MENU_BUTTON_PX)}px - ${String(menuPanelGap)}px - max(var(--safe-area-inset-bottom), ${String(menuEdgeInset)}px))`,
    overflowY: "auto",
    padding: 6,
    background: token("--surface-chrome-strong"),
    border: `1px solid ${token("--border-soft")}`,
    borderRadius: token("--radius-control"),
    boxShadow: token("--shadow-lg"),
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } as const;

  return (
    <div
      className="cumulus"
      data-dreamscape-menu=""
      style={{
        position: "fixed",
        top: `max(var(--safe-area-inset-top), ${String(menuEdgeInset)}px)`,
        // Desktop anchors the glass gear button to the top-right corner; mobile
        // keeps the glass menu button in the top-left.
        ...(isDesktop
          ? { right: `max(var(--safe-area-inset-right), ${String(menuEdgeInset)}px)` }
          : { left: `max(var(--safe-area-inset-left), ${String(menuEdgeInset)}px)` }),
        // Above the deck-viewer overlay (z 60) when it is open, so the menu stays
        // reachable from on top of it; the default corner chrome level otherwise.
        zIndex: elevated ? 65 : 60,
      }}
    >
      <QuestUtilityMenu
        variant="cumulus"
        actions={actions}
        builtIns={["saveQuest", "loadQuest", "buildSha", "downloadLog"]}
        onLoadQuestState={onLoadQuestState}
        saveSource="dreamscape_menu_save_quest"
        loadSource="dreamscape_menu_load_quest"
        menuTestId="dreamscape-menu"
        loadMenuTestId="dreamscape-load-menu"
        statusTestId="dreamscape-menu-status"
        panelStyle={panelStyle}
        overlay
        statusAnchor={isDesktop ? "right" : "left"}
        renderTrigger={({ open, toggle }) => (
          <IconButton
            size="md"
            glyph={isDesktop ? GLYPHS.gear : GLYPHS.menu}
            label="Open menu"
            ariaExpanded={open}
            testId="dreamscape-menu-button"
            onPress={toggle}
          />
        )}
      />
    </div>
  );
}
