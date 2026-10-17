// @vitest-environment jsdom
// D97SliceEndScreen contract: renders every summary stat and the Avatar
// portrait, reports New Run, and omits New Run and the portrait when absent.

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../testing/render";
import { testAvatarId } from "../../../types/test-identities";
import { D97SliceEndScreen, type D97SliceEndView } from "./D97SliceEndScreen";

const VIEW: D97SliceEndView = {
  avatar: { id: testAvatarId("slice-end-screen"), name: "Name", title: "Title", ability: "Ability", imageNumber: "7" },
  stats: [
    { id: "battles", value: 3, kind: "number" },
    { id: "beaten", value: 2, kind: "number" },
    { id: "collection", value: 31, kind: "number" },
    { id: "deck", value: 25, kind: "number" },
    { id: "essence", value: 140, kind: "essence" },
  ],
};

describe("D97SliceEndScreen", () => {
  it("renders the summary and portrait and reports New Run", () => {
    const onNewRun = vi.fn();
    const { container } = renderInCumulus(<D97SliceEndScreen view={VIEW} onNewRun={onNewRun} />);
    const stats = [...container.querySelectorAll("[data-d97-slice-end-stat]")].map((node) => node.getAttribute("data-d97-slice-end-stat"));
    expect(stats).toEqual(["battles", "beaten", "collection", "deck", "essence"]);
    expect(container.querySelector(`[data-d97-slice-end-avatar="${VIEW.avatar!.id}"]`)).not.toBeNull();
    const button = container.querySelector<HTMLElement>('[data-testid="d97-slice-end-new-run"]');
    expect(button).not.toBeNull();
    act(() => button!.click());
    expect(onNewRun).toHaveBeenCalledTimes(1);
  });

  it("omits New Run and the portrait when absent", () => {
    const { container } = renderInCumulus(<D97SliceEndScreen view={{ ...VIEW, avatar: null }} onNewRun={null} />);
    expect(container.querySelector('[data-testid="d97-slice-end-new-run"]')).toBeNull();
    expect(container.querySelector("[data-d97-slice-end-avatar]")).toBeNull();
  });
});
