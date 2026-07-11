// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import { CardView } from "./CardView";

describe("CardView visual editor surface", () => {
  it("renders card chrome without mounting an independent reveal portal", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CardView card={{
      id: asCardId("11111111-1111-4111-8111-111111111111"),
      name: asCardName("Archive Sentry"), cardNumber: 1, cardType: "Character",
      subtype: "Synth", isStarter: false, energyCost: 1, spark: 1, isFast: false,
      renderedText: "Discard a bane.", imageNumber: 1, artOwned: true,
    }} />));
    expect(container.querySelector(".card-view")?.textContent).toContain("Archive Sentry");
    expect(document.querySelector("[data-hover-zoom-overlay]")).toBeNull();
    expect(document.querySelector("[role='tooltip']")).toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
