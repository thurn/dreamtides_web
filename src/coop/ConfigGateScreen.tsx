import { useCallback, type ReactNode } from "react";
import {
  ApplicationStateScreen,
  type ApplicationStateComparisonRow,
} from "../cumulus/screens/ApplicationStateScreen";
import type { ContentConfig } from "../eventlog/types";
import { applyContentConfigToSearch } from "../runtime/runtime-config";

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
    roomContentConfig.economyFoldHash !== undefined &&
    roomContentConfig.economyFoldHash === localContentConfig.economyFoldHash &&
    roomContentConfig.opponentsFoldHash !== undefined &&
    roomContentConfig.opponentsFoldHash ===
      localContentConfig.opponentsFoldHash;

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
        title: "This Game Uses Different Settings",
        message: "Both players use the same content settings to play together.",
        comparison: configComparisonRows(roomContentConfig, localContentConfig),
        ...(canAdopt
          ? {
              actions: [
                {
                  id: "primary",
                  label: "Use This Game’s Settings",
                  onPress: handleUseRoomSettings,
                },
              ],
            }
          : {
              detail: "This game needs settings this build cannot adopt.",
              actions: [
                {
                  id: "primary",
                  label: "Start a New Game",
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
    differs: entry.value !== local[index].value,
  }));
}

function describeConfig(
  config: ContentConfig | undefined,
): readonly { readonly label: string; readonly value: string }[] {
  if (config === undefined) {
    return [
      { label: "Pool", value: "Unavailable" },
      { label: "Draft", value: "Unavailable" },
      { label: "Pack Size", value: "Unavailable" },
      { label: "Atlas Rules", value: "Unavailable" },
      { label: "Economy Rules", value: "Unavailable" },
      { label: "Opponent Rules", value: "Unavailable" },
    ];
  }
  return [
    { label: "Pool", value: config.poolVariant },
    { label: "Draft", value: config.draftMode },
    {
      label: "Pack Size",
      value:
        config.fresh20PackSize === null
          ? "Default"
          : String(config.fresh20PackSize),
    },
    {
      label: "Atlas Rules",
      value: config.atlasFoldHash?.slice(0, 12) ?? "Unavailable",
    },
    {
      label: "Economy Rules",
      value: config.economyFoldHash?.slice(0, 12) ?? "Unavailable",
    },
    {
      label: "Opponent Rules",
      value: config.opponentsFoldHash?.slice(0, 12) ?? "Unavailable",
    },
  ];
}
