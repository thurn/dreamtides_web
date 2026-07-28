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
  widthPercent: 60,
  heightPercent: 28,
  horizontalPositionPercent: 50,
  verticalPositionPercent: 3,
  strokeWidth: 12,
  outlineWidth: 4,
  opacity: 1,
  color: token("--battle-challenger-chevron"),
};
