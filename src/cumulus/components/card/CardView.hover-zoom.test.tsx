// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { CumulusRoot } from "../../CumulusRoot";
import { describe, expect, it } from "vitest";
import { parseCardName } from "../../../types/card-identity";
import { extractGlossaryTerms } from "../../../data/glossary-terms";
import { CardView } from "./CardView";
import { testCardId } from "../../../types/test-identities";

const RULES_TEXT = "Nightmare is a Bane.";

describe("CardView visual editor surface", () => {
  it("clips the masked blur compositor to the bottom feather region", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <CardView
            card={{
              id: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
              name: parseCardName("Twilight Troubadour"),
              cardNumber: 520,
              cardType: "Character",
              subtype: "Musician",
              isStarter: false,
              energyCost: 2,
              spark: 2,
              isFast: false,
              renderedText: "",
              imageNumber: 1792373848,
              artOwned: false,
              art: { x: 0.4, y: -0.3, scale: 2.17 },
            }}
          />
        </CumulusRoot>,
      ),
    );

    const feather = container.querySelector<HTMLElement>(
      "[data-card-art-blur-feather]",
    );
    const canvas = container.querySelector<HTMLElement>(
      "[data-card-art-blur-canvas]",
    );

    expect(parseFloat(feather?.style.top ?? "0")).toBeGreaterThan(0);
    expect(feather?.style.bottom).toBe("0px");
    expect(feather?.style.maskImage).toContain("rgba(0, 0, 0, 0) 0%");
    expect(parseFloat(canvas?.style.top ?? "0")).toBeLessThan(0);
    expect(parseFloat(canvas?.style.height ?? "0")).toBeGreaterThan(100);

    act(() => root.unmount());
    container.remove();
  });

  it("renders card chrome without mounting an independent reveal portal", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <CardView
            card={{
              id: testCardId("11111111-1111-4111-8111-111111111111"),
              name: parseCardName("Archive Sentry"),
              cardNumber: 1,
              cardType: "Character",
              subtype: "Synth",
              isStarter: false,
              energyCost: 1,
              spark: 1,
              isFast: false,
              renderedText: RULES_TEXT,
              imageNumber: 1,
              artOwned: true,
            }}
          />
        </CumulusRoot>,
      ),
    );
    expect(container.querySelector(".card-view")?.textContent).toContain(
      "Archive Sentry",
    );
    expect(document.querySelector("[data-hover-zoom-overlay]")).toBeNull();
    expect(document.querySelector("[role='tooltip']")).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it("registers glossary Info Cards only when the explicit editor variant is enabled", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <CardView
            glossaryInfoOnHover
            card={{
              id: testCardId("11111111-1111-4111-8111-111111111111"),
              name: parseCardName("Archive Sentry"),
              cardNumber: 1,
              cardType: "Character",
              subtype: "Synth",
              isStarter: false,
              energyCost: 1,
              spark: 1,
              isFast: false,
              renderedText: RULES_TEXT,
              imageNumber: 1,
              artOwned: true,
            }}
          />
        </CumulusRoot>,
      ),
    );

    const source = container.querySelector<HTMLElement>(
      "[data-card-view-glossary-hover-source]",
    );
    expect(source?.getAttribute("data-reveal-primary-variant")).toBe(
      "gameCard",
    );
    expect(source?.getAttribute("data-reveal-complete-game-card")).toBe("true");
    expect(source?.getAttribute("data-reveal-secondary-titles")).toBe("");
    const description = document.getElementById(
      source?.getAttribute("aria-describedby") ?? "",
    )?.textContent;
    for (const entry of extractGlossaryTerms(RULES_TEXT)) {
      expect(description).toContain(entry.term);
      expect(description).toContain(entry.definition);
    }

    act(() => root.unmount());
    container.remove();
  });
});
