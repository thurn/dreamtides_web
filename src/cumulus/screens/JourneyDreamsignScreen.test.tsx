// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../testing/render";
import { dreamsignViewFixture } from "../test-helpers/dreamsign-fixture";
import { artRef } from "../primitives/art";
import { parseDreamscapeArtKey } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";
import { JourneyDreamsignScreen, type JourneyDreamsignView, type JourneyTypeRemapView, type JourneySubtypeView } from "./JourneyDreamsignScreen";
const source = testDreamsignId("copy-source"), target = testDreamsignId("copy-target");
function view(patch: Partial<JourneyDreamsignView> = {}): JourneyDreamsignView {
  const dreamsign = dreamsignViewFixture({ id: target, name: "Synthetic", imageName: "synthetic.png" });
  return { mode: "copy", scene: artRef.dreamscapeScene(parseDreamscapeArtKey("synthetic_scene")), sourceDreamsignId: source, heldIndex: 1, choiceIndex: 0, permissionSeq: 7, siteId: null, title: "Synthetic", instruction: "Synthetic", options: [{ heldIndex: 0, dreamsign }, { heldIndex: 2, dreamsign }], held: [{ heldIndex: 0, dreamsign }, { heldIndex: 2, dreamsign }], atCap: false, canContinue: false, ...patch };
}
function click(element: Element | null) { if (element === null) throw new Error("missing control"); act(() => (element as HTMLElement).click()); }
describe("folded Dreamsign choice presentation", () => {
  it.each(["typeRemap", "subtype"] as const)("keeps a %s type tentative through menu dismissal, confirms it once and resets for a new permission", mode => {
    const typeView: JourneyTypeRemapView | JourneySubtypeView = { ...view({ options: [] }), mode, purpose: "deckSubtype", typeOptions: ["Mage", "Shadow"] };
    const onTypeRemap = vi.fn(), onCopy = vi.fn(), onOffer = vi.fn();
    const rendered = renderInCumulus(<JourneyDreamsignScreen view={typeView} onSubtype={onTypeRemap} onTypeRemap={onTypeRemap} onCopy={onCopy} onOffer={onOffer} />);
    const confirm = () => rendered.container.querySelector<HTMLButtonElement>('[data-testid="journey-type-remap-confirm"]')!;
    expect(confirm().getAttribute("aria-disabled")).toBe("true");
    click(rendered.container.querySelector('[aria-haspopup="listbox"]'));
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(document.querySelector('[role="listbox"]')).toBeNull(); expect(onTypeRemap).not.toHaveBeenCalled();
    click(rendered.container.querySelector('[aria-haspopup="listbox"]'));
    click(document.querySelector('[role="option"][data-value="Shadow"]'));
    expect(confirm().getAttribute("aria-disabled")).not.toBe("true"); expect(onTypeRemap).not.toHaveBeenCalled();
    click(confirm()); expect(onTypeRemap).toHaveBeenCalledExactlyOnceWith("Shadow");
    expect(onCopy).not.toHaveBeenCalled(); expect(onOffer).not.toHaveBeenCalled();
    rendered.rerender(<JourneyDreamsignScreen view={{ ...typeView, permissionSeq: 8 }} onSubtype={onTypeRemap} onTypeRemap={onTypeRemap} onCopy={onCopy} onOffer={onOffer} />);
    expect(confirm().getAttribute("aria-disabled")).toBe("true");
  });
  it("renders actual scene art and preserves same-printing physical target callbacks", () => {
    const onCopy = vi.fn(), onOffer = vi.fn();
    const { container } = renderInCumulus(<JourneyDreamsignScreen view={view()} onCopy={onCopy} onOffer={onOffer} />);
    expect(container.querySelector("[data-journey-dreamsign-scene]")).not.toBeNull();
    expect(container.querySelectorAll("[data-dreamsign-choice-index]")).toHaveLength(2);
    const labels = Array.from(container.querySelectorAll("[data-dreamsign-choice-index] [role=button]")).map((node) => node.getAttribute("aria-label"));
    expect(new Set(labels).size).toBe(2);
    expect(labels.every((label) => Boolean(label?.trim()))).toBe(true);
    click(container.querySelector('[data-dreamsign-choice-index="2"] [role="button"]'));
    expect(onCopy).toHaveBeenCalledExactlyOnceWith(2, target);
    expect(onOffer).not.toHaveBeenCalled(); expect(container.querySelector('[data-testid="journey-dreamsign-continue"]')).toBeNull();
  });
  it("keeps cap selection tentative and invalidates it at the next durable permission", () => {
    const alternate = testDreamsignId("alternate-offer");
    const seed = view({ mode: "offer", atCap: true, canContinue: true });
    const current = { ...seed, options: [seed.options[0], { heldIndex: 2, dreamsign: { ...seed.options[1].dreamsign, id: alternate } }] };
    const onCopy = vi.fn(), onOffer = vi.fn();
    const rendered = renderInCumulus(<JourneyDreamsignScreen view={current} onCopy={onCopy} onOffer={onOffer} />);
    const liveRegion = rendered.container.querySelector('[role="status"]');
    expect(liveRegion?.textContent).toBe("");
    const pressed = () => Array.from(rendered.container.querySelectorAll("[data-dreamsign-choice-index] [role=button]")).map((node) => node.getAttribute("aria-pressed"));
    expect(pressed()).toEqual(["false", "false"]);
    click(rendered.container.querySelector('[data-dreamsign-choice-index="0"] [role="button"]'));
    expect(onOffer).not.toHaveBeenCalled(); expect(rendered.container.querySelector('[data-testid="journey-dreamsign-replacement"]')).not.toBeNull();
    const status = () => rendered.container.querySelector('[role="status"][data-selected-dreamsign-id]');
    expect(status()).toBe(liveRegion);
    expect(status()?.querySelector('[role="button"]')).toBeNull();
    expect(status()?.getAttribute("data-selected-dreamsign-id")).toBe(target);
    expect(pressed()).toEqual(["true", "false"]);
    expect(status()?.getAttribute("aria-live")).toBe("polite");
    expect(status()?.textContent?.trim().length).toBeGreaterThan(0);
    click(rendered.container.querySelector('[data-dreamsign-choice-index="2"] [role="button"]'));
    expect(status()?.getAttribute("data-selected-dreamsign-id")).toBe(alternate);
    expect(pressed()).toEqual(["false", "true"]);
    expect(onOffer).not.toHaveBeenCalled();
    const labels = Array.from(rendered.container.querySelectorAll("[data-replacement-held-index] [role=button]")).map((node) => node.getAttribute("aria-label"));
    expect(new Set(labels).size).toBe(2);
    expect(labels.every((label) => Boolean(label?.trim()))).toBe(true);
    click(rendered.container.querySelector('[data-replacement-held-index="2"] [role="button"]'));
    expect(onOffer).toHaveBeenCalledExactlyOnceWith(alternate, 2);
    rendered.rerender(<JourneyDreamsignScreen view={{ ...current, choiceIndex: 1 }} onCopy={onCopy} onOffer={onOffer} />);
    expect(rendered.container.querySelector('[data-testid="journey-dreamsign-replacement"]')).toBeNull();
    expect(status()).toBeNull();
    expect(pressed()).toEqual(["false", "false"]);
    click(rendered.container.querySelector('[data-testid="journey-dreamsign-continue"]'));
    expect(onOffer).toHaveBeenLastCalledWith(null);
  });
  it("emits an available free pick immediately and retains a finite missing-scene empty continuation", () => {
    const onCopy = vi.fn(), onOffer = vi.fn();
    const rendered = renderInCumulus(<JourneyDreamsignScreen view={view({ mode: "offer" })} onCopy={onCopy} onOffer={onOffer} />);
    click(rendered.container.querySelector('[data-dreamsign-choice-index="0"] [role="button"]'));
    expect(onOffer).toHaveBeenCalledExactlyOnceWith(target);
    rendered.rerender(<JourneyDreamsignScreen view={view({ mode: "offer", options: [], scene: null, canContinue: true })} onCopy={onCopy} onOffer={onOffer} />);
    expect(rendered.container.querySelector("[data-journey-dreamsign-scene]")).toBeNull();
    click(rendered.container.querySelector('[data-testid="journey-dreamsign-continue"]'));
    expect(onOffer).toHaveBeenLastCalledWith(null);
  });
});
