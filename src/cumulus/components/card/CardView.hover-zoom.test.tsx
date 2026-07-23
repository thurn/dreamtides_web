// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { CumulusRoot } from "../../CumulusRoot";
import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import { CardView } from "./CardView";

describe("CardView visual editor surface", () => {
  it("renders card chrome without mounting an independent reveal portal", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CumulusRoot><CardView card={{
      id: asCardId("11111111-1111-4111-8111-111111111111"),
      name: asCardName("Archive Sentry"), cardNumber: 1, cardType: "Character",
      subtype: "Synth", isStarter: false, energyCost: 1, spark: 1, isFast: false,
      renderedText: "Discard a bane.", imageNumber: 1, artOwned: true,
    }} /></CumulusRoot>));
    expect(container.querySelector(".card-view")?.textContent).toContain("Archive Sentry");
    expect(document.querySelector("[data-hover-zoom-overlay]")).toBeNull();
    expect(document.querySelector("[role='tooltip']")).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it("registers glossary Info Cards only when the explicit editor variant is enabled", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CumulusRoot><CardView glossaryInfoOnHover card={{
      id: asCardId("11111111-1111-4111-8111-111111111111"),
      name: asCardName("Archive Sentry"), cardNumber: 1, cardType: "Character",
      subtype: "Synth", isStarter: false, energyCost: 1, spark: 1, isFast: false,
      renderedText: "Discard a bane.", imageNumber: 1, artOwned: true,
    }} /></CumulusRoot>));

    const source = container.querySelector<HTMLElement>(
      "[data-card-view-glossary-hover-source]",
    );
    expect(source?.getAttribute("data-reveal-primary-variant")).toBe("gameCard");
    expect(source?.getAttribute("data-reveal-complete-game-card")).toBe("true");
    expect(source?.getAttribute("data-reveal-secondary-titles")).toBe("Bane");

    act(() => root.unmount());
    container.remove();
  });
});
