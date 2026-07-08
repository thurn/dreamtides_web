// DreamscapeQuestMenu — the top-left utility menu for the Tango quest map
// screens (the dreamscape and the Dream Atlas). Those screens suppress the
// legacy bottom HUD, so the shared QuestUtilityMenu renders its root actions
// here as App-shell corner chrome.

import type { QuestState } from "../types/quest";
import { Pressable } from "../tango/primitives/Pressable";
import { token } from "../tango/primitives/tokens";
import { useIsDesktop } from "../tango/screens/use-is-desktop";
import { glassIconButtonChrome } from "../tango/internal/control-treatment";
import { QuestUtilityMenu, type QuestUtilityMenuAction } from "./QuestUtilityMenu";

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

/**
 * The dreamscape's top-left utility menu. Renders the screen-appropriate trigger
 * and, while open, the dropdown of quest actions (with a Load-Quest submenu).
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
  const isDesktop = useIsDesktop();
  // Trigger sizing. Both platforms wear the same compact circular glass icon
  // button that clears the 44px touch floor; only the corner and glyph differ.
  // Mobile anchors the menu glyph to the top-left corner; desktop anchors the
  // gear glyph to the top-right. The edge inset keeps the disc clear of the
  // screen corner (more so on desktop, where there is no safe-area inset doing
  // that job).
  const menuBtnSize = 48;
  const menuGlyphSize = 26;
  const menuEdgeInset = isDesktop ? 22 : 18;
  const actions: QuestUtilityMenuAction[] = [
    { id: "deck", icon: "bxf bx-rectangle-vertical", label: "View Deck", onClick: onOpenDeckViewer },
    { id: "glossary", icon: "bxf bx-book-open", label: "Glossary", onClick: onOpenGlossary },
    { id: "pool", icon: "bxf bx-grid", label: "Pool Viewer", onClick: onOpenPoolViewer },
    ...(hasDraftData
      ? [{ id: "package", icon: "bxf bx-package", label: "Package Debug", onClick: onOpenDebugScreen }]
      : []),
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
    top: "calc(100% + 6px)",
    zIndex: 62,
    width: 220,
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
      className="tango"
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
        variant="tango"
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
          <Pressable
            as="button"
            onClick={toggle}
            aria-label="Open menu"
            aria-expanded={open}
            data-testid="dreamscape-menu-button"
            style={{
              width: menuBtnSize,
              height: menuBtnSize,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              color: token("--text-on-accent"),
              fontSize: menuGlyphSize,
              cursor: "pointer",
              ...glassIconButtonChrome(),
            }}
          >
            <i
              className={isDesktop ? "bxf bx-cog" : "bxf bx-menu"}
              aria-hidden="true"
            />
          </Pressable>
        )}
      />
    </div>
  );
}
