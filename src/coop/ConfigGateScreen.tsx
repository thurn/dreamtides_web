import type { ReactNode } from "react";
import {
  ApplicationStateScreen,
  type ApplicationStateComparisonRow,
  type ApplicationStateComparisonId,
  type ApplicationStateComparisonValue,
} from "../cumulus/screens/ApplicationStateScreen";
import type { ContentConfig } from "../eventlog/types";

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
        title: "This Game Uses Different Settings",
        message: "Both players use the same content settings to play together.",
        comparison: configComparisonRows(roomContentConfig, localContentConfig),
        detail: "This game needs settings this build cannot adopt.",
        actions: [
          {
            id: "primary",
            label: "Create New Game",
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
    id: entry.kind,
    label: entry.label,
    expected: entry.value,
    actual: local[index].value,
    differs: entry.comparisonKey !== local[index].comparisonKey,
  }));
}

type ConfigKind = ApplicationStateComparisonId;
type ConfigComparisonKey =
  | `unavailable:${ConfigKind}`
  | `hash:${string}`;

function configComparisonKey(
  kind: ConfigKind,
  value: string | undefined,
): ConfigComparisonKey {
  return value === undefined ? `unavailable:${kind}` : `hash:${value}`;
}

function configLabel(kind: ConfigKind): string {
  switch (kind) {
    case "atlas":
      return "Atlas Rules";
    case "site":
      return "Site Rules";
    case "draft-rules":
      return "Draft Rules";
    case "economy":
      return "Economy Rules";
    case "gamble":
      return "Gamble Rules";
    case "transfiguration":
      return "Transfiguration Rules";
    case "opponent":
      return "Opponent Rules";
    case "tutorial":
      return "Tutorial Rules";
  }
}

function rawConfigValue(
  value: string | undefined,
): ApplicationStateComparisonValue {
  return value === undefined
    ? {
        kind: "message",
        message: "Unavailable",
      }
    : { kind: "raw", value };
}

function describeConfig(config: ContentConfig | undefined): readonly {
  readonly kind: ConfigKind;
  readonly label: string;
  readonly value: ApplicationStateComparisonValue;
  readonly comparisonKey: ConfigComparisonKey;
}[] {
  if (config === undefined) {
    const unavailableRows = [
      { kind: "atlas", label: configLabel("atlas") },
      { kind: "site", label: configLabel("site") },
      { kind: "draft-rules", label: configLabel("draft-rules") },
      { kind: "economy", label: configLabel("economy") },
      { kind: "opponent", label: configLabel("opponent") },
      { kind: "tutorial", label: configLabel("tutorial") },
    ] as const;
    return [
      ...unavailableRows.map(({ kind, label }) => ({
        kind,
        label,
        value: rawConfigValue(undefined),
        comparisonKey: configComparisonKey(kind, undefined),
      })),
    ];
  }
  return [
    {
      kind: "atlas",
      label: configLabel("atlas"),
      value: rawConfigValue(config.atlasFoldHash?.slice(0, 12)),
      comparisonKey: configComparisonKey(
        "atlas",
        config.atlasFoldHash?.slice(0, 12),
      ),
    },
    {
      kind: "site",
      label: configLabel("site"),
      value: rawConfigValue(config.sitesFoldHash?.slice(0, 12)),
      comparisonKey: configComparisonKey(
        "site",
        config.sitesFoldHash?.slice(0, 12),
      ),
    },
    {
      kind: "draft-rules",
      label: configLabel("draft-rules"),
      value: rawConfigValue(config.draftFoldHash?.slice(0, 12)),
      comparisonKey: configComparisonKey(
        "draft-rules",
        config.draftFoldHash?.slice(0, 12),
      ),
    },
    {
      kind: "economy",
      label: configLabel("economy"),
      value: rawConfigValue(config.economyFoldHash?.slice(0, 12)),
      comparisonKey: configComparisonKey(
        "economy",
        config.economyFoldHash?.slice(0, 12),
      ),
    },
    {
      kind: "gamble",
      label: configLabel("gamble"),
      value: rawConfigValue(config.gambleFoldHash?.slice(0, 12)),
      comparisonKey: configComparisonKey(
        "gamble",
        config.gambleFoldHash?.slice(0, 12),
      ),
    },
    {
      kind: "transfiguration",
      label: configLabel("transfiguration"),
      value: rawConfigValue(config.transfigurationFoldHash?.slice(0, 12)),
      comparisonKey: configComparisonKey(
        "transfiguration",
        config.transfigurationFoldHash?.slice(0, 12),
      ),
    },
    {
      kind: "opponent",
      label: configLabel("opponent"),
      value: rawConfigValue(config.opponentsFoldHash?.slice(0, 12)),
      comparisonKey: configComparisonKey(
        "opponent",
        config.opponentsFoldHash?.slice(0, 12),
      ),
    },
    {
      kind: "tutorial",
      label: configLabel("tutorial"),
      value: rawConfigValue(config.tutorialFoldHash?.slice(0, 12)),
      comparisonKey: configComparisonKey(
        "tutorial",
        config.tutorialFoldHash?.slice(0, 12),
      ),
    },
  ];
}
