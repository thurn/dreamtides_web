// Shared fixtures for the ExplorationSiteScreen tests: a two-choice site
// view, follow-up and Dreamsign builders, and a render harness.
import { act } from "react";
import { vi } from "vitest";
import { parseSiteId, type DeckEntryId } from "../../types/identifiers";
import {
  testExplorationActionId,
  testGuideArtKey,
  testGuideId,
} from "../../types/test-identities";
import { plainAnnotatedText } from "../../runtime/text";
import { artRef } from "../primitives/art";
import { syntheticGameCard } from "../test-helpers/component-test-fixtures";
import { dreamsignViewFixture } from "../test-helpers/dreamsign-fixture";
import { renderInCumulus } from "../testing/render";
import {
  ExplorationSiteScreen,
  type ExplorationActionView,
  type ExplorationFollowupView,
  type ExplorationSiteView,
} from "./ExplorationSiteScreen";

export const CHOICE_A = testExplorationActionId("choice-a");
const CHOICE_B = testExplorationActionId("choice-b");

export function model(index = 17) {
  return syntheticGameCard(index, "Exploration Fixture");
}

export function entry(entryId: DeckEntryId, index?: number) {
  return { entryId, model: model(index), isBane: false };
}

export function view(resolved = false): ExplorationSiteView {
  const guideId = testGuideId("layaway");
  const action = (id: typeof CHOICE_A): ExplorationActionView => ({
    id,
    effectKind: "gain-card",
    mechanics: { effectKind: "gain-card" },
    label: "Fixture choice",
    effectText: plainAnnotatedText("Fixture effect."),
    followup: { kind: "none" },
    available: true,
  });
  return {
    siteId: parseSiteId("exploration-site"),
    scene: null,
    guide: {
      id: guideId,
      name: "Guide",
      line: "Greeting.",
      art: artRef.dreamGuide(testGuideArtKey("layaway")),
      headTargetX: 0.6,
    },
    card: model(),
    fullArt: artRef.explorationCard(17),
    narrative: "A synthetic encounter waits in the dark.",
    actions: [action(CHOICE_A), action(CHOICE_B)],
    resolvedActionId: resolved ? CHOICE_A : null,
    reward: null,
    outcomeKind: null,
  };
}

/** A view whose first action opens `followup`, with optional overrides. */
export function withFollowup(
  followup: ExplorationFollowupView,
  overrides: Partial<ExplorationActionView> = {},
): ExplorationSiteView {
  const base = view();
  return { ...base, actions: [{ ...base.actions[0], ...overrides, followup }, base.actions[1]] };
}

export const copy = { title: "Fixture title", subtitle: "Fixture subtitle" };

export function dreamsign(idSeed: string) {
  const fixture = { name: idSeed, effectDescription: "Effect.", imageAlt: "Fixture art" };
  return dreamsignViewFixture({ idSeed, ...fixture, imageName: `${idSeed}.webp` });
}

export type Dreamsign = ReturnType<typeof dreamsign>;

export function renderScreen(screenView: ExplorationSiteView) {
  const onChannel = vi.fn();
  const onResolve = vi.fn();
  const onExit = vi.fn();
  const rendered = renderInCumulus(
    <ExplorationSiteScreen view={screenView} {...{ onChannel, onResolve, onExit }} />,
  );
  const q = (selector: string) => rendered.container.querySelector<HTMLElement>(selector);
  const data = (selector: string) => q(selector)?.dataset;
  const byTestId = (marker: string) => q(`[data-testid="${marker}"]`);
  const click = (...markers: string[]) => {
    for (const marker of markers) act(() => byTestId(marker)?.click());
  };
  const finish = (selector: string) =>
    act(() => {
      q(selector)?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
  const choice = () =>
    q('[data-testid="cumulus-exploration-choice-0"] [data-exploration-action-id]');
  const open = () => {
    click("cumulus-exploration-channel");
    act(() => choice()?.click());
  };
  return {
    ...{ ...rendered, onChannel, onResolve, onExit },
    ...{ q, data, byTestId, click, finish, choice, open },
  };
}

export function immediateFrames(): void {
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
  window.cancelAnimationFrame = () => undefined;
}
