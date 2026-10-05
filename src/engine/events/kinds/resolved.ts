import type { InstanceId } from "../../state/ids";
import { publicEvent } from "../types";

export interface ResolvedEvent {
  readonly kind: "resolved";
  readonly instance: InstanceId;
}

export const resolved = publicEvent<ResolvedEvent>("resolved");
