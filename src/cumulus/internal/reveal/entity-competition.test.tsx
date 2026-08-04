// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import type { Dreamsign as DreamsignData } from "../../../types/journey";
import { CumulusRoot } from "../../CumulusRoot";
import { GameCard } from "../../components/card/CardView";
import { GlossaryTerm } from "../../components/card/GlossaryTerm";
import { Dreamsign } from "../../components/hud/Dreamsign";
import { SiteNode, type DreamscapeSiteModel } from "../../components/dreamscape/SiteNode";
import { glyph } from "../../primitives/glyph";

const CARD_ID = asCardId("11111111-1111-4111-8111-111111111111");
const CARD: CardData = { id: CARD_ID, name: asCardName("Fixture Card"), cardNumber: 1, cardType: "Event", subtype: "", isStarter: false, rarity: "Special", energyCost: 1, spark: null, isFast: false, renderedText: "Nightmare is a Bane. Discover. Ephemeral.", imageNumber: 1, artOwned: false };
const SIGN: DreamsignData = { id: "22222222-2222-4222-8222-222222222222", name: "Fixture Sign", effectDescription: "Fixed effect.", isNegative: false };
const SITE: DreamscapeSiteModel = { site: { id: "33333333-3333-4333-8333-333333333333", type: "Battle", isEnhanced: false, isVisited: false }, pos: { x: 50, y: 50 }, index: 0, isBattle: true, isLocked: true, isInteractive: false, label: "Locked Fixture", blurb: "Fixed site detail.", icon: glyph("bxf bx-lock") };

let root: Root;
let container: HTMLDivElement;
let resizeCallbacks: ResizeObserverCallback[];

function rect(width: number, height: number): DOMRect {
  return { x: 40, y: 40, left: 40, top: 40, right: 40 + width, bottom: 40 + height, width, height, toJSON: () => ({}) };
}

function activeSources(): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-reveal-active="true"]')];
}

function pointer(target: HTMLElement, type: "pointerover" | "pointerout", pointerId: number): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse", pointerId }));
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 1200, height: 420, offsetLeft: 0, offsetTop: 0 } });
  window.matchMedia = (query: string) => ({ matches: query.includes("pointer: fine"), media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
  resizeCallbacks = [];
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.dataset.revealMeasure === "primary") return rect(340, 360);
    if (this.dataset.revealMeasure === "secondary") return rect(248, 180);
    if (this.hasAttribute("data-game-card-source")) return rect(160, 240);
    return rect(100, 100);
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
});

describe("cross-family reveal competition", () => {
  it("enforces replacement, Escape suppression, unavailable activation, and consolidated definitions", async () => {
    const unavailableActivation = vi.fn();
    act(() => root.render(<CumulusRoot>
      <GameCard model={{ cardId: CARD_ID, displaySnapshot: CARD }} />
      <GlossaryTerm entry={{ term: "Fixture", definition: "Fixed local definition." }} text="Fixture" />
      <Dreamsign dreamsign={SIGN} sizePx={40} />
      <SiteNode model={SITE} motion={false} onSelect={unavailableActivation} />
    </CumulusRoot>));
    const card = container.querySelector<HTMLElement>("[data-game-card-source]")!;
    const glossary = container.querySelector<HTMLElement>("[data-glossary-term]")!;
    const dreamsign = container.querySelector<HTMLElement>("[data-dreamsign-id]")!;
    const site = container.querySelector<HTMLElement>("[data-site-id]")!;

    act(() => glossary.focus());
    expect(activeSources()).toEqual([glossary]);
    act(() => { pointer(dreamsign, "pointerover", 1); });
    expect(activeSources()).toEqual([dreamsign]);
    act(() => { pointer(dreamsign, "pointerout", 1); });
    expect(activeSources()).toEqual([glossary]);

    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(activeSources()).toHaveLength(0);
    expect(document.querySelectorAll("[data-cumulus-reveal-group]")).toHaveLength(0);
    act(() => { pointer(dreamsign, "pointerover", 2); pointer(dreamsign, "pointerout", 2); });
    expect(activeSources()).toHaveLength(0);
    expect(document.querySelectorAll("[data-cumulus-reveal-group]")).toHaveLength(0);
    act(() => { glossary.blur(); glossary.focus(); });
    expect(activeSources()).toEqual([glossary]);

    act(() => {
      site.click();
      site.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(unavailableActivation).not.toHaveBeenCalled();

    act(() => { glossary.blur(); pointer(card, "pointerover", 3); });
    await act(async () => { await Promise.resolve(); });
    act(() => { for (const callback of resizeCallbacks) callback([], {} as ResizeObserver); });
    await vi.waitFor(() => expect(document.querySelector("[data-cumulus-reveal-group]")).not.toBeNull());
    expect(activeSources()).toEqual([card]);
    expect(document.querySelectorAll("[data-cumulus-reveal-group]")).toHaveLength(1);
    expect(card.dataset.revealSecondaryTitles).toBe("");
    const shownSecondaries = document.querySelectorAll('[data-cumulus-reveal-card="secondary"]');
    expect(shownSecondaries).toHaveLength(1);
    const description = document.getElementById(card.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
    let previousIndex = -1;
    for (const term of ["Bane", "Discover", "Ephemeral"]) {
      const index = description.indexOf(term);
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
  });
});
