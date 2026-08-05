import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Shrinks text to fit its box. Returns a ref to attach to the text element and
 * the computed font size in px. The element must be a fixed-size box (e.g. an
 * absolutely-positioned layer, or a flex child with a definite width) with
 * `overflow: hidden`; the hook finds the largest font size in
 * `[minFontPx, maxFontPx]` for which the content neither overflows the box nor
 * triggers a scrollbar. Text is sized down, never scrolled.
 *
 * The fit recomputes when `deps` change (pass the text content and any
 * baseline scale), when the box's available size changes, and once the web
 * fonts finish loading — the last guards against a transient overflow when the
 * initial layout pass runs against fallback font metrics.
 *
 * The resize observer watches the element itself but only re-fits when the
 * element's *available* box (client size) changes, so the hook's own
 * font-size mutations — which change scroll size, not client size, for a
 * fixed-size box — cannot feed back into an observer loop.
 *
 * Measuring forces a synchronous layout (each candidate font size is written,
 * then `scrollHeight`/`clientHeight` are read back). A surface like the card
 * editor mounts hundreds of cards at once — three fits each — so measuring
 * every card on mount or on every size toggle would force tens of thousands of
 * full-document reflows and lock the page up for seconds. To bound that work,
 * the fit only runs once the element is at (or near) the viewport: cards
 * already on screen measure immediately, while off-screen cards defer their
 * fit — and their resize / font re-fit wiring — until they scroll into range.
 * Where `IntersectionObserver` is unavailable (e.g. jsdom under test) the fit
 * runs eagerly, matching the always-measure behaviour those callers expect.
 */
export function useFitText(
  maxFontPx: number,
  minFontPx: number,
  deps: readonly unknown[],
  options?: {
    eager?: boolean;
    /**
     * Multiply the fitted measurement size before rendering it. Use with
     * `measurementMaxHeightPx` when a type-scale lift must preserve the
     * relative shrink ratios established by an earlier fit contract.
     */
    renderScale?: number;
    /**
     * Temporarily constrain the element to this height while fitting, then
     * restore its rendered max-height. This separates the stable measurement
     * contract from a larger display area needed by `renderScale`.
     */
    measurementMaxHeightPx?: number;
  },
): { ref: RefObject<HTMLDivElement | null>; fontSize: number } {
  const eager = options?.eager ?? false;
  const renderScale = options?.renderScale ?? 1;
  const measurementMaxHeightPx = options?.measurementMaxHeightPx;
  const ref = useRef<HTMLDivElement | null>(null);
  const [fontSize, setFontSize] = useState(maxFontPx * renderScale);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }

    let lastClientW = -1;
    let lastClientH = -1;

    const fits = (size: number): boolean => {
      element.style.fontSize = `${String(size)}px`;
      return (
        element.scrollHeight <= element.clientHeight + 1 &&
        element.scrollWidth <= element.clientWidth + 1
      );
    };

    const measure = (): void => {
      const renderedMaxHeight = element.style.maxHeight;
      if (measurementMaxHeightPx !== undefined) {
        element.style.maxHeight = `${String(measurementMaxHeightPx)}px`;
      }

      let best = minFontPx;
      if (fits(maxFontPx)) {
        best = maxFontPx;
      } else {
        let lo = minFontPx;
        let hi = maxFontPx;
        for (let i = 0; i < 14; i++) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) {
            best = mid;
            lo = mid;
          } else {
            hi = mid;
          }
        }
      }
      if (measurementMaxHeightPx !== undefined) {
        element.style.maxHeight = renderedMaxHeight;
      }
      const renderedBest = best * renderScale;
      element.style.fontSize = `${String(renderedBest)}px`;
      lastClientW = element.clientWidth;
      lastClientH = element.clientHeight;
      setFontSize(renderedBest);
    };

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let usesWindowResize = false;
    let started = false;

    // Run the (reflow-forcing) fit and wire up the re-fit triggers. Deferred
    // until the element is near the viewport so off-screen cards cost nothing.
    const start = (): void => {
      if (cancelled || started) {
        return;
      }
      started = true;

      measure();

      // Re-fit once the real fonts are ready so glyph metrics that differ from
      // the fallback font cannot leave the text overflowing its box.
      if (typeof document !== "undefined" && "fonts" in document) {
        void document.fonts.ready.then(() => {
          if (!cancelled) {
            measure();
          }
        });
      }

      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => {
          // Only re-fit when the box we must fit into actually changed size;
          // ignore scroll-size changes caused by our own font mutations.
          if (
            element.clientWidth !== lastClientW ||
            element.clientHeight !== lastClientH
          ) {
            measure();
          }
        });
        observer.observe(element);
      } else {
        usesWindowResize = true;
        window.addEventListener("resize", measure);
      }
    };

    // Gate the fit on viewport proximity. Cards already on screen measure now
    // (synchronously, so there is no flash from the unfitted size when text or
    // size deps change); off-screen cards wait until they scroll within range.
    // Without IntersectionObserver, measure eagerly. In `eager` mode the gate is
    // bypassed entirely so every element measures regardless of position — the
    // caller needs a complete, stable set of fitted sizes (e.g. to sort by
    // them), which the viewport gate cannot provide because it only measures
    // what is currently on screen.
    const VIEWPORT_MARGIN_PX = 300;
    let viewportObserver: IntersectionObserver | null = null;
    if (eager) {
      start();
    } else if (typeof IntersectionObserver !== "undefined") {
      const rect = element.getBoundingClientRect();
      const viewportH = window.innerHeight || 0;
      const viewportW = window.innerWidth || 0;
      const nearViewport =
        rect.bottom >= -VIEWPORT_MARGIN_PX &&
        rect.top <= viewportH + VIEWPORT_MARGIN_PX &&
        rect.right >= -VIEWPORT_MARGIN_PX &&
        rect.left <= viewportW + VIEWPORT_MARGIN_PX;
      if (nearViewport) {
        // Measure before paint, exactly like an eager fit.
        start();
      } else {
        // Defer until this card scrolls (or the layout shifts it) into range.
        viewportObserver = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              viewportObserver?.disconnect();
              viewportObserver = null;
              start();
            }
          },
          { rootMargin: `${String(VIEWPORT_MARGIN_PX)}px` },
        );
        viewportObserver.observe(element);
      }
    } else {
      start();
    }

    return () => {
      cancelled = true;
      viewportObserver?.disconnect();
      if (observer !== null) {
        observer.disconnect();
      } else if (usesWindowResize) {
        window.removeEventListener("resize", measure);
      }
    };
  }, [
    maxFontPx,
    minFontPx,
    eager,
    renderScale,
    measurementMaxHeightPx,
    ...deps,
  ]);

  return { ref, fontSize };
}
