import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../../rules/replay/fixture-providers";
import { accept, fixture } from "../../rules/journey/journey-loop.fixtures";
import { buildJourneyFailedView } from "../../screens/cumulus_adapters/journey-failed-view-model";
import { JourneyFailedScreen } from "./JourneyFailedScreen";
import { renderInCumulus } from "../testing/render";

describe("journey loop Cumulus result interaction", () => {
  afterEach(() => { clearGameProviders(); registerReplayFixtureProviders(); });
  it("renders the registered fold's journey result and its existing new-journey action without battle statistics", () => {
    const out = accept(fixture()), onNewJourney = vi.fn();
    expect(out.outcome).toBe("applied");
    const rendered = renderInCumulus(<JourneyFailedScreen view={buildJourneyFailedView(out.state.journey)} onNewJourney={onNewJourney} />);
    const root = rendered.container.querySelector('[data-journey-failed-scope="journey"]');
    expect(root).not.toBeNull();
    expect(root?.querySelector('[data-journey-failed-stat="deckEntries"]')).not.toBeNull();
    expect(root?.querySelector('[data-journey-failed-stat="round"]')).toBeNull();
    expect(root?.querySelector('[data-journey-failed-stat="playerScore"]')).toBeNull();
    const action = rendered.container.querySelector('[data-testid="journey-failed-start-new-run"]');
    expect(action).not.toBeNull();
    act(() => { action?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(onNewJourney).toHaveBeenCalledTimes(1);
  });
});
