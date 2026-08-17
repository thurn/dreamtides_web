import path from "node:path";

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
  "src/root-router.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/runtime/localization/context.tsx": OUTER_UI_ROLES.EMERGENCY_FALLBACK,
  // The entry sheet owns only the app-wide reset, cursor affordance, and
  // globally inherited legacy color bridge; product presentation belongs to
  // Cumulus closures.
  "src/index.css": OUTER_UI_ROLES.APP_SHELL,
  "src/editor/card-editor.css": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/editor/editable-figment.css": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/editor/exploration-editor.css": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/editor/glossary-editor.css": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/vendor/boxicons/boxicons.css": OUTER_UI_ROLES.VENDOR_ASSET,
  "src/vendor/boxicons/boxicons-filled.css": OUTER_UI_ROLES.VENDOR_ASSET,
  "src/vendor/boxicons/boxicons-logos.css": OUTER_UI_ROLES.VENDOR_ASSET,

  "src/components/BattleSiteRoute.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/components/CumulusJourneyChrome.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/components/DreamscapeJourneyMenu.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/components/ErrorBoundary.tsx": OUTER_UI_ROLES.EMERGENCY_FALLBACK,
  "src/components/LocalizedErrorBoundaryFallback.tsx":
    OUTER_UI_ROLES.EMERGENCY_FALLBACK,
  "src/components/FrontDoorRouter.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/components/JourneyCardTutorialController.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/components/ScreenRouter.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/battle/components/BattleCardNoteEditor.tsx":
    OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/BattleContextMenu.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/BattleDeckOrderPicker.tsx":
    OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/BattleDreamwellHistoryDrawer.tsx":
    OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/BattleFigmentCreator.tsx":
    OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/BattleLogDrawer.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/CumulusBattleForeseeOverlay.tsx":
    OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/CumulusBattleZoneBrowser.tsx":
    OUTER_UI_ROLES.STATE_ADAPTER,
  "src/battle/components/PlayableBattleScreen.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/battle/components/PoolViewerFloatingController.tsx":
    OUTER_UI_ROLES.APP_SHELL,

  "src/coop/BounceToast.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/coop/ConfigGateScreen.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/coop/EventLogViewer.tsx": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/coop/FrontDoorApp.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/coop/FuzzProbe.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/coop/HostedPlaytestShell.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/coop/hosted-playtest-shell.css": OUTER_UI_ROLES.APP_SHELL,
  "src/coop/RoomGate.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/coop/RecoveryApp.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/coop/RecoveryCheckpointCommitter.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/coop/UnreadableRoomScreen.tsx": OUTER_UI_ROLES.APP_SHELL,
  "src/coop/VersionGateScreen.tsx": OUTER_UI_ROLES.APP_SHELL,

  "src/debug/OffersDebugApp.tsx": OUTER_UI_ROLES.OPERATOR_TOOL,

  "src/image_viewer/ImageGrid.tsx": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/image_viewer/ImageViewerApp.tsx": OUTER_UI_ROLES.OPERATOR_TOOL,
  "src/image_viewer/ImageViewerToolbar.tsx": OUTER_UI_ROLES.OPERATOR_TOOL,

  "src/screens/CardSourceOverlay.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/screens/DebugScreen.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/screens/JourneyDebugEditor.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/state/coop-journey-context.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/state/front-door-context.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
  "src/state/journey-context.tsx": OUTER_UI_ROLES.STATE_ADAPTER,
};

for (const name of [
  "AtlasScreenAdapter",
  "BattleStartScreenAdapter",
  "CardShopSiteScreenAdapter",
  "DesktopDeckViewerAdapter",
  "DraftSiteScreenAdapter",
  "AugurySiteScreenAdapter",
  "PoolViewerAdapter",
  "DreamscapeScreenAdapter",
  "DreamsignBazaarSiteScreenAdapter",
  "DreamsignRevelationScreenAdapter",
  "DuplicationSiteScreenAdapter",
  "GambleSiteScreenAdapter",
  "LoadingScreenAdapter",
  "MobileBattleScreenAdapter",
  "MobileDeckViewerAdapter",
  "PurgeSiteScreenAdapter",
  "MainMenuScreenAdapter",
  "JourneyCompleteScreenAdapter",
  "JourneyFailedScreenAdapter",
  "JourneyStartScreenAdapter",
  "StartingDeckOverlayAdapter",
  "TransfigurationSiteScreenAdapter",
  "ExplorationSiteScreenAdapter",
  "TutorialBattleScreenAdapter",
  "TutorialScreenAdapter",
  "RandomSiteScreenAdapter",
  "registry",
]) {
  // The registry is the production resolver; the rest are state/effect wiring.
  fileRoles[`src/screens/cumulus_adapters/${name}.tsx`] =
    OUTER_UI_ROLES.STATE_ADAPTER;
}

for (const name of [
  "CardEditorApp",
  "CardEditorGrid",
  "CardEditorToolbar",
  "CardTagEditor",
  "AvatarDetailView",
  "AvatarEditorApp",
  "AvatarEditorGrid",
  "AvatarEditorToolbar",
  "DreamscapeEditorApp",
  "DreamscapeEditorToolbar",
  "DreamscapeResidents",
  "DreamsignEditorApp",
  "DreamsignEditorGrid",
  "DreamsignEditorToolbar",
  "DreamwellEditorApp",
  "DreamwellEditorPreview",
  "DreamwellEditorToolbar",
  "EditableCard",
  "EditableAvatar",
  "EditableDreamscape",
  "EditableDreamsign",
  "EditableDreamwell",
  "EditableField",
  "EditableFigment",
  "FigmentEditorApp",
  "FocusedCardEditor",
  "ManageTagsModal",
  "TagChip",
  "TagFilterControl",
  "ExplorationEditorApp",
  "GlossaryEditorApp",
  "TidePoolModal",
  "TideSourcePreview",
  "TidesDetailView",
  "TidesEditorApp",
  "TidesListView",
]) {
  fileRoles[`src/editor/${name}.tsx`] = OUTER_UI_ROLES.OPERATOR_TOOL;
}

for (const name of [
  "CardBrowserGrid",
  "CardBrowserToolbar",
  "MtgNameTooltip",
]) {
  fileRoles[`src/editor/card-browser/${name}.tsx`] =
    OUTER_UI_ROLES.OPERATOR_TOOL;
}

export const OUTER_UI_FILE_ROLES = Object.freeze(fileRoles);

export const OUTER_UI_ROLE_VALUES = Object.freeze(
  Object.values(OUTER_UI_ROLES),
);

/** Convert an ESLint filename to a repository-relative POSIX path. */
export function toRepoRelativePosix(absolutePath, cwd) {
  if (!path.isAbsolute(absolutePath))
    return absolutePath.split(path.sep).join("/");
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

/** Exact pure producers whose output is rendered in the player runtime. */
export const LOCALIZATION_NON_REACT_PRODUCER_FILES = Object.freeze([
  "src/cumulus/screens/mobile-deck-filter.ts",
  "src/cumulus/screens/desktop-deck-filter.ts",
  "src/screens/cumulus_adapters/main-menu-view-model.ts",
  "src/screens/cumulus_adapters/dreamscape-view-model.ts",
  "src/screens/cumulus_adapters/exploration-view-model.ts",
  "src/screens/cumulus_adapters/mobile-battle-view-model.ts",
  "src/components/JourneyUtilityMenuController.ts",
  "src/transfiguration/transfiguration-logic.ts",
  "src/rules/battle/effect-step.ts",
  "src/rules/battle/effect-runner-core.ts",
  "src/rules/battle/dreamwell-effects-table.ts",
  "src/rules/battle/battle-card-effects-table.ts",
]);

const LOCALIZATION_EXCLUDED_PREFIXES = Object.freeze([
  "src/cumulus/docs/",
  "src/cumulus/screens/devtools/",
  "src/debug/",
  "src/editor/",
  "src/image_viewer/",
]);

const LOCALIZATION_EXCLUDED_FILES = new Set([
  "src/cumulus/screens/JourneyDebugEditorScreen.tsx",
  "src/cumulus/screens/TutorialEditorRail.tsx",
  "src/battle/components/BattleContextMenu.tsx",
  "src/battle/components/BattleFigmentCreator.tsx",
  "src/cumulus/components/overlay/DeveloperRail.tsx",
  "src/cumulus/internal/reveal/test-utils.tsx",
  "src/cumulus/screens/PackageDebugDialog.tsx",
  "src/cumulus/screens/battle-overlays/BattleFigmentCreatorOverlay.tsx",
  "src/cumulus/screens/battle-overlays/BattleLogOverlay.tsx",
  "src/screens/cumulus_adapters/card-source-view-model.ts",
  "src/screens/cumulus_adapters/journey-debug-view-model.ts",
]);

export function outerUiRole(fileRelative) {
  return OUTER_UI_FILE_ROLES[fileRelative] ?? null;
}

/** True when player-facing static-copy lint owns this repository path. */
export function isPlayerLocalizationFile(fileRelative) {
  if (
    /(?:^|\/)(?:__tests__|__test-helpers__|testing|fixtures)(?:\/|$)/u.test(
      fileRelative,
    ) ||
    /\.(?:test|spec)\.tsx?$/u.test(fileRelative)
  ) {
    return false;
  }
  if (LOCALIZATION_EXCLUDED_FILES.has(fileRelative)) return false;
  if (
    LOCALIZATION_EXCLUDED_PREFIXES.some((prefix) =>
      fileRelative.startsWith(prefix),
    )
  ) {
    return false;
  }
  if (LOCALIZATION_NON_REACT_PRODUCER_FILES.includes(fileRelative)) return true;
  const role = outerUiRole(fileRelative);
  if (
    role === OUTER_UI_ROLES.OPERATOR_TOOL ||
    role === OUTER_UI_ROLES.DEVTOOL ||
    role === OUTER_UI_ROLES.VENDOR_ASSET
  ) {
    return false;
  }
  return (
    fileRelative.startsWith("src/cumulus/") ||
    fileRelative.startsWith("src/screens/cumulus_adapters/") ||
    role === OUTER_UI_ROLES.APP_SHELL ||
    role === OUTER_UI_ROLES.STATE_ADAPTER ||
    role === OUTER_UI_ROLES.EMERGENCY_FALLBACK ||
    role === OUTER_UI_ROLES.PENDING_PRESENTATION
  );
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
