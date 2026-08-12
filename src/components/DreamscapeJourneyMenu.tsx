// DreamscapeJourneyMenu — the top-left utility menu for the Cumulus journey map
// screens (the dreamscape and the Dream Atlas). The shared JourneyUtilityMenu
// renders its root actions here as app-shell corner chrome.

import type { JourneyState } from "../types/journey";
import {GLYPHS } from "../cumulus/primitives/glyph";
import { useIsDesktop } from "../cumulus/screens/use-is-desktop";
import { MENU_BUTTON_PX } from "../cumulus/screens/chrome-geometry";
import { CommandMenu } from "../cumulus/components/overlay/CommandMenu";
import {
  useJourneyUtilityMenuController,
  type JourneyUtilityMenuAction,
} from "./JourneyUtilityMenuController";
import { meaning, tx } from "@trox/runtime";

/** The App-shell overlay handlers the menu triggers. */
interface DreamscapeJourneyMenuProps {
  onOpenDeckViewer: () => void;
  onOpenPoolViewer: () => void;
  onOpenDebugScreen: () => void;
  onOpenJourneyEditor: () => void;
  onToggleCardSourceOverlay: () => void;
  /** Package Debug is only meaningful once a pool has been resolved. */
  hasDraftData: boolean;
  hasCardSourceDebug: boolean;
  isCardSourceOverlayOpen: boolean;
  /**
   * Replaces the running journey with a saved snapshot loaded by name. Optional
   * because only the live multiplayer provider supplies it (matching the HUD).
   */
  onLoadJourneyState?: (state: JourneyState, source: string) => void;
  /**
   * Debug: rebuild the atlas with the current generation logic. Supplied only
   * on the atlas screen; when present, a "Regenerate Atlas" row is shown.
   */
  onRegenerateAtlas?: () => void;
  /** Screen-specific debug commands supplied by the active Cumulus route. */
  contextualActions?: readonly JourneyUtilityMenuAction[];
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
 * and, while open, the dropdown of journey actions (with a Load-Journey submenu).
 */
export function DreamscapeJourneyMenu({
  onOpenDeckViewer,
  onOpenPoolViewer,
  onOpenDebugScreen,
  onOpenJourneyEditor,
  onToggleCardSourceOverlay,
  hasDraftData,
  hasCardSourceDebug,
  isCardSourceOverlayOpen,
  onLoadJourneyState,
  onRegenerateAtlas,
  contextualActions = [],
  elevated = false,
}: DreamscapeJourneyMenuProps) {
  const isDesktop = useIsDesktop();
  const actions: JourneyUtilityMenuAction[] = [
    {
      id: "deck",
      kind: "action",
      glyph: GLYPHS.affiliationRow,
      label: tx(
        "View Deck",
        "Normal Journey utility-menu actions. These labels are visible in the shared app chrome; debug-labelled actions remain in the same menu only when their route supplies the corresponding developer capability.",
      ),
      onCommand: onOpenDeckViewer,
    },
    {
      id: "pool",
      kind: "action",
      glyph: GLYPHS.grid,
      label: tx(
        meaning("pool-viewer-action", "Pool Viewer"),
        "Player-facing message for the journey menu pool viewer action interface state.",
      ),
      onCommand: onOpenPoolViewer,
    },
    ...(hasDraftData
      ? [
          {
            id: "package",
            kind: "action" as const,
            glyph: GLYPHS.package,
            label: tx(
              "Package Debug",
              "Player-facing message for the journey menu package debug action interface state.",
            ),
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
            label: tx(
              "Card Sources",
              "Player-facing message for the journey menu card sources action interface state.",
            ),
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
      label: tx(
        "Edit Journey State",
        "Player-facing message for the journey menu edit state action interface state.",
      ),
      onCommand: onOpenJourneyEditor,
    },
    ...(onRegenerateAtlas !== undefined
      ? [
          {
            id: "regenerateAtlas",
            kind: "action" as const,
            glyph: GLYPHS.refresh,
            label: tx(
              "Regenerate Atlas",
              "Player-facing message for the journey menu regenerate atlas action interface state.",
            ),
            onCommand: onRegenerateAtlas,
          },
        ]
      : []),
  ];

  const model = useJourneyUtilityMenuController({
    actions,
    builtIns: ["saveJourney", "loadJourney", "buildSha", "downloadLog"],
    onLoadJourneyState,
    saveSource: "dreamscape_menu_save_journey",
    loadSource: "dreamscape_menu_load_journey",
  });

  return (
    <CommandMenu
      model={{
        kind: "appChrome",
        trigger: {
          glyph: isDesktop ? GLYPHS.gear : GLYPHS.menu,
          label: tx(
            "Open menu",
            "Player-facing message for the journey menu open action interface state.",
          ),
          corner: isDesktop ? "topEnd" : "topStart",
        },
        actions: model.actions,
        status:
          model.status === null
            ? undefined
            : { text: model.status, testId: "dreamscape-menu-status" },
        elevated,
        testId: "dreamscape-menu-button",
      }}
    />
  );
}
