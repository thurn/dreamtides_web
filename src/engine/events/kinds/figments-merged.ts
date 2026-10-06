import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

/** `source` merged into `destination`, which permanently gained `spark` (rules § Merging Figments). */
export interface FigmentsMergedEvent {
  readonly kind: "figmentsMerged";
  readonly side: Side;
  readonly source: InstanceId;
  readonly destination: InstanceId;
  readonly spark: number;
}

export const figmentsMerged = publicEvent<FigmentsMergedEvent>("figmentsMerged");
