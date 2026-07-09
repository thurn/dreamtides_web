// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DreamcallerPortrait,
  type DreamcallerVisual,
} from "./DreamcallerPortrait";

/**
 * The full-bleed `standing` (desktop column) and `fullBleed` (mobile carousel)
 * variants render the transparent character cutout absolutely-positioned over a
 * glow/backdrop, with a first-letter monogram fallback when the art 404s.
 */

const DC: DreamcallerVisual = {
  imageNumber: "0042",
  name: "Astra",
  title: "The Dawnbound",
};

function mountInto(node: React.ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DreamcallerPortrait standing/fullBleed variants", () => {
  it("standing renders the cutout <img> with alt and image-number src", () => {
    const { container } = mountInto(
      <DreamcallerPortrait dreamcaller={DC} variant="standing" />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("Astra, The Dawnbound");
    expect(img?.getAttribute("src") ?? "").toContain("0042");
  });

  it("fullBleed renders the cutout <img>", () => {
    const { container } = mountInto(
      <DreamcallerPortrait dreamcaller={DC} variant="fullBleed" />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("Astra, The Dawnbound");
  });

  it("fullBleed centers the authored head coordinate instead of the canvas", () => {
    const { container } = mountInto(
      <DreamcallerPortrait
        dreamcaller={{ ...DC, portraitFocus: { x: 0.58, y: 0.23 } }}
        variant="fullBleed"
      />,
    );

    const img = container.querySelector("img");
    expect(img?.style.left).toBe("50%");
    expect(img?.style.transform).toBe("translate(-58%, -23%)");
    expect(img?.style.height).toBe("100%");
  });

  it("standing falls back to the name's first letter when the art 404s", () => {
    const { container } = mountInto(
      <DreamcallerPortrait dreamcaller={DC} variant="standing" />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    act(() => {
      img?.dispatchEvent(new Event("error"));
    });

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("A");
  });

  it("fullBleed falls back to the name's first letter when the art 404s", () => {
    const { container } = mountInto(
      <DreamcallerPortrait dreamcaller={DC} variant="fullBleed" />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    act(() => {
      img?.dispatchEvent(new Event("error"));
    });

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("A");
  });
});
