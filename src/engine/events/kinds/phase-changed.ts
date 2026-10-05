import type { Phase, Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface PhaseChangedEvent {
  readonly kind: "phaseChanged";
  readonly phase: Phase;
  readonly active: Side;
}

export const phaseChanged = publicEvent<PhaseChangedEvent>("phaseChanged");
