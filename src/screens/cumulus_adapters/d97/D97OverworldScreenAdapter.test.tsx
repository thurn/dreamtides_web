// @vitest-environment jsdom
// The overworld adapter when the run's dream cannot be played: a catalog
// dream whose compiled map fails to load, or a dream the content does not
// register, renders the dream-unavailable surface (never another dream) and
// logs `d97_dream_unavailable` with its reason; its Main Menu action opens the
// main menu through the game switch.

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../../cumulus/testing/render";
import type { JourneyContent } from "../../../data/journey-content";
import { eventRng } from "../../../eventlog/rng";
import type { Genesis } from "../../../eventlog/types";
import { logEvent } from "../../../logging";
import { registerD97ContentProvider } from "../../../rules/d97/d97-content";
import { syntheticD97Content } from "../../../rules/d97/d97-content.fixtures";
import { SYNTHETIC_DREAM_A, syntheticDream } from "../../../rules/d97/d97-dreams.fixtures";
import type { D97Run } from "../../../rules/d97/d97-state";
import { genesisFoldState } from "../../../rules/fold-state";
import { reduceGameEvent } from "../../../rules/reducer";
import { ctx, event, GENESIS } from "../../../rules/reducer-fixtures";
import { GameSwitchContext, type GameSwitchControls } from "../../../session/game-switch";
import { testAvatarId } from "../../../types/test-identities";
import { D97OverworldScreenAdapter } from "./D97OverworldScreenAdapter";

vi.mock("../../../logging", () => ({ logEvent: vi.fn(), logEventOnce: vi.fn() }));

const AVATAR = testAvatarId("d97-unavailable-avatar");
const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const CONTENT = { avatars: [], cardDatabase: new Map() } as unknown as JourneyContent;

function startedRun(): D97Run {
  const result = reduceGameEvent(
    genesisFoldState(D97_GENESIS),
    event("D97_START_RUN", { avatarId: AVATAR }),
    ctx({ seq: 1, rng: eventRng(D97_GENESIS.seed, 1) }),
  );
  const run = result.state.d97?.run;
  if (run === undefined || run === null) throw new Error("run did not start");
  return run;
}

function gameSwitch(): GameSwitchControls {
  return { startD97Run: vi.fn(), continueD97Run: vi.fn(), openMainMenu: vi.fn(), findRecentD97Run: vi.fn(() => Promise.resolve(null)) };
}

async function render(run: D97Run, controls: GameSwitchControls) {
  const view = renderInCumulus(
    <GameSwitchContext.Provider value={controls}>
      <D97OverworldScreenAdapter run={run} journeyContent={CONTENT} />
    </GameSwitchContext.Provider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view.container.ownerDocument;
}

function unavailableLogs() {
  return vi.mocked(logEvent).mock.calls.filter(([name]) => name === "d97_dream_unavailable");
}

beforeEach(() => {
  vi.mocked(logEvent).mockClear();
  registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR], dreams: [SYNTHETIC_DREAM_A] }));
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))));
});

afterEach(() => {
  registerD97ContentProvider(null);
  vi.unstubAllGlobals();
});

describe("D97OverworldScreenAdapter", () => {
  it("shows the dream unavailable, logged, when its map fails to load", async () => {
    const controls = gameSwitch();
    const document = await render(startedRun(), controls);
    expect(document.querySelector('[data-d97-screen="dream-unavailable"]')).not.toBeNull();
    expect(document.querySelector("[data-d97-overworld-canvas]")).toBeNull();
    expect(unavailableLogs()).toHaveLength(1);
    expect(unavailableLogs()[0]?.[1]).toMatchObject({ dreamId: SYNTHETIC_DREAM_A.id, mapId: SYNTHETIC_DREAM_A.mapId, reason: "unavailable" });

    act(() => document.querySelector<HTMLElement>('[data-testid="d97-dream-unavailable-main-menu"]')?.click());
    expect(controls.openMainMenu).toHaveBeenCalledWith({ source: "d97_dream_unavailable" });
  });

  it("shows the dream unavailable, logged, for a dream the content does not register", async () => {
    const run = { ...startedRun(), dreamId: syntheticDream(9).id };
    const document = await render(run, gameSwitch());
    expect(document.querySelector('[data-d97-screen="dream-unavailable"]')).not.toBeNull();
    expect(unavailableLogs()[0]?.[1]).toMatchObject({ dreamId: run.dreamId, mapId: null, reason: "unknownDream" });
  });
});
