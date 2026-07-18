/**
 * Checked ownership inventory for shipped UI that lives outside `src/cumulus/`.
 *
 * The Cumulus tree owns reusable presentation. This module names the temporary
 * and permanent reasons a shipped outer UI file still exists, so path prefixes
 * cannot silently become an architectural escape hatch.
 */
export const OUTER_UI_ROLES = Object.freeze({
  STATE_ADAPTER: "state-adapter-or-view-model-builder",
  APP_SHELL: "app-shell-or-controller",
  PENDING_PRESENTATION: "pending-cumulus-presentation-migration",
  OPERATOR_TOOL: "standalone-operator-tool",
  DEVTOOL: "cumulus-devtool-or-conformance-fixture",
  EMERGENCY_FALLBACK: "emergency-fallback",
  VENDOR_ASSET: "vendor-asset",
});

/** Every production TSX and CSS file outside src/cumulus/, keyed by repo path. */
const fileRoles = {
  "src/App.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/main.tsx": OUTER_UI_ROLES.APP_SHELL,
  // The entry sheet owns only the app-wide reset, cursor affordance, and
  // globally inherited legacy color bridge; product presentation belongs to
  // Cumulus closures.
  "src/index.css": OUTER_UI_ROLES.APP_SHELL,
  "src/editor/card-editor.css": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/editor/editable-figment.css": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/vendor/boxicons/boxicons.css": OUTER_UI_ROLES.VENDOR_ASSET,
  "src/vendor/boxicons/boxicons-filled.css": OUTER_UI_ROLES.VENDOR_ASSET,
  "src/vendor/boxicons/boxicons-logos.css": OUTER_UI_ROLES.VENDOR_ASSET,

  "src/components/BattleSiteRoute.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/components/CumulusQuestChrome.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/components/DreamscapeQuestMenu.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/components/ErrorBoundary.tsx": OUTER_UI_ROLES.EMERGENCY_FALLBACK,
  "src/components/FrontDoorRouter.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/components/ScreenRouter.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/battle/components/BattleCardNoteEditor.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/BattleContextMenu.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/BattleDeckOrderPicker.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/BattleDreamwellHistoryDrawer.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/BattleFigmentCreator.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/BattleLogDrawer.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/CumulusBattleForeseeOverlay.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/CumulusBattleZoneBrowser.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/PlayableBattleScreen.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/battle/components/PoolViewerFloatingController.tsx": OUTER_UI_ROLES.APP_SHELL,

  "src/coop/BounceToast.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/coop/ConfigGateScreen.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/coop/EventLogViewer.tsx": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/coop/FrontDoorApp.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/coop/RoomGate.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/coop/UnreadableRoomScreen.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/coop/VersionGateScreen.tsx": OUTER_UI_ROLES.APP_SHELL,

  "src/debug/OffersDebugApp.tsx": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/debug/OpponentDebugApp.tsx": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/debug/SignatureDecksApp.tsx": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/debug/opponent-algorithms.tsx": OUTER_UI_ROLES.OPERATOR_TOOL,

  "src/image_viewer/ImageGrid.tsx": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/image_viewer/ImageViewerApp.tsx": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/image_viewer/ImageViewerToolbar.tsx": OUTER_UI_ROLES.OPERATOR_TOOL,

  "src/screens/CardSourceOverlay.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/screens/DebugScreen.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/screens/QuestDebugEditor.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/state/coop-quest-context.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/state/front-door-context.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/state/quest-context.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
};

for (const name of [
  "AtlasScreenAdapter", "BattleStartScreenAdapter", "CardShopSiteScreenAdapter",
  "DesktopDeckViewerAdapter", "DraftSiteScreenAdapter", "DreamAugurySiteScreenAdapter", "PoolViewerAdapter",
  "DreamscapeScreenAdapter", "DreamsignBazaarSiteScreenAdapter",
  "DreamsignRevelationScreenAdapter", "DuplicationSiteScreenAdapter",
  "LoadingScreenAdapter",
  "MobileBattleScreenAdapter", "MobileDeckViewerAdapter", "PurgeSiteScreenAdapter",
  "MainMenuScreenAdapter",
  "QuestCompleteScreenAdapter", "QuestFailedScreenAdapter", "QuestStartScreenAdapter",
  "StartingDeckOverlayAdapter", "TransfigurationSiteScreenAdapter",
  "TutorialScreenAdapter",
  "WorkInProgressSiteScreenAdapter", "registry",
]) {
  // The registry is the production resolver; the rest are state/effect wiring.
  fileRoles[`src/screens/cumulus_adapters/${name}.tsx`] = OUTER_UI_ROLES.STATE_ADAPTER;
}

for (const name of [
  "CardEditorApp", "CardEditorGrid", "CardEditorToolbar", "CardTagEditor",
  "DreamcallerDetailView", "DreamcallerEditorApp", "DreamcallerEditorGrid",
  "DreamcallerEditorToolbar", "DreamscapeEditorApp", "DreamscapeEditorToolbar",
  "DreamscapeResidents", "DreamsignEditorApp", "DreamsignEditorGrid",
  "DreamsignEditorToolbar", "DreamwellEditorApp", "DreamwellEditorPreview", "DreamwellEditorToolbar",
  "EditableCard", "EditableDreamcaller", "EditableDreamscape", "EditableDreamsign",
  "EditableDreamwell", "EditableField", "EditableFigment", "FigmentEditorApp",
  "FocusedCardEditor", "ManageTagsModal", "TagChip", "TagFilterControl",
  "TidePoolModal", "TideSourcePreview", "TidesDetailView", "TidesEditorApp",
  "TidesListView",
]) {
  fileRoles[`src/editor/${name}.tsx`] = OUTER_UI_ROLES.OPERATOR_TOOL;
}

for (const name of [
  "CardBrowserGrid", "CardBrowserToolbar", "MtgNameTooltip",
]) {
  fileRoles[`src/editor/card-browser/${name}.tsx`] = OUTER_UI_ROLES.OPERATOR_TOOL;
}

export const OUTER_UI_FILE_ROLES = Object.freeze(fileRoles);

export const OUTER_UI_ROLE_VALUES = Object.freeze(Object.values(OUTER_UI_ROLES));

export function outerUiRole(fileRelative) {
  return OUTER_UI_FILE_ROLES[fileRelative] ?? null;
}

export function isOuterUiFile(fileRelative) {
  return outerUiRole(fileRelative) !== null;
}

export function isStrictOuterPresentation(fileRelative) {
  return outerUiRole(fileRelative) === OUTER_UI_ROLES.PENDING_PRESENTATION;
}

export function isUniversalOuterUi(fileRelative) {
  const role = outerUiRole(fileRelative);
  return role !== null && role !== OUTER_UI_ROLES.VENDOR_ASSET;
}

/** Shared scope gate for composition rules with their own Cumulus exemptions. */
export function isStrictCompositionFile(fileRelative, cumulusExemptPrefixes) {
  if (
    isStrictOuterPresentation(fileRelative) ||
    fileRelative.startsWith("src/screens/cumulus_adapters/")
  ) {
    return true;
  }
  return (
    fileRelative.startsWith("src/cumulus/") &&
    !cumulusExemptPrefixes.some((prefix) => fileRelative.startsWith(prefix))
  );
}

/** Shared scope gate for universal UI integrity rules. */
export function isUniversalUiFile(fileRelative, cumulusExemptPrefixes = []) {
  if (
    isUniversalOuterUi(fileRelative) ||
    fileRelative.startsWith("src/screens/cumulus_adapters/")
  ) {
    return true;
  }
  return (
    fileRelative.startsWith("src/cumulus/") &&
    !cumulusExemptPrefixes.some((prefix) => fileRelative.startsWith(prefix))
  );
}
