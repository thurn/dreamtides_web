// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";
import { renderInCumulus } from "../../testing/render";
import { dreamsignViewFixture } from "../../test-helpers/dreamsign-fixture";
import { DreamsignReplacementDialog } from "./DreamsignReplacementDialog";
import { click, stubMatchMedia } from "./overlay.fixtures";

vi.mock("../../../runtime/device-frame", () => ({
  hasInjectedDisplayCutout: vi.fn(() => false),
}));

beforeEach(() => {
  vi.mocked(hasInjectedDisplayCutout).mockReturnValue(false);
  stubMatchMedia(false);
});

describe("DreamsignReplacementDialog", () => {
  it("routes replacement by UUID and both dismissal controls through one intent", () => {
    const incoming = dreamsignViewFixture({
      idSeed: "10000000-0000-4000-8000-000000000001",
      name: "Incoming",
    });
    const held = [1, 2].map((index) =>
      dreamsignViewFixture({
        idSeed: `20000000-0000-4000-8000-00000000000${String(index)}`,
        name: "Held",
      }),
    );
    const onDreamsignPress = vi.fn();
    const onDismiss = vi.fn();
    const { container } = renderInCumulus(
      <DreamsignReplacementDialog
        model={{
          incoming,
          held,
          capacity: 2,
          dismissLabel: "Dismiss",
          closeLabel: "Close",
        }}
        onDreamsignPress={onDreamsignPress}
        onDismiss={onDismiss}
      />,
    );
    expect(container.querySelectorAll("[data-reveal-entity-id]")).toHaveLength(
      3,
    );
    click(
      container.querySelector<HTMLButtonElement>(
        `[data-replace-dreamsign-id="${held[1].id}"] button`,
      ),
    );
    expect(onDreamsignPress).toHaveBeenCalledWith(held[1].id);
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    click(buttons[0]);
    click(buttons[buttons.length - 1]);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
