import type { ReactNode } from "react";
import {
  ApplicationStateScreen,
  type ApplicationStateComparisonRow,
  type ApplicationStateComparisonValue,
} from "../cumulus/screens/ApplicationStateScreen";
import type { ContentConfig } from "../eventlog/types";
import { tx, type LocalizedString } from "@trox/runtime";

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
        title: tx(
          "This Game Uses Different Settings",
          "[coop] Title for a shared-room gate whose content settings differ from this client.",
        ),
        message: tx(
          "Both players use the same content settings to play together.",
          "[coop] Explanation that all participants in a shared room must use matching content settings.",
        ),
        comparison: configComparisonRows(roomContentConfig, localContentConfig),
        detail: tx(
          "This game needs settings this build cannot adopt.",
          "[coop] Detail explaining that this client cannot adopt the shared room's content settings.",
        ),
        actions: [
          {
            id: "primary",
            label: tx(
              "Create New Game",
              "[coop] Action that leaves an unavailable or incompatible room and creates a fresh shared game.",
            ),
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

type ConfigKind =
  | "atlas"
  | "site"
  | "draft-rules"
  | "economy"
  | "gamble"
  | "transfiguration"
  | "opponent"
  | "tutorial";

function configLabel(kind: ConfigKind): LocalizedString {
  switch (kind) {
    case "atlas":
      return tx(
        "Atlas Rules",
        "[coop] Comparison-row label for the shared room's Atlas rules fingerprint.",
      );
    case "site":
      return tx(
        "Site Rules",
        "[coop] Comparison-row label for the shared room's Site rules fingerprint.",
      );
    case "draft-rules":
      return tx(
        "Draft Rules",
        "[coop] Comparison-row label for the shared room's Draft rules fingerprint.",
      );
    case "economy":
      return tx(
        "Economy Rules",
        "[coop] Comparison-row label for the shared room's economy rules fingerprint.",
      );
    case "gamble":
      return tx(
        "Gamble Rules",
        "[gamble] [coop] Comparison-row label for the shared room's Gamble rules fingerprint.",
      );
    case "transfiguration":
      return tx(
        "Transfiguration Rules",
        "[transfiguration] [coop] Comparison-row label for the shared room's Transfiguration rules fingerprint.",
      );
    case "opponent":
      return tx(
        "Opponent Rules",
        "[coop] Comparison-row label for the shared room's opponent rules fingerprint.",
      );
    case "tutorial":
      return tx(
        "Tutorial Rules",
        "[tutorial] [coop] Comparison-row label for the shared room's tutorial rules fingerprint.",
      );
  }
}

function rawConfigValue(
  value: string | undefined,
): ApplicationStateComparisonValue {
  return value === undefined
    ? {
        kind: "message",
        message: tx(
          "Unavailable",
          "[coop] Comparison-table value for content settings unavailable in a shared room.",
        ),
      }
    : { kind: "raw", value };
}

function describeConfig(config: ContentConfig | undefined): readonly {
  readonly kind: ConfigKind;
  readonly label: LocalizedString;
  readonly value: ApplicationStateComparisonValue;
  readonly comparisonKey: string;
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
        comparisonKey: kind,
      })),
    ];
  }
  return [
    {
      kind: "atlas",
      label: configLabel("atlas"),
      value: rawConfigValue(config.atlasFoldHash?.slice(0, 12)),
      comparisonKey: config.atlasFoldHash?.slice(0, 12) ?? "unavailable",
    },
    {
      kind: "site",
      label: configLabel("site"),
      value: rawConfigValue(config.sitesFoldHash?.slice(0, 12)),
      comparisonKey: config.sitesFoldHash?.slice(0, 12) ?? "unavailable",
    },
    {
      kind: "draft-rules",
      label: configLabel("draft-rules"),
      value: rawConfigValue(config.draftFoldHash?.slice(0, 12)),
      comparisonKey: config.draftFoldHash?.slice(0, 12) ?? "unavailable",
    },
    {
      kind: "economy",
      label: configLabel("economy"),
      value: rawConfigValue(config.economyFoldHash?.slice(0, 12)),
      comparisonKey: config.economyFoldHash?.slice(0, 12) ?? "unavailable",
    },
    {
      kind: "gamble",
      label: configLabel("gamble"),
      value: rawConfigValue(config.gambleFoldHash?.slice(0, 12)),
      comparisonKey: config.gambleFoldHash?.slice(0, 12) ?? "unavailable",
    },
    {
      kind: "transfiguration",
      label: configLabel("transfiguration"),
      value: rawConfigValue(config.transfigurationFoldHash?.slice(0, 12)),
      comparisonKey:
        config.transfigurationFoldHash?.slice(0, 12) ?? "unavailable",
    },
    {
      kind: "opponent",
      label: configLabel("opponent"),
      value: rawConfigValue(config.opponentsFoldHash?.slice(0, 12)),
      comparisonKey: config.opponentsFoldHash?.slice(0, 12) ?? "unavailable",
    },
    {
      kind: "tutorial",
      label: configLabel("tutorial"),
      value: rawConfigValue(config.tutorialFoldHash?.slice(0, 12)),
      comparisonKey: config.tutorialFoldHash?.slice(0, 12) ?? "unavailable",
    },
  ];
}
