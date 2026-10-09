// DreamscapeJourneyMenu — the top-left utility menu for the Cumulus journey map
// screens (the dreamscape and the Dream Atlas). The shared JourneyUtilityMenu
// renders its root actions here as app-shell corner chrome, and the New Journey
// confirmation as a popup glass dialog.

import type { ReactElement } from "react";
import type { JourneyMutationSource } from "../state/journey-context";
import {GLYPHS } from "../cumulus/primitives/glyph";
import { token } from "../cumulus/primitives/tokens";
import { useIsDesktop } from "../cumulus/primitives/use-is-desktop";
import { GlassButton } from "../cumulus/components/controls/GlassButton";
import { CommandMenu } from "../cumulus/components/overlay/CommandMenu";
import { GlassDialog } from "../cumulus/components/overlay/GlassDialog";
import {
  useJourneyUtilityMenuController,
  type JourneyUtilityMenuAction,
  type NewJourneyConfirmationModel,
} from "./JourneyUtilityMenuController";

/** Maximum prose width (px) of the New Journey confirmation. */
const NEW_JOURNEY_CONFIRMATION_MAX_WIDTH_PX = 420;

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
   * because only the event-log-backed `GameJourneyProvider` supplies it
   * (matching the HUD).
   */
  onLoadJourneyState?: (
    state: unknown,
    source: JourneyMutationSource,
  ) => void;
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
  const developerActions: JourneyUtilityMenuAction[] = [
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
      label: "Edit Journey State",
      onCommand: onOpenJourneyEditor,
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
  const actions: JourneyUtilityMenuAction[] = [
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
    // Developer surfaces exist only in development builds (P7).
    ...(import.meta.env.DEV ? developerActions : []),
  ];

  const model = useJourneyUtilityMenuController({
    actions,
    builtIns: [
      "newJourney",
      "saveJourney",
      "loadJourney",
      "buildSha",
      "exportLog",
    ],
    onLoadJourneyState,
    saveSource: "dreamscape_menu_save_journey",
    loadSource: "dreamscape_menu_load_journey",
  });

  return (
    <>
      <CommandMenu
        model={{
          kind: "appChrome",
          trigger: {
            glyph: isDesktop ? GLYPHS.gear : GLYPHS.menu,
            label: "Open menu",
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
      {model.newJourneyConfirmation !== null && (
        <NewJourneyConfirmation confirmation={model.newJourneyConfirmation} />
      )}
    </>
  );
}

/** Asks the player to confirm leaving this journey for a new one. */
function NewJourneyConfirmation({
  confirmation,
}: {
  confirmation: NewJourneyConfirmationModel;
}): ReactElement {
  return (
    <GlassDialog
      title="Begin a New Journey?"
      presentation="popup"
      onClose={confirmation.onCancel}
      closeLabel="Cancel"
    >
      <div
        data-new-journey-confirmation=""
        style={{
          display: "grid",
          gap: token("--space-m"),
          maxWidth: NEW_JOURNEY_CONFIRMATION_MAX_WIDTH_PX,
        }}
      >
        <p
          style={{
            margin: 0,
            color: token("--text-on-glass"),
            font: token("--t-body"),
          }}
        >
          You will choose a new Avatar and set out afresh. This journey stays
          saved in this browser, and its current address returns you to it.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: token("--space-xs"),
          }}
        >
          <GlassButton
            label="Cancel"
            placement="onGlass"
            testId="new-journey-cancel"
            onPress={confirmation.onCancel}
          />
          <GlassButton
            label="Begin"
            variant="accent"
            placement="onGlass"
            testId="new-journey-confirm"
            onPress={confirmation.onConfirm}
          />
        </div>
      </div>
    </GlassDialog>
  );
}
