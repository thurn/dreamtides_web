import type { ReactNode } from "react";
import {
  ApplicationStateScreen,
  type ApplicationStateComparisonRow,
} from "../cumulus/screens/ApplicationStateScreen";
import type { ContentConfig } from "../eventlog/types";
import { createMessageDescriptor } from "../data/localization-descriptors";
import type { FluentMessageDescriptor } from "../data/localization-messages";

interface ConfigGateScreenProps {
  /** The content config pinned in the room's genesis, or undefined if the genesis predates config pinning. */
  roomContentConfig: ContentConfig | undefined;
  /** This client's local content config, shown alongside the room's for context. */
  localContentConfig: ContentConfig;
  onStartNewGame: () => void;
}

/**
 * Controller for the recoverable room-content configuration gate.
 */
export function ConfigGateScreen({
  roomContentConfig,
  localContentConfig,
  onStartNewGame,
}: ConfigGateScreenProps): ReactNode {
  return (
    <ApplicationStateScreen
      view={{
        kind: "contentConfigGate",
        title: createMessageDescriptor("coop-content-settings-title"),
        message: createMessageDescriptor("coop-content-settings-message"),
        comparison: configComparisonRows(roomContentConfig, localContentConfig),
        detailMessage: createMessageDescriptor("coop-unadoptable-settings-detail"),
        actions: [
          {
            id: "primary",
            label: createMessageDescriptor("coop-create-new-game-action"),
            onPress: onStartNewGame,
          },
        ],
      }}
    />
  );
}

/** Pure structured values for the Cumulus comparison table. */
export function configComparisonRows(
  roomContentConfig: ContentConfig | undefined,
  localContentConfig: ContentConfig,
): readonly ApplicationStateComparisonRow[] {
  const room = describeConfig(roomContentConfig);
  const local = describeConfig(localContentConfig);
  return room.map((entry, index) => ({
    label: entry.label,
    expected: entry.value,
    actual: local[index].value,
    differs: entry.comparisonKey !== local[index].comparisonKey,
  }));
}

type ConfigDisplayValue = string | FluentMessageDescriptor;

function describeConfig(
  config: ContentConfig | undefined,
): readonly {
  readonly label: FluentMessageDescriptor;
  readonly value: ConfigDisplayValue;
  readonly comparisonKey: string;
}[] {
  const unavailable = (): ConfigDisplayValue =>
    createMessageDescriptor("coop-config-unavailable");
  if (config === undefined) {
    const unavailableRows = [
      { kind: "atlas", label: createMessageDescriptor("coop-config-atlas-rules-label") },
      { kind: "site", label: createMessageDescriptor("coop-config-site-rules-label") },
      { kind: "draft-rules", label: createMessageDescriptor("coop-config-draft-rules-label") },
      { kind: "economy", label: createMessageDescriptor("coop-config-economy-rules-label") },
      { kind: "opponent", label: createMessageDescriptor("coop-config-opponent-rules-label") },
      { kind: "tutorial", label: createMessageDescriptor("coop-config-tutorial-rules-label") },
    ] as const;
    return [
      ...unavailableRows.map(({ kind, label }) => ({
        label,
        value: unavailable(),
        comparisonKey: kind,
      })),
    ];
  }
  return [
    {
      label: createMessageDescriptor("coop-config-atlas-rules-label"),
      value: config.atlasFoldHash?.slice(0, 12) ?? unavailable(),
      comparisonKey: config.atlasFoldHash?.slice(0, 12) ?? "unavailable",
    },
    {
      label: createMessageDescriptor("coop-config-site-rules-label"),
      value: config.sitesFoldHash?.slice(0, 12) ?? unavailable(),
      comparisonKey: config.sitesFoldHash?.slice(0, 12) ?? "unavailable",
    },
    {
      label: createMessageDescriptor("coop-config-draft-rules-label"),
      value: config.draftFoldHash?.slice(0, 12) ?? unavailable(),
      comparisonKey: config.draftFoldHash?.slice(0, 12) ?? "unavailable",
    },
    {
      label: createMessageDescriptor("coop-config-economy-rules-label"),
      value: config.economyFoldHash?.slice(0, 12) ?? unavailable(),
      comparisonKey: config.economyFoldHash?.slice(0, 12) ?? "unavailable",
    },
    {
      label: createMessageDescriptor("coop-config-gamble-rules-label"),
      value: config.gambleFoldHash?.slice(0, 12) ?? unavailable(),
      comparisonKey: config.gambleFoldHash?.slice(0, 12) ?? "unavailable",
    },
    {
      label: createMessageDescriptor("coop-config-transfiguration-rules-label"),
      value: config.transfigurationFoldHash?.slice(0, 12) ?? unavailable(),
      comparisonKey:
        config.transfigurationFoldHash?.slice(0, 12) ?? "unavailable",
    },
    {
      label: createMessageDescriptor("coop-config-opponent-rules-label"),
      value: config.opponentsFoldHash?.slice(0, 12) ?? unavailable(),
      comparisonKey: config.opponentsFoldHash?.slice(0, 12) ?? "unavailable",
    },
    {
      label: createMessageDescriptor("coop-config-tutorial-rules-label"),
      value: config.tutorialFoldHash?.slice(0, 12) ?? unavailable(),
      comparisonKey: config.tutorialFoldHash?.slice(0, 12) ?? "unavailable",
    },
  ];
}
