import type { InstanceId } from "../../state/ids";
import { publicEvent } from "../types";

/** A required choice had no legal option at resolution, so that part of the effect did nothing. */
export interface NoLegalTargetEvent {
  readonly kind: "noLegalTarget";
  readonly source: InstanceId | null;
}

export const noLegalTarget = publicEvent<NoLegalTargetEvent>("noLegalTarget");
