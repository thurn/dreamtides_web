// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectJourneyPresentation } from "./journey-presentation-oracle.mjs";

const originalElementFromPoint = document.elementFromPoint;

const VIEWPORT_RECT = {
  bottom: 600,
  height: 600,
  left: 0,
  right: 800,
  top: 0,
  width: 800,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

function giveLayout(element, rect = VIEWPORT_RECT) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(rect);
}

afterEach(() => {
  document.body.innerHTML = "";
  if (originalElementFromPoint === undefined) {
    delete document.elementFromPoint;
  } else {
    document.elementFromPoint = originalElementFromPoint;
  }
  vi.restoreAllMocks();
});

describe("journey presentation oracle", () => {
  it("accepts a painted, laid-out, hit-testable current screen", () => {
    document.body.innerHTML =
      '<main data-journey-screen="dreamscape"><button>Site</button></main>';
    const root = document.querySelector("main");
    const button = document.querySelector("button");
    giveLayout(root);
    giveLayout(button, {
      ...VIEWPORT_RECT,
      bottom: 60,
      height: 40,
      left: 20,
      right: 120,
      top: 20,
      width: 100,
    });
    document.elementFromPoint = () => button;

    expect(inspectJourneyPresentation("dreamscape").violations).toEqual([]);
  });

  it("detects the prior stuck-exit shape", () => {
    document.body.innerHTML =
      '<main data-journey-screen="site" style="opacity: 0">' +
      "<button>Decline Offer</button></main>";
    const root = document.querySelector("main");
    const button = document.querySelector("button");
    giveLayout(root);
    giveLayout(button);
    document.elementFromPoint = () => button;

    expect(
      inspectJourneyPresentation("dreamscape").violations.map(
        (violation) => violation.code,
      ),
    ).toEqual([
      "expected_journey_screen_missing",
      "transparent_journey_screen_intercepts_input",
    ]);
  });

  it("distinguishes hidden, unlaid-out, and offscreen expected routes", () => {
    document.body.innerHTML =
      '<main data-journey-screen="dreamscape" style="opacity: 0"></main>';
    const root = document.querySelector("main");
    giveLayout(root, {
      ...VIEWPORT_RECT,
      bottom: 700,
      height: 100,
      top: 600,
      right: 0,
      width: 0,
    });

    expect(
      inspectJourneyPresentation("dreamscape").violations.map(
        (violation) => violation.code,
      ),
    ).toEqual([
      "expected_journey_screen_not_painted",
      "expected_journey_screen_has_no_layout",
      "expected_journey_screen_outside_viewport",
    ]);
  });

  it("reports focus left inside an inactive route", () => {
    document.body.innerHTML =
      '<main data-journey-screen="site"><button>Old action</button></main>' +
      '<main data-journey-screen="dreamscape"></main>';
    const roots = document.querySelectorAll("main");
    const button = document.querySelector("button");
    for (const root of roots) giveLayout(root);
    giveLayout(button);
    button.focus();
    document.elementFromPoint = () => button;

    expect(
      inspectJourneyPresentation("dreamscape").violations.map(
        (violation) => violation.code,
      ),
    ).toContain("focus_retained_in_inactive_journey_screen");
  });

  it("does not let an inert dialog mask an obscured journey route", () => {
    document.body.innerHTML =
      '<main data-journey-screen="dreamscape"><button>Site</button></main>' +
      '<section role="dialog">Reconnecting</section>';
    const root = document.querySelector("main");
    const site = document.querySelector("button");
    const dialog = document.querySelector("[role='dialog']");
    giveLayout(root);
    giveLayout(site);
    giveLayout(dialog);
    document.elementFromPoint = () => dialog;

    expect(
      inspectJourneyPresentation("dreamscape").violations.map(
        (violation) => violation.code,
      ),
    ).toContain("expected_journey_screen_not_hit_testable");
  });

  it("accepts a visible dialog with a hit-testable recovery control", () => {
    document.body.innerHTML =
      '<main data-journey-screen="dreamscape"><button>Site</button></main>' +
      '<section role="dialog"><button>Close</button></section>';
    const root = document.querySelector("main");
    const site = document.querySelector("main button");
    const dialog = document.querySelector("[role='dialog']");
    const close = document.querySelector("[role='dialog'] button");
    giveLayout(root);
    giveLayout(site);
    giveLayout(dialog);
    giveLayout(close);
    document.elementFromPoint = () => close;

    expect(inspectJourneyPresentation("dreamscape").violations).toEqual([]);
  });

  it("reports a failed image that occupies the active viewport", () => {
    document.body.innerHTML =
      '<main data-journey-screen="dreamscape"><img src="/broken.png"></main>';
    const root = document.querySelector("main");
    const image = document.querySelector("img");
    giveLayout(root);
    giveLayout(image);
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 0 },
    });

    expect(
      inspectJourneyPresentation("dreamscape").violations.map(
        (violation) => violation.code,
      ),
    ).toContain("visible_journey_image_failed");
  });
});
