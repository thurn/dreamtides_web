// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import type { Dreamsign as DreamsignData } from "../../../types/quest";
import { TangoRoot } from "../../TangoRoot";
import { GameCard } from "../../components/card/CardView";
import { GlossaryTerm } from "../../components/card/GlossaryTerm";
import { Dreamsign } from "../../components/hud/Dreamsign";
import { SiteNode, type DreamscapeSiteModel } from "../../components/dreamscape/SiteNode";
import { glyph } from "../../primitives/glyph";

const CARD_ID = asCardId("11111111-1111-4111-8111-111111111111");
const CARD: CardData = { id: CARD_ID, name: asCardName("Fixture Card"), cardNumber: 1, cardType: "Event", subtype: "", isStarter: false, rarity: "Special", energyCost: 1, spark: null, isFast: false, renderedText: "Bane. Discover. Ephemeral.", imageNumber: 1, artOwned: false };
const SIGN: DreamsignData = { id: "22222222-2222-4222-8222-222222222222", name: "Fixture Sign", effectDescription: "Fixed effect.", isBane: false };
const SITE: DreamscapeSiteModel = { site: { id: "33333333-3333-4333-8333-333333333333", type: "Battle", isEnhanced: false, isVisited: false }, pos: { x: 50, y: 50 }, index: 0, isBattle: true, isLocked: true, isInteractive: false, label: "Locked Fixture", blurb: "Fixed site detail.", icon: glyph("bxf bx-lock") };

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = (() => ({ matches: true, media: "", onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class { constructor(private callback: ResizeObserverCallback) {} observe() { this.callback([], this as unknown as ResizeObserver); } unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 40, y: 40, left: 40, top: 40, right: 140, bottom: 140, width: 100, height: 100, toJSON: () => ({}) } as DOMRect);
});

describe("cross-family reveal competition", () => {
  it("keeps one global winner, restores hover after focus, suppresses Escape and unavailable activation, and retains the complete description", async () => {
    const unavailableActivation = vi.fn();
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    act(() => root.render(<TangoRoot>
      <GameCard model={{ cardId: CARD_ID, displaySnapshot: CARD }} />
      <GlossaryTerm entry={{ term: "Fixture", definition: "Fixed local definition." }} text="Fixture" />
      <Dreamsign dreamsign={SIGN} sizePx={40} />
      <SiteNode model={SITE} motion={false} onSelect={unavailableActivation} />
    </TangoRoot>));
    const card = container.querySelector<HTMLElement>("[data-game-card-source]")!;
    const glossary = container.querySelector<HTMLElement>("[data-glossary-term]")!;
    const site = container.querySelector<HTMLElement>("[data-site-id]")!;
    act(() => glossary.focus());
    expect(glossary.dataset.revealActive).toBe("true");
    act(() => { card.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", pointerId: 1 })); });
    await act(async () => { await Promise.resolve(); });
    expect(card.dataset.revealActive).toBe("true"); expect(glossary.dataset.revealActive).toBe("false");
    expect(document.querySelectorAll("[data-tango-reveal-group]")).toHaveLength(1);
    act(() => { card.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", pointerId: 1 })); });
    expect(glossary.dataset.revealActive).toBe("true");
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(document.querySelectorAll("[data-tango-reveal-group]").length).toBeLessThanOrEqual(1);
    act(() => site.focus());
    expect(site.dataset.revealActive).toBe("true");
    act(() => { site.click(); site.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(unavailableActivation).not.toHaveBeenCalled();
    const cardDescription = document.getElementById(card.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
    expect(cardDescription).toContain("Bane"); expect(cardDescription).toContain("Discover"); expect(cardDescription).toContain("Ephemeral");
    expect(document.querySelectorAll("[data-tango-reveal-group]").length).toBeLessThanOrEqual(1);
    act(() => root.unmount()); container.remove();
  });
});
