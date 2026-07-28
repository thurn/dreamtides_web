import { token } from "../primitives/tokens";

export type ChallengerChevronStyle =
  | "classic"
  | "circle-badge"
  | "ember-crest"
  | "frame-infusion";

export interface ChallengerChevronSettings {
  readonly enabled: boolean;
  readonly style: ChallengerChevronStyle;
  readonly widthPercent: number;
  readonly heightPercent: number;
  readonly horizontalPositionPercent: number;
  readonly verticalPositionPercent: number;
  readonly strokeWidth: number;
  readonly outlineWidth: number;
  readonly opacity: number;
  readonly color: string;
}

export const CHALLENGER_CHEVRON_STYLE_OPTIONS: readonly {
  readonly value: ChallengerChevronStyle;
  readonly label: string;
}[] = [
  { value: "classic", label: "Classic" },
  { value: "circle-badge", label: "Circle Badge" },
  { value: "ember-crest", label: "Ember Crest" },
  { value: "frame-infusion", label: "Frame Infusion" },
];

export const CHALLENGER_CHEVRON_PRESETS: Readonly<
  Record<ChallengerChevronStyle, ChallengerChevronSettings>
> = {
  classic: {
    enabled: true,
    style: "classic",
    widthPercent: 20,
    heightPercent: 12,
    horizontalPositionPercent: 50,
    verticalPositionPercent: 4,
    strokeWidth: 18,
    outlineWidth: 8,
    opacity: 1,
    color: token("--battle-challenger-chevron"),
  },
  "circle-badge": {
    enabled: true,
    style: "circle-badge",
    widthPercent: 22,
    heightPercent: 16,
    horizontalPositionPercent: 50,
    verticalPositionPercent: -4,
    strokeWidth: 7,
    outlineWidth: 2,
    opacity: 1,
    color: token("--battle-challenger-chevron"),
  },
  "ember-crest": {
    enabled: true,
    style: "ember-crest",
    widthPercent: 28,
    heightPercent: 15,
    horizontalPositionPercent: 50,
    verticalPositionPercent: -2,
    strokeWidth: 12,
    outlineWidth: 4,
    opacity: 1,
    color: token("--battle-challenger-chevron"),
  },
  "frame-infusion": {
    enabled: true,
    style: "frame-infusion",
    widthPercent: 64,
    heightPercent: 12,
    horizontalPositionPercent: 50,
    verticalPositionPercent: -3,
    strokeWidth: 8,
    outlineWidth: 2,
    opacity: 0.9,
    color: token("--battle-challenger-chevron"),
  },
};

export const DEFAULT_CHALLENGER_CHEVRON_SETTINGS =
  CHALLENGER_CHEVRON_PRESETS.classic;
