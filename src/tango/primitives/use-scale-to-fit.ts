// useScaleToFit — the ONE scale-to-fit hook. Given a fixed design stage
// (`stageWidth` × `stageHeight`), it returns the largest uniform scale at which
// that stage fits inside the viewport without overflowing either axis —
// `min(window.innerWidth / stageWidth, window.innerHeight / stageHeight)`. The
// caller applies the returned number as a uniform `scale(...)`, letterboxing the
// stage into its container.
//
// It re-evaluates on the window `resize` event: the effect adds a `resize`
// listener and removes it on cleanup (and re-subscribes whenever the stage
// dimensions change), so a resized viewport re-fits the stage.

import { useEffect, useState } from "react";

/**
 * The uniform scale that fits a `stageWidth` × `stageHeight` design canvas into
 * the current viewport (`min` of the per-axis fit ratios), re-fitted on resize.
 */
export function useScaleToFit(
  stageWidth: number,
  stageHeight: number,
): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      setScale(
        Math.min(
          window.innerWidth / stageWidth,
          window.innerHeight / stageHeight,
        ),
      );
    };
    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
    };
  }, [stageWidth, stageHeight]);

  return scale;
}
