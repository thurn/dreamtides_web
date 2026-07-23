// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DreamcallerPortrait,
  type DreamcallerVisual,
} from "./DreamcallerPortrait";
import { CumulusRoot } from "../../CumulusRoot";

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

describe("DreamcallerPortrait variants", () => {
  it.each(["hero", "panel", "thumb"] as const)(
    "%s composites the transparent cutout over an opaque base",
    (variant) => {
      const { container } = mountInto(
        <DreamcallerPortrait dreamcaller={DC} variant={variant} />,
      );

      const frame = container.firstElementChild as HTMLElement | null;
      expect(frame?.style.backgroundColor).toBe("var(--bg-sunken)");
      expect(frame?.style.backgroundImage).toContain("radial-gradient");
    },
  );

  it("registers a strict profile reveal only when semantic profile data is supplied", () => {
    const { container } = mountInto(
      <CumulusRoot>
        <DreamcallerPortrait dreamcaller={DC} variant="panel" profile={{ id: "00000000-0000-4000-8000-000000000061", ability: "Gain 1 essence." }} />
      </CumulusRoot>,
    );
    const source = container.querySelector<HTMLElement>("[data-dreamcaller-source]")!;
    expect(source.dataset.revealFeedback).toBe("measured");
    expect(source.dataset.revealEntityType).toBe("dreamcaller");
    expect(source.dataset.revealEntityId).toBe("00000000-0000-4000-8000-000000000061");
    expect(source.dataset.revealPrimaryVariant).toBe("fullBleed");
    expect(source.tabIndex).toBe(0);
    const description = document.getElementById(source.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("Astra");
    expect(description?.textContent).toContain("Gain 1 essence.");
  });
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

  it("thumb centers the authored head coordinate in a close bust crop", () => {
    const { container } = mountInto(
      <DreamcallerPortrait
        dreamcaller={{ ...DC, portraitFocus: { x: 0.58, y: 0.23 } }}
        variant="thumb"
      />,
    );

    const img = container.querySelector("img");
    expect(Number.parseFloat(img?.style.left ?? "")).toBeCloseTo(-23.2, 8);
    expect(img?.style.objectPosition).not.toBe("50% 22%");
    expect(img?.style.transform).toBe("scale(2.9)");
    expect(img?.style.transformOrigin).toBe("50% 0%");
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
