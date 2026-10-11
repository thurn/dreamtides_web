// @vitest-environment jsdom

// BattlePromptHost over the Foresee and arrangement editors: Cancel exactly
// while the prompt is cancellable.
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../testing/render";
import {
  BattlePromptHost,
  type BattlePromptHostView,
} from "../../screens/battle-overlays/BattlePromptHost";
import { parsePromptId } from "../../../types/identifiers";
import {
  arrangement,
  dialogCloseButtons,
  makeView,
  stubMatchMedia,
} from "./BattleForeseeEditor.fixtures";

vi.mock("../card/CardView", () => ({
  GameCard: () => <div data-mock-game-card="" />,
}));

describe("BattlePromptHost arrangements", () => {
  beforeEach(() => stubMatchMedia(false));

  const host = (arrange: BattlePromptHostView["arrange"], cancellable: boolean): BattlePromptHostView => ({
    key: parsePromptId("1:0:0"),
    heading: null,
    cancellable,
    number: null,
    arrange,
    loopOffer: null,
    notice: null,
  });

  it("renders each arrangement surface with Cancel exactly while the prompt is cancellable", () => {
    const onCancel = vi.fn();
    for (const arrange of [
      { surface: "foresee", model: makeView(3) },
      { surface: "arrangement", model: arrangement() },
    ] as const) {
      const fixed = renderInCumulus(<BattlePromptHost view={host(arrange, false)} canAct={false} onCancel={onCancel} />);
      expect(fixed.container.querySelector(arrange.surface === "foresee" ? "[data-battle-cumulus-foresee]" : "[data-battle-arrange-editor]")).not.toBeNull();
      expect(dialogCloseButtons(fixed.container)).toEqual([]);
      fixed.unmount();
      const cancellable = renderInCumulus(<BattlePromptHost view={host(arrange, true)} canAct={false} onCancel={onCancel} />);
      act(() => dialogCloseButtons(cancellable.container)[0]?.click());
      cancellable.unmount();
    }
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
