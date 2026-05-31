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
 */
export function useFitText(
  maxFontPx: number,
  minFontPx: number,
  deps: readonly unknown[],
): { ref: RefObject<HTMLDivElement | null>; fontSize: number } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [fontSize, setFontSize] = useState(maxFontPx);

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
      element.style.fontSize = `${String(best)}px`;
      lastClientW = element.clientWidth;
      lastClientH = element.clientHeight;
      setFontSize(best);
    };

    measure();

    // Re-fit once the real fonts are ready so glyph metrics that differ from
    // the fallback font cannot leave the text overflowing its box.
    let cancelled = false;
    if (typeof document !== "undefined" && "fonts" in document) {
      void document.fonts.ready.then(() => {
        if (!cancelled) {
          measure();
        }
      });
    }

    let observer: ResizeObserver | null = null;
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
      window.addEventListener("resize", measure);
    }

    return () => {
      cancelled = true;
      if (observer !== null) {
        observer.disconnect();
      } else {
        window.removeEventListener("resize", measure);
      }
    };
  }, [maxFontPx, minFontPx, ...deps]);

  return { ref, fontSize };
}
