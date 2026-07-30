/**
 * Inspect the rendered journey route against the screen selected by the
 * displayed fold state. Keep this function self-contained: Playwright
 * serializes it into the browser rather than loading this module in the page.
 */
export function inspectJourneyPresentation(expectedScreenType) {
  const roots = Array.from(document.querySelectorAll("[data-journey-screen]"));
  const viewportWidth =
    document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight =
    document.documentElement.clientHeight || window.innerHeight;

  const rectFor = (element) => {
    const rect = element.getBoundingClientRect();
    const intersectionWidth = Math.max(
      0,
      Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0),
    );
    const intersectionHeight = Math.max(
      0,
      Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0),
    );
    return {
      bottom: rect.bottom,
      height: rect.height,
      intersectionArea: intersectionWidth * intersectionHeight,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    };
  };

  const visualStateFor = (element) => {
    let current = element;
    let opacity = 1;
    let displayed = true;
    let visible = true;
    while (current instanceof Element) {
      const style = window.getComputedStyle(current);
      const ownOpacity = Number.parseFloat(style.opacity);
      opacity *= Number.isFinite(ownOpacity) ? ownOpacity : 1;
      displayed &&= style.display !== "none";
      visible &&=
        style.visibility !== "hidden" && style.visibility !== "collapse";
      current = current.parentElement;
    }
    return { displayed, opacity, visible };
  };

  const isEnabled = (element) =>
    !(
      element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    ) || !element.disabled;

  const hitTest = (element) => {
    if (typeof document.elementFromPoint !== "function") return true;
    const rect = element.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(viewportWidth - 1, rect.left + rect.width / 2),
    );
    const y = Math.max(
      0,
      Math.min(viewportHeight - 1, rect.top + rect.height / 2),
    );
    const hit = document.elementFromPoint(x, y);
    return (
      hit !== null &&
      (hit === element || element.contains(hit))
    );
  };

  const interactiveSelector = [
    "a[href]",
    "button",
    "input",
    "select",
    "textarea",
    "[role='button']",
    "[role='link']",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  const interactiveCandidatesFor = (container) =>
    Array.from(container.querySelectorAll(interactiveSelector)).filter(
      (element) => {
        const candidateRect = rectFor(element);
        const candidateVisual = visualStateFor(element);
        return (
          isEnabled(element) &&
          element.getAttribute("aria-disabled") !== "true" &&
          window.getComputedStyle(element).pointerEvents !== "none" &&
          candidateRect.width > 0 &&
          candidateRect.height > 0 &&
          candidateRect.intersectionArea > 0 &&
          candidateVisual.displayed &&
          candidateVisual.visible
        );
      },
    );

  const hasHitTestableDialogControl = Array.from(
    document.querySelectorAll("[role='dialog'],[aria-modal='true']"),
  ).some((dialog) => {
    const rect = rectFor(dialog);
    const visual = visualStateFor(dialog);
    return (
      rect.intersectionArea > 0 &&
      visual.displayed &&
      visual.visible &&
      visual.opacity > 0.01 &&
      interactiveCandidatesFor(dialog).some(hitTest)
    );
  });

  const reports = roots.map((root) => {
    const rect = rectFor(root);
    const visual = visualStateFor(root);
    const renderedBoxes = [root, ...root.querySelectorAll("*")]
      .map((element) => ({
        rect: rectFor(element),
        visual: visualStateFor(element),
      }))
      .filter(
        ({ rect: candidateRect, visual: candidateVisual }) =>
          candidateRect.width > 0 &&
          candidateRect.height > 0 &&
          candidateVisual.displayed &&
          candidateVisual.visible,
      );
    const interactives = interactiveCandidatesFor(root);
    return {
      activeElementWithin:
        document.activeElement !== null &&
        root.contains(document.activeElement),
      hitTestableInteractiveCount: interactives.filter(hitTest).length,
      interactiveCount: interactives.length,
      hasLayout: renderedBoxes.length > 0,
      intersectsViewport: renderedBoxes.some(
        ({ rect: candidateRect }) => candidateRect.intersectionArea > 0,
      ),
      opacity: visual.opacity,
      pointerEvents: window.getComputedStyle(root).pointerEvents,
      rect,
      screenType: root.getAttribute("data-journey-screen"),
      visible: visual.displayed && visual.visible,
    };
  });

  const violations = [];
  const expected = reports.filter(
    (report) => report.screenType === expectedScreenType,
  );
  if (expected.length === 0) {
    violations.push({
      code: "expected_journey_screen_missing",
      message: `fold expects ${expectedScreenType}, but that journey screen is not mounted`,
    });
  } else {
    if (expected.every((report) => !report.visible || report.opacity <= 0.01)) {
      violations.push({
        code: "expected_journey_screen_not_painted",
        message: `the mounted ${expectedScreenType} screen is transparent or hidden`,
      });
    }
    if (expected.every((report) => !report.hasLayout)) {
      violations.push({
        code: "expected_journey_screen_has_no_layout",
        message: `the mounted ${expectedScreenType} screen has no rendered area`,
      });
    }
    if (expected.every((report) => !report.intersectsViewport)) {
      violations.push({
        code: "expected_journey_screen_outside_viewport",
        message: `the mounted ${expectedScreenType} screen does not intersect the viewport`,
      });
    }
    if (
      expected.some((report) => report.interactiveCount > 0) &&
      expected.every((report) => report.hitTestableInteractiveCount === 0) &&
      !hasHitTestableDialogControl
    ) {
      violations.push({
        code: "expected_journey_screen_not_hit_testable",
        message: `none of the visible controls on ${expectedScreenType} receives pointer hits`,
      });
    }
  }

  for (const report of reports) {
    if (report.screenType === expectedScreenType) continue;
    if (report.activeElementWithin) {
      violations.push({
        code: "focus_retained_in_inactive_journey_screen",
        message: `keyboard focus remains inside inactive ${String(report.screenType)} screen`,
      });
    }
    if (report.opacity <= 0.01 && report.hitTestableInteractiveCount > 0) {
      violations.push({
        code: "transparent_journey_screen_intercepts_input",
        message: `transparent inactive ${String(report.screenType)} screen still receives pointer hits`,
      });
    }
  }

  const visibleBrokenImages = [];
  for (const root of roots) {
    if (root.getAttribute("data-journey-screen") !== expectedScreenType)
      continue;
    for (const image of root.querySelectorAll("img")) {
      const rect = rectFor(image);
      const visual = visualStateFor(image);
      if (
        rect.intersectionArea > 0 &&
        visual.displayed &&
        visual.visible &&
        visual.opacity > 0.01 &&
        image.complete &&
        image.naturalWidth === 0
      ) {
        visibleBrokenImages.push(
          image.currentSrc || image.src || "(missing src)",
        );
      }
    }
  }
  if (visibleBrokenImages.length > 0) {
    violations.push({
      code: "visible_journey_image_failed",
      message: `${String(visibleBrokenImages.length)} visible journey image(s) failed to load`,
    });
  }

  return {
    expectedScreenType,
    screens: reports,
    violations,
  };
}
