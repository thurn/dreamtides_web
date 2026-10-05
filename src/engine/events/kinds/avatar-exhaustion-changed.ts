import type { Side } from "../../state/ids";
import { publicEvent } from "../types";

/** A side's avatar became exhausted by paying a ☾ cost, or ready again at Ending. */
export interface AvatarExhaustionChangedEvent {
  readonly kind: "avatarExhaustionChanged";
  readonly side: Side;
  readonly exhausted: boolean;
}

export const avatarExhaustionChanged = publicEvent<AvatarExhaustionChangedEvent>("avatarExhaustionChanged");
