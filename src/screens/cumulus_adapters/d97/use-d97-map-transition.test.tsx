// @vitest-environment jsdom
// The fade between a dream's map and a room's: the first map shows at once,
// unfaded; a change of map fades the world out and keeps the old map shown
// until the fade's seconds pass and the new map has loaded, then shows the
// new map and fades back in only once its scene has drawn.

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../../cumulus/testing/render";
import { compiledFromRows } from "../../../d97/map/map-fixtures";
import { SYNTHETIC_DREAM_A } from "../../../rules/d97/d97-dreams.fixtures";
import { parseDreamMapId } from "../../../types/identifiers";
import type { D97DreamState, D97PlayedDream } from "./use-d97-dream";
import { useD97MapTransition, type D97MapTransition } from "./use-d97-map-transition";

const DREAM_MAP = compiledFromRows(["..."]);
const ROOM_MAP = { ...compiledFromRows([".."]), id: parseDreamMapId("d97b0001-0000-4000-8000-000000000000") };
const played = (map: typeof DREAM_MAP, roomId: D97PlayedDream["roomId"]): D97PlayedDream => ({ dream: SYNTHETIC_DREAM_A, roomId, map, occupants: new Map() });
const OUTSIDE = played(DREAM_MAP, null);
const INSIDE = played(ROOM_MAP, SYNTHETIC_DREAM_A.rooms[0].id);
const ready = (dream: D97PlayedDream): D97DreamState => ({ kind: "ready", played: dream });

let latest: D97MapTransition | null = null;
function Probe({ state }: { readonly state: D97DreamState }) {
  latest = useD97MapTransition(state, 0.3);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  latest = null;
});
afterEach(() => vi.useRealTimers());

describe("useD97MapTransition", () => {
  it("shows the first map at once, unfaded", () => {
    renderInCumulus(<Probe state={ready(OUTSIDE)} />);
    expect(latest?.shown).toBe(OUTSIDE);
    expect(latest?.covered).toBe(false);
  });

  it("fades out, waits for the next map, shows it, and fades in once its scene draws", () => {
    const view = renderInCumulus(<Probe state={ready(OUTSIDE)} />);
    view.rerender(<Probe state={{ kind: "loading" }} />);
    expect(latest?.covered).toBe(true);
    expect(latest?.shown).toBe(OUTSIDE);
    act(() => void vi.advanceTimersByTime(300));
    // Covered, the old map stays until the next has loaded.
    expect(latest?.shown).toBe(OUTSIDE);
    view.rerender(<Probe state={ready(INSIDE)} />);
    expect(latest?.shown).toBe(INSIDE);
    expect(latest?.covered).toBe(true);
    act(() => latest?.onSceneReady(DREAM_MAP));
    expect(latest?.covered).toBe(true);
    act(() => latest?.onSceneReady(ROOM_MAP));
    expect(latest?.covered).toBe(false);
  });

  it("keeps the old map shown until the fade-out ends when the next map is ready at once", () => {
    const view = renderInCumulus(<Probe state={ready(OUTSIDE)} />);
    view.rerender(<Probe state={ready(INSIDE)} />);
    expect(latest?.covered).toBe(true);
    expect(latest?.shown).toBe(OUTSIDE);
    act(() => void vi.advanceTimersByTime(300));
    expect(latest?.shown).toBe(INSIDE);
  });
});
