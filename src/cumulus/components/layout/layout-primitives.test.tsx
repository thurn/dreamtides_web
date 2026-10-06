// @vitest-environment jsdom

import { act, type CSSProperties } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSiteId } from "../../../types/identifiers";
import {
  testDreamscapeArtKey,
  testGuideArtKey,
  testGuideId,
} from "../../../types/test-identities";
import { artRef } from "../../primitives/art";
import { GLYPHS } from "../../primitives/glyph";
import {
  Pressable,
  PRESS_SCALE,
  type PressableProps,
} from "../../primitives/Pressable";
import { useScaleToFit } from "../../primitives/use-scale-to-fit";
import { renderInCumulus } from "../../testing/render";
import { RadialAnnouncement } from "../status/RadialAnnouncement";
import { TransientStatusToast } from "../status/TransientStatusToast";
import {
  calculateGuideSpeechTarget,
  SiteLayout,
  type SiteLayoutComposition,
} from "./SiteLayout";

afterEach(() => {
  vi.restoreAllMocks();
});

// The named press-feedback vocabulary is asserted at compile time: arbitrary
// per-call motion remains inexpressible while the rules-copy exception is a
// strict variant.
function _pressFeedbackTypeGuards(): PressableProps[] {
  // @ts-expect-error there is no `compress` boolean escape hatch.
  const legacyBoolean: PressableProps = { compress: false };
  // @ts-expect-error arbitrary feedback modes are not part of the strict API.
  const optOut: PressableProps = { pressFeedback: "enlarge" };
  return [legacyBoolean, optOut];
}

function mouse(type: "pointerover" | "pointerout" | "pointerup"): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    pointerType: "mouse",
  });
}

describe("Pressable", () => {
  // jsdom exposes no real hover, so these exercise the touch case: the press
  // transform is the only feedback a touch user gets.
  function mountPressable(props: PressableProps): HTMLElement {
    const { container } = renderInCumulus(
      <Pressable as="button" {...props}>
        x
      </Pressable>,
    );
    return container.querySelector("button")!;
  }

  function pressDown(el: Element): void {
    act(() => {
      el.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
    });
  }

  function dispatch(el: Element, event: Event): void {
    act(() => {
      el.dispatchEvent(event);
    });
  }

  it("scales down on press unless disabled", () => {
    expect(_pressFeedbackTypeGuards).toBeTypeOf("function");
    const enabled = mountPressable({});
    pressDown(enabled);
    expect(enabled.style.transform).toBe(`scale(${String(PRESS_SCALE)})`);

    const disabled = mountPressable({ disabled: true });
    pressDown(disabled);
    expect(disabled.style.transform).toBe("none");
  });

  it("keeps stationary rules-copy surfaces still on press and hover", () => {
    const el = mountPressable({ pressFeedback: "stationary" });
    dispatch(el, mouse("pointerover"));
    expect(el.style.transform).toBe("none");
    pressDown(el);
    expect(el.style.transform).toBe("none");
  });

  it("keeps press feedback while suppressing hover scaling", () => {
    const el = mountPressable({ hoverFeedback: "stationary" });
    dispatch(el, mouse("pointerover"));
    expect(el.style.transform).toBe("none");
    pressDown(el);
    expect(el.style.transform).toContain("scale(");
  });

  it("consumes a reveal source's measured scale and sizes wide surfaces proportionally", () => {
    const measured = mountPressable({
      "data-reveal-feedback": "measured",
      style: { "--reveal-press-scale": "0.94" } as CSSProperties,
    } as PressableProps);
    pressDown(measured);
    expect(measured.style.transform).toContain("--reveal-press-scale");

    const wide = mountPressable({});
    wide.getBoundingClientRect = () =>
      DOMRect.fromRect({ width: 600, height: 80 });
    pressDown(wide);
    expect(wide.style.transform).toBe("scale(0.98)");
  });

  it("snaps a physical card out of hover and press feedback instantly", () => {
    const hovered = mountPressable({ snapFeedbackExit: true });
    dispatch(hovered, mouse("pointerover"));
    expect(hovered.style.transform).toContain("scale(");
    dispatch(hovered, mouse("pointerout"));
    expect(hovered.style.transform).toBe("none");
    expect(hovered.style.transition).toBe("none");

    const released = mountPressable({ snapFeedbackExit: true });
    dispatch(released, mouse("pointerover"));
    pressDown(released);
    expect(released.style.transform).toContain("scale(");
    dispatch(released, mouse("pointerup"));
    expect(released.style.transform).toBe("none");
    expect(released.style.transition).toBe("none");
  });
});

describe("useScaleToFit", () => {
  function setViewport(width: number, height: number): void {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(width);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(height);
  }

  function renderScale(stageWidth: number, stageHeight: number): () => number {
    let latest = Number.NaN;
    function Probe(): null {
      latest = useScaleToFit(stageWidth, stageHeight);
      return null;
    }
    renderInCumulus(<Probe />);
    return () => latest;
  }

  it("returns the limiting axis fit ratio", () => {
    setViewport(1920, 1080);
    expect(renderScale(1920, 1080)()).toBeCloseTo(1);
    expect(renderScale(3840, 2160)()).toBeCloseTo(0.5);
    expect(renderScale(3840, 1080)()).toBeCloseTo(0.5);
    expect(renderScale(1920, 2160)()).toBeCloseTo(0.5);
  });

  it("re-fits on a dispatched resize event", () => {
    setViewport(1920, 1080);
    const scale = renderScale(1920, 1080);
    expect(scale()).toBeCloseTo(1);
    act(() => {
      setViewport(960, 540);
      window.dispatchEvent(new Event("resize"));
    });
    expect(scale()).toBeCloseTo(0.5);
  });
});

describe("SiteLayout", () => {
  const compositions: readonly SiteLayoutComposition[] = [
    "balanced-gallery",
    "content-led-gallery",
    "balanced-revelation",
    "content-led-revelation",
    "balanced-expanded-revelation",
    "content-led-expanded-revelation",
    "balanced-dual-dialogue-revelation",
  ];
  const guide = {
    id: testGuideId("guide"),
    name: "Guide",
    line: "Line",
    art: artRef.dreamGuide(testGuideArtKey("guide")),
    headTargetX: 0.6,
  };

  function installMatchMedia(width: number): void {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches:
            Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0) <= width &&
            width <=
              Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
  }

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps the authored head focus through contained-image geometry", () => {
    const target = calculateGuideSpeechTarget({
      containerLeft: 64,
      containerTop: 83,
      imageLeft: 14,
      imageTop: 27,
      imageWidth: 364,
      imageHeight: 720,
      naturalWidth: 1024,
      naturalHeight: 1536,
      objectPositionY: "bottom",
      focusX: 0.608,
      focusY: 0.22,
    });
    expect(target?.x).toBeCloseTo(171.312);
    expect(target?.y).toBeCloseTo(238.12);
  });

  it("places one content region for every recipe at desktop and narrow widths", () => {
    for (const width of [390, 1440]) {
      installMatchMedia(width);
      for (const composition of compositions) {
        const { container, unmount } = renderInCumulus(
          <SiteLayout
            siteId={parseSiteId(composition)}
            scene={null}
            moteTint="warm"
            guide={{ ...guide, presence: "speaking" }}
            composition={composition}
          >
            <div />
          </SiteLayout>,
        );
        const content = container.querySelectorAll<HTMLElement>(
          "[data-site-layout-content-region]",
        );
        expect(content).toHaveLength(1);
        expect(
          container.querySelector("[data-site-layout-fallback-scene]"),
        ).not.toBeNull();
        expect(
          container.querySelector("[data-site-layout-speech-anchor]"),
        ).not.toBeNull();
        expect(
          container.querySelector<HTMLElement>("[data-site-layout]")?.dataset
            .siteLayoutViewport,
        ).toBe(width >= 900 ? "desktop" : "narrow");
        if (width >= 900) {
          expect(content[0]?.style.top).toBe("0px");
          expect(content[0]?.style.left).not.toBe("0px");
        } else {
          expect(content[0]?.style.left).toBe("0px");
          expect(content[0]?.style.top).not.toBe("");
        }
        unmount();
      }
    }
  });

  it("keeps portrait-only guides free of speech and resolves a scene independently", () => {
    installMatchMedia(390);
    const { container } = renderInCumulus(
      <SiteLayout
        siteId={parseSiteId("fixture")}
        scene={artRef.dreamscapeScene(testDreamscapeArtKey("fixture"))}
        moteTint="violet"
        guide={{ ...guide, presence: "portrait-only" }}
        composition="balanced-gallery"
      >
        <div />
      </SiteLayout>,
    );
    expect(container.querySelector("[data-site-layout-scene]")).not.toBeNull();
    expect(
      container.querySelector("[data-site-layout-speech-anchor]"),
    ).toBeNull();
  });

  it("points the measured speech anchor at the guide's head target", () => {
    installMatchMedia(1440);
    const rect = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(0, 0, 400, 800));
    const naturalWidth = vi
      .spyOn(HTMLImageElement.prototype, "naturalWidth", "get")
      .mockReturnValue(400);
    const naturalHeight = vi
      .spyOn(HTMLImageElement.prototype, "naturalHeight", "get")
      .mockReturnValue(800);
    const anchorLeft = (headTargetX: number): number => {
      const { container, unmount } = renderInCumulus(
        <SiteLayout
          siteId={parseSiteId("fixture")}
          scene={null}
          moteTint="warm"
          guide={{ ...guide, headTargetX, presence: "speaking" }}
          composition="balanced-gallery"
        >
          <div />
        </SiteLayout>,
      );
      const left = Number.parseFloat(
        container.querySelector<HTMLElement>(
          "[data-site-layout-speech-anchor]",
        )?.style.left ?? "",
      );
      unmount();
      return left;
    };
    try {
      expect(anchorLeft(0.75) - anchorLeft(0.25)).toBeCloseTo(200);
    } finally {
      rect.mockRestore();
      naturalWidth.mockRestore();
      naturalHeight.mockRestore();
    }
  });
});

describe("RadialAnnouncement", () => {
  function variant(name: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      `[data-radial-announcement-variant="${name}"]`,
    );
  }

  it("exposes each variant's semantic state through data attributes", () => {
    const { container, rerender } = renderInCumulus(
      <>
        <RadialAnnouncement
          headline="Headline"
          essenceGained={200}
          tone="reward"
          duration="extended"
          announcementId="fixture-reward"
        />
        <RadialAnnouncement
          variant="card-score"
          points={3}
          announcementId="fixture-score"
        />
        <RadialAnnouncement
          variant="victory"
          headline="Victory"
          announcementId="fixture-victory"
        />
        <RadialAnnouncement
          variant="hand-total"
          owner="dealer"
          total={17}
          size="mini"
        />
        <RadialAnnouncement
          variant="merge-target"
          status="available"
          addedSpark={2}
        />
      </>,
    );
    const reward = container.querySelector<HTMLElement>(
      '[data-radial-announcement="fixture-reward"]',
    );
    expect(reward?.dataset.radialAnnouncementTone).toBe("reward");
    expect(reward?.dataset.radialAnnouncementDuration).toBe("extended");

    const score = variant("card-score");
    expect(score?.dataset.radialAnnouncement).toBe("fixture-score");
    expect(score?.dataset.radialAnnouncementPoints).toBe("3");
    expect(score?.getAttribute("aria-label")).toContain("3");
    expect(
      score
        ?.querySelector("[data-radial-announcement-disc]")
        ?.hasAttribute("data-battle-card-points-bubble"),
    ).toBe(true);

    const victory = variant("victory");
    expect(victory?.dataset.radialAnnouncement).toBe("fixture-victory");
    expect(
      victory?.querySelector("[data-radial-announcement-headline]")?.tagName,
    ).toBe("H1");

    const total = variant("hand-total");
    expect(total?.dataset.radialAnnouncementOwner).toBe("dealer");
    expect(total?.dataset.radialAnnouncementTotal).toBe("17");
    expect(total?.getAttribute("aria-label")).toContain("17");

    expect(
      variant("merge-target")?.dataset.radialAnnouncementTargetStatus,
    ).toBe("available");
    rerender(<RadialAnnouncement variant="merge-target" status="blocked" />);
    expect(
      variant("merge-target")?.dataset.radialAnnouncementTargetStatus,
    ).toBe("blocked");
    expect(variant("merge-target")?.dataset.radialAnnouncementTone).toBe(
      "danger",
    );
  });

  it("replaces headline copy and resource symbols with labeled inline glyphs", () => {
    const { container } = renderInCumulus(
      <>
        <RadialAnnouncement headline="Fast" headlineGlyph={GLYPHS.bolt} />
        <RadialAnnouncement headline="−1 ●" detail="All gain +1 ✦" />
      </>,
    );
    const headline = container.querySelector<HTMLElement>(
      "[data-radial-announcement-headline-glyph]",
    );
    expect(headline?.textContent).not.toContain("Fast");
    expect(
      headline
        ?.querySelector("[data-inline-glyph]")
        ?.getAttribute("aria-label"),
    ).toBe("Fast");
    expect(container.textContent).not.toMatch(/[●✦]/u);
    expect(
      container.querySelectorAll("[data-inline-glyph][aria-label]").length,
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("TransientStatusToast", () => {
  it("dispatches dismissal when pressed", () => {
    const onDismiss = vi.fn();
    const { container } = renderInCumulus(
      <TransientStatusToast
        copy={{ title: "Title", message: "Message" }}
        onDismiss={onDismiss}
      />,
    );
    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-transient-status-toast]")
        ?.click();
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
