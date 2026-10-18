// The plain fade between a dream's map and one of its rooms (decision P19).
// Which map the player is on is folded state (./use-d97-dream.ts); this hook
// only paces its presentation. It keeps the map shown while the world fades
// out over the tuned seconds, shows the map entered once it has loaded, and
// fades back in once that map's scene has drawn. The first map shows at once,
// unfaded.

import { useCallback, useEffect, useState } from "react";
import type { CompiledDreamMap } from "../../../d97/map/compiled";
import type { D97DreamState, D97PlayedDream } from "./use-d97-dream";

export interface D97MapTransition {
  /** The played dream on screen: the last ready one until the fade covers the world. */
  readonly shown: D97PlayedDream | null;
  /** Whether the world is fading out, or covered until the next map's scene draws. */
  readonly covered: boolean;
  /** Reports that a map's scene has drawn. */
  readonly onSceneReady: (map: CompiledDreamMap) => void;
}

type Fade = "clear" | "fadingOut" | "covered";

export function useD97MapTransition(state: D97DreamState, seconds: number): D97MapTransition {
  const ready = state.kind === "ready" ? state.played : null;
  const [shown, setShown] = useState<D97PlayedDream | null>(ready);
  const [fade, setFade] = useState<Fade>("clear");
  const [drawn, setDrawn] = useState<CompiledDreamMap | null>(null);

  // The first map shows at once, and a fresh view of the shown map in place.
  if (ready !== null && (shown === null || (ready.map === shown.map && ready !== shown))) setShown(ready);
  // Covered, the next map shows as soon as it has loaded.
  if (fade === "covered" && ready !== null && shown !== null && ready.map !== shown.map) setShown(ready);

  const leaving = shown !== null && (state.kind === "loading" || (ready !== null && ready.map !== shown.map));
  useEffect(() => {
    if (leaving && fade === "clear") setFade("fadingOut");
  }, [fade, leaving]);
  useEffect(() => {
    if (fade !== "fadingOut") return undefined;
    const timer = window.setTimeout(() => setFade("covered"), seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [fade, seconds]);
  useEffect(() => {
    if (fade === "covered" && !leaving && shown !== null && drawn === shown.map) setFade("clear");
  }, [drawn, fade, leaving, shown]);

  const onSceneReady = useCallback((map: CompiledDreamMap) => setDrawn(map), []);
  return { shown, covered: fade !== "clear", onSceneReady };
}
