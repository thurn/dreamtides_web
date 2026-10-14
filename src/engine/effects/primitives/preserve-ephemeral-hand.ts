import { definePrimitive } from "../types";

/** A static exemption from Ephemeral cleanup in the controller's hand at its own Ending. */
export interface PreserveEphemeralHandNode {
  readonly op: "preserveEphemeralHand";
}

export const preserveEphemeralHandPrimitive = definePrimitive<PreserveEphemeralHandNode>({
  op: "preserveEphemeralHand",
  staticOnly: true,
  resolve() { throw new Error("preserveEphemeralHand belongs to a static ability"); },
  continuous: {
    layer: 6,
    changes(_node, env) { return [{ kind: "preserveEphemeralHand", player: env.controller }]; },
  },
});

/** Keep held Ephemeral cards at your turn's Ending while the enclosing static ability applies. */
export function preserveEphemeralHand(): PreserveEphemeralHandNode {
  return { op: "preserveEphemeralHand" };
}
