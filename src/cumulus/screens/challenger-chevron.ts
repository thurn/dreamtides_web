import { token } from "../primitives/tokens";

export interface ChallengerChevronSettings {
  readonly enabled: boolean;
  readonly widthPercent: number;
  readonly heightPercent: number;
  readonly horizontalPositionPercent: number;
  readonly verticalPositionPercent: number;
  readonly strokeWidth: number;
  readonly outlineWidth: number;
  readonly opacity: number;
  readonly color: string;
}

export const DEFAULT_CHALLENGER_CHEVRON_SETTINGS: ChallengerChevronSettings = {
  enabled: true,
  widthPercent: 20,
  heightPercent: 12,
  horizontalPositionPercent: 50,
  verticalPositionPercent: 4,
  strokeWidth: 18,
  outlineWidth: 8,
  opacity: 1,
  color: token("--battle-challenger-chevron"),
};
