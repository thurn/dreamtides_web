/**
 * Exact, temporary outer-UI lint debt. Counts are part of the contract: an
 * addition or a removal fails the baseline audit, so consumers must either
 * migrate the file or deliberately shrink this inventory in their task.
 */
const rows = [
  ["src/battle/components/AutomationGearIcon.tsx", "cumulus/no-classname-in-product-ui", 1], ["src/battle/components/AutomationGearIcon.tsx", "cumulus/no-hardcoded-values", 4],
  ["src/battle/components/BattleCardNoteEditor.tsx", "cumulus/no-raw-interactive-elements", 10], ["src/battle/components/BattleCardNoteEditor.tsx", "cumulus/no-classname-in-product-ui", 18], ["src/battle/components/BattleCardNoteEditor.tsx", "cumulus/no-hardcoded-values", 2],
  ["src/battle/components/BattleContextMenu.tsx", "cumulus/no-raw-interactive-elements", 3], ["src/battle/components/BattleContextMenu.tsx", "cumulus/no-classname-in-product-ui", 12],
  ["src/battle/components/BattleDreamwellHistoryDrawer.tsx", "cumulus/no-classname-in-product-ui", 6], ["src/battle/components/BattleDreamwellHistoryDrawer.tsx", "cumulus/no-raw-interactive-elements", 1],
  ["src/battle/components/BattleFigmentCreator.tsx", "cumulus/no-raw-interactive-elements", 11], ["src/battle/components/BattleFigmentCreator.tsx", "cumulus/no-classname-in-product-ui", 36], ["src/battle/components/BattleFigmentCreator.tsx", "cumulus/no-hardcoded-values", 2],
  ["src/battle/components/BattleGameCard.tsx", "cumulus/no-classname-in-product-ui", 8], ["src/battle/components/BattleGameCard.tsx", "cumulus/no-raw-interactive-elements", 1],
  ["src/battle/components/BattleLogDrawer.tsx", "cumulus/no-classname-in-product-ui", 27], ["src/battle/components/BattleLogDrawer.tsx", "cumulus/no-raw-interactive-elements", 5],
  ["src/components/CardOverlay.tsx", "cumulus/no-classname-in-product-ui", 2], ["src/components/CardOverlay.tsx", "cumulus/no-hardcoded-values", 1],
  ["src/components/DeckViewer.tsx", "cumulus/no-classname-in-product-ui", 72], ["src/components/DeckViewer.tsx", "cumulus/no-hardcoded-values", 86], ["src/components/DeckViewer.tsx", "cumulus/no-raw-interactive-elements", 8],
  ["src/components/DreamcallerPopover.tsx", "cumulus/no-hardcoded-values", 11], ["src/components/DreamcallerPopover.tsx", "cumulus/no-classname-in-product-ui", 9],
  ["src/components/DreamscapeQuestMenu.tsx", "cumulus/no-raw-icon-classes", 6], ["src/components/DreamscapeQuestMenu.tsx", "cumulus/no-untokenized-lengths", 2],
  ["src/components/DreamwellCardView.tsx", "cumulus/no-hardcoded-values", 22], ["src/components/DreamwellCardView.tsx", "cumulus/valid-token-references", 3], ["src/components/DreamwellCardView.tsx", "cumulus/no-inline-glass", 1], ["src/components/DreamwellCardView.tsx", "cumulus/no-classname-in-product-ui", 1],
  ["src/components/PoolViewer.tsx", "cumulus/no-hardcoded-values", 44], ["src/components/PoolViewer.tsx", "cumulus/no-untokenized-lengths", 20], ["src/components/PoolViewer.tsx", "cumulus/no-raw-interactive-elements", 4], ["src/components/PoolViewer.tsx", "cumulus/no-classname-in-product-ui", 8],
  ["src/components/QuestUtilityMenu.tsx", "cumulus/no-raw-icon-classes", 6], ["src/components/QuestUtilityMenu.tsx", "cumulus/no-raw-interactive-elements", 1], ["src/components/QuestUtilityMenu.tsx", "cumulus/no-classname-in-product-ui", 4], ["src/components/QuestUtilityMenu.tsx", "cumulus/no-untokenized-lengths", 16],
  ["src/coop/BounceToast.tsx", "cumulus/no-raw-interactive-elements", 1], ["src/coop/BounceToast.tsx", "cumulus/no-hardcoded-values", 4],
  ["src/coop/ConfigGateScreen.tsx", "cumulus/no-classname-in-product-ui", 10], ["src/coop/ConfigGateScreen.tsx", "cumulus/no-hardcoded-values", 14], ["src/coop/ConfigGateScreen.tsx", "cumulus/no-raw-interactive-elements", 1],
  ["src/coop/UnreadableRoomScreen.tsx", "cumulus/no-classname-in-product-ui", 6], ["src/coop/UnreadableRoomScreen.tsx", "cumulus/no-hardcoded-values", 11], ["src/coop/UnreadableRoomScreen.tsx", "cumulus/no-raw-interactive-elements", 1],
  ["src/coop/VersionGateScreen.tsx", "cumulus/no-classname-in-product-ui", 6], ["src/coop/VersionGateScreen.tsx", "cumulus/no-hardcoded-values", 11], ["src/coop/VersionGateScreen.tsx", "cumulus/no-raw-interactive-elements", 1],
  ["src/editor/EditableCard.tsx", "cumulus/valid-token-references", 1],
  ["src/editor/TidesDetailView.tsx", "cumulus/no-raw-icon-classes", 3], ["src/editor/TidesListView.tsx", "cumulus/no-raw-icon-classes", 1],
  ["src/screens/CardSourceOverlay.tsx", "cumulus/no-inline-glass", 1],
];

export const OUTER_UI_BASELINES = Object.freeze(rows.map(([file, rule, count]) => Object.freeze({
  file,
  rule,
  count,
  reason: "Existing outer UI debt; the named convergence task owns this migration.",
})));

export function baselineConfigEntries() {
  if (process.env.CUMULUS_REPORT_BASELINES === "1") return [];
  return OUTER_UI_BASELINES.map(({ file, rule }) => ({
    files: [file],
    rules: { [rule]: "off" },
  }));
}

/** CSS debt uses the same exact-count, shrink-only contract as TSX lint debt. */
export const OUTER_UI_CSS_BASELINES = Object.freeze([
  { file: "src/index.css", rule: "raw-color", count: 41 },
  { file: "src/index.css", rule: "raw-length", count: 33 },
  { file: "src/index.css", rule: "raw-radius", count: 2 },
  { file: "src/index.css", rule: "cumulus-card-selector", count: 4 },
  { file: "src/battle/battle.css", rule: "raw-length", count: 85 },
  { file: "src/battle/battle.css", rule: "raw-radius", count: 8 },
  { file: "src/battle/battle.css", rule: "inline-glass", count: 1 },
  { file: "src/battle/battle.css", rule: "unknown-token", count: 2 },
  { file: "src/atlas/atlas.css", rule: "raw-color", count: 23 },
  { file: "src/atlas/atlas.css", rule: "raw-length", count: 16 },
  { file: "src/atlas/atlas.css", rule: "raw-radius", count: 2 },
]);
