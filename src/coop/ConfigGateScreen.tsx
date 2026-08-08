import { useCallback, type ReactNode } from "react";
import {
  ApplicationStateScreen,
  type ApplicationStateComparisonRow,
} from "../cumulus/screens/ApplicationStateScreen";
import type { ContentConfig } from "../eventlog/types";
import { applyContentConfigToSearch } from "../runtime/runtime-config";
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
 * Controller for the recoverable room-content configuration gate. URL rewriting
 * and reload remain here; Cumulus receives only its selected state and action.
 */
export function ConfigGateScreen({
  roomContentConfig,
  localContentConfig,
  onStartNewGame,
}: ConfigGateScreenProps): ReactNode {
  const canAdopt =
    roomContentConfig?.atlasFoldHash !== undefined &&
    roomContentConfig.atlasFoldHash === localContentConfig.atlasFoldHash &&
    roomContentConfig.sitesFoldHash !== undefined &&
    roomContentConfig.sitesFoldHash === localContentConfig.sitesFoldHash &&
    roomContentConfig.draftFoldHash !== undefined &&
    roomContentConfig.draftFoldHash === localContentConfig.draftFoldHash &&
    roomContentConfig.economyFoldHash !== undefined &&
    roomContentConfig.economyFoldHash === localContentConfig.economyFoldHash &&
    roomContentConfig.opponentsFoldHash !== undefined &&
    roomContentConfig.opponentsFoldHash ===
      localContentConfig.opponentsFoldHash &&
    roomContentConfig.tutorialFoldHash !== undefined &&
    roomContentConfig.tutorialFoldHash === localContentConfig.tutorialFoldHash;

  const handleUseRoomSettings = useCallback(() => {
    if (!canAdopt || roomContentConfig === undefined) return;
    const nextSearch = applyContentConfigToSearch(
      window.location.search,
      roomContentConfig,
    );
    window.location.search = nextSearch;
  }, [canAdopt, roomContentConfig]);

  return (
    <ApplicationStateScreen
      view={{
        kind: "contentConfigGate",
        title: createMessageDescriptor("coop-content-settings-title"),
        message: createMessageDescriptor("coop-content-settings-message"),
        comparison: configComparisonRows(roomContentConfig, localContentConfig),
        ...(canAdopt
          ? {
              actions: [
                {
                  id: "primary",
                  label: createMessageDescriptor("coop-use-game-settings-action"),
                  onPress: handleUseRoomSettings,
                },
              ],
            }
          : {
              detailMessage: createMessageDescriptor("coop-unadoptable-settings-detail"),
              actions: [
                {
                  id: "primary",
                  label: createMessageDescriptor("coop-create-new-game-action"),
                  onPress: onStartNewGame,
                },
              ],
            }),
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
  const defaultValue = (): ConfigDisplayValue =>
    createMessageDescriptor("coop-config-default");
  if (config === undefined) {
    return [
      ...[
        "pool",
        "draft",
        "pack-size",
        "atlas",
        "site",
        "draft-rules",
        "economy",
        "opponent",
        "tutorial",
      ].map((kind) => ({
        label: createMessageDescriptor(
          `coop-config-${kind}-label` as
            | "coop-config-pool-label"
            | "coop-config-draft-label"
            | "coop-config-pack-size-label"
            | "coop-config-atlas-rules-label"
            | "coop-config-site-rules-label"
            | "coop-config-draft-rules-label"
            | "coop-config-economy-rules-label"
            | "coop-config-opponent-rules-label"
            | "coop-config-tutorial-rules-label",
        ),
        value: unavailable(),
        comparisonKey: "unavailable",
      })),
    ];
  }
  return [
    { label: createMessageDescriptor("coop-config-pool-label"), value: config.poolVariant, comparisonKey: config.poolVariant },
    { label: createMessageDescriptor("coop-config-draft-label"), value: config.draftMode, comparisonKey: config.draftMode },
    {
      label: createMessageDescriptor("coop-config-pack-size-label"),
      value:
        config.fresh20PackSize === null
          ? defaultValue()
          : String(config.fresh20PackSize),
      comparisonKey: config.fresh20PackSize === null ? "default" : String(config.fresh20PackSize),
    },
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
