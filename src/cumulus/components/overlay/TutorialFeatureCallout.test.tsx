// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import {
  TutorialFeatureCallout,
  type TutorialFeatureCalloutKind,
} from "./TutorialFeatureCallout";

let root: Root | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function renderCallout(feature: TutorialFeatureCalloutKind): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <CumulusRoot>
        <TutorialFeatureCallout feature={feature} />
      </CumulusRoot>,
    ),
  );
  const callout = container.querySelector<HTMLElement>(
    "[data-tutorial-feature-callout]",
  );
  if (callout === null) throw new Error("Callout did not render");
  return callout;
}

describe("TutorialFeatureCallout", () => {
  it.each([
    ["ability", "Ability"],
    ["cardType", "Card Type"],
  ] as const)(
    "renders the %s label without a resource glyph",
    (feature, label) => {
      const callout = renderCallout(feature);
      expect(callout.textContent).toBe(label);
      expect(callout.querySelector("[data-inline-glyph]")).toBeNull();
    },
  );

  it.each([
    ["cost", "Cost", "var(--energy)", "energy"],
    ["spark", "Spark", "var(--spark)", "spark"],
  ] as const)(
    "renders the %s label with its canonical resource mark",
    (feature, label, color, glyphLabel) => {
      const callout = renderCallout(feature);
      const glyph = callout.querySelector<HTMLElement>("[data-inline-glyph]");
      expect(callout.textContent).toBe(label);
      expect(glyph?.style.color).toBe(color);
      expect(glyph?.getAttribute("aria-label")).toBe(glyphLabel);
    },
  );
});
