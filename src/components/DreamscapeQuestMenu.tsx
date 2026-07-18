// DreamscapeQuestMenu — the top-left utility menu for the Cumulus quest map
// screens (the dreamscape and the Dream Atlas). The shared QuestUtilityMenu
// renders its root actions here as app-shell corner chrome.

import type { QuestState } from "../types/quest";
import { GLYPHS } from "../cumulus/primitives/glyph";
import { useIsDesktop } from "../cumulus/screens/use-is-desktop";
import { MENU_BUTTON_PX } from "../cumulus/screens/chrome-geometry";
import { CornerUtilityMenu } from "../cumulus/components/overlay/CommandMenus";
import {
  useQuestUtilityMenuController,
  type QuestUtilityMenuAction,
} from "./QuestUtilityMenuController";

/** The App-shell overlay handlers the menu triggers. */
interface DreamscapeQuestMenuProps {
  onOpenDeckViewer: () => void;
  onOpenPoolViewer: () => void;
  onOpenDebugScreen: () => void;
  onOpenQuestEditor: () => void;
  onToggleCardSourceOverlay: () => void;
  /** Package Debug is only meaningful once a pool has been resolved. */
  hasDraftData: boolean;
  hasCardSourceDebug: boolean;
  isCardSourceOverlayOpen: boolean;
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
  onToggleCardSourceOverlay,
  hasDraftData,
  hasCardSourceDebug,
  isCardSourceOverlayOpen,
  onLoadQuestState,
  onRegenerateAtlas,
  contextualActions = [],
  elevated = false,
}: DreamscapeQuestMenuProps) {
  const isDesktop = useIsDesktop();
  const actions: QuestUtilityMenuAction[] = [
    {
      id: "deck",
      kind: "action",
      glyph: GLYPHS.affiliationRow,
      label: "View Deck",
      onCommand: onOpenDeckViewer,
    },
    {
      id: "pool",
      kind: "action",
      glyph: GLYPHS.grid,
      label: "Pool Viewer",
      onCommand: onOpenPoolViewer,
    },
    ...(hasDraftData
      ? [
          {
            id: "package",
            kind: "action" as const,
            glyph: GLYPHS.package,
            label: "Package Debug",
            onCommand: onOpenDebugScreen,
          },
        ]
      : []),
    ...(hasCardSourceDebug
      ? [
          {
            id: "cardSource",
            kind: "action" as const,
            glyph: GLYPHS.list,
            label: "Card Sources",
            active: isCardSourceOverlayOpen,
            onCommand: onToggleCardSourceOverlay,
          },
        ]
      : []),
    ...contextualActions,
    {
      id: "editor",
      kind: "action",
      glyph: GLYPHS.edit,
      label: "Edit Quest State",
      onCommand: onOpenQuestEditor,
    },
    ...(onRegenerateAtlas !== undefined
      ? [
          {
            id: "regenerateAtlas",
            kind: "action" as const,
            glyph: GLYPHS.refresh,
            label: "Regenerate Atlas",
            onCommand: onRegenerateAtlas,
          },
        ]
      : []),
  ];

  const model = useQuestUtilityMenuController({
    actions,
    builtIns: ["saveQuest", "loadQuest", "buildSha", "downloadLog"],
    onLoadQuestState,
    saveSource: "dreamscape_menu_save_quest",
    loadSource: "dreamscape_menu_load_quest",
  });

  return (
    <CornerUtilityMenu
      trigger={{
        glyph: isDesktop ? GLYPHS.gear : GLYPHS.menu,
        label: "Open menu",
        corner: isDesktop ? "topEnd" : "topStart",
      }}
      actions={model.actions}
      status={
        model.status === null
          ? undefined
          : { text: model.status, testId: "dreamscape-menu-status" }
      }
      elevated={elevated}
      testId="dreamscape-menu-button"
    />
  );
}
