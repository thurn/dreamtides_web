import { definePrimitive } from "../types";

/** A live permission to choose a discard for the controller's Offering payment. */
export interface OfferingDiscardPaymentOptionNode {
  readonly op: "offeringDiscardPaymentOption";
}

export const offeringDiscardPaymentOptionPrimitive = definePrimitive<OfferingDiscardPaymentOptionNode>({
  op: "offeringDiscardPaymentOption",
  staticOnly: true,
  resolve() { throw new Error("offeringDiscardPaymentOption belongs to a static ability"); },
  continuous: {
    layer: 6,
    changes(_node, env) { return [{ kind: "offeringDiscardPaymentOption", player: env.controller }]; },
  },
});

/** Offer discarding one held card alongside the ordinary Offering hand banishment. */
export function offeringDiscardPaymentOption(): OfferingDiscardPaymentOptionNode {
  return { op: "offeringDiscardPaymentOption" };
}
