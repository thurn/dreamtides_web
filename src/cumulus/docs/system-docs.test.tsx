// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import { ComponentPage } from "./ComponentPage";
import { CUMULUS_COMPONENTS } from "./registry";
import { SystemPage } from "./SystemPage";
import { getUISystem } from "./systems/registry";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function mount(node: ReactNode): {
  readonly root: Root;
  readonly container: HTMLDivElement;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{node}</CumulusRoot>));
  return { root, container };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Cumulus UI-system documentation", () => {
  it("registers UI-system contracts separately from components", () => {
    const system = getUISystem("entity-reveals");
    expect(system).toBeDefined();
    expect(system?.Preview).toBeTypeOf("function");
    expect(system?.Docs).toBeTypeOf("function");

    const hostSystem = getUISystem("journey-screen-host-chrome");
    expect(hostSystem).toBeDefined();
    expect(hostSystem?.Preview).toBeTypeOf("function");
    expect(hostSystem?.Docs).toBeTypeOf("function");
  });

  it("resolves every component backlink through the UI-system registry", () => {
    for (const component of CUMULUS_COMPONENTS) {
      for (const systemId of component.relatedSystems ?? []) {
        expect(getUISystem(systemId)).toBeDefined();
      }
    }
  });

  it("renders the coordinator page with a real semantic-source specimen", () => {
    const { root, container } = mount(<SystemPage id="entity-reveals" />);

    expect(
      container.querySelector('[data-cumulus-system-page="entity-reveals"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        "[data-entity-reveal-system-demo] [data-tide-disc]",
      ),
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-system-related-component="info-card"]')
        ?.getAttribute("href"),
    ).toBe("#/info-card");

    act(() => root.unmount());
  });

  it("renders the journey host contract with its route dispositions", () => {
    const { root, container } = mount(
      <SystemPage id="journey-screen-host-chrome" />,
    );

    expect(
      container.querySelector(
        '[data-cumulus-system-page="journey-screen-host-chrome"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-journey-screen-host-route-policies]"),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-route-policy="journey-start"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-route-policy="playable-battle"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-route-policy="inline-site"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-system-related-component="journey-status-bar"]',
      )?.getAttribute("href"),
    ).toBe("#/journey-status-bar");

    act(() => root.unmount());
  });

  it("links InfoCard back to its governing UI system and qualifies its union props", () => {
    const { root, container } = mount(<ComponentPage id="info-card" />);

    expect(
      container
        .querySelector('[data-related-system="entity-reveals"]')
        ?.getAttribute("href"),
    ).toBe("#/systems/entity-reveals");
    expect(container.querySelector("[data-cumulus-props-note]")).not.toBeNull();

    act(() => root.unmount());
  });
});

describe("Cumulus component documentation", () => {
  it("keeps the info callout short and renders supporting prose below it", () => {
    const entry = CUMULUS_COMPONENTS.find(
      (component) => component.id === "game-card",
    );
    expect(entry?.details?.length).toBeGreaterThan(1);

    const { root, container } = mount(<ComponentPage id="game-card" />);
    const callout = container.querySelector("[data-cumulus-doc-callout]");
    const details = container.querySelector("[data-cumulus-doc-details]");

    expect(callout).not.toBeNull();
    expect(details?.querySelectorAll("p")).toHaveLength(
      entry?.details?.length ?? 0,
    );
    expect(
      callout !== null &&
        details !== null &&
        (callout.compareDocumentPosition(details) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0,
    ).toBe(true);

    act(() => root.unmount());
  });
});
