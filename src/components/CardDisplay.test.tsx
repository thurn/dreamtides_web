// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CardData } from "../types/cards";
import { computeCardTextScale } from "./card-display-scale";
import { CardDisplay } from "./CardDisplay";
import { CardView } from "./CardView";

function makeCard(overrides: Partial<CardData>): CardData {
  return {
    name: "Test Card",
    id: "test-card",
    cardNumber: 1,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 3,
    spark: 2,
    isFast: false,
    renderedText: "Test text.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CardDisplay", () => {
  it("computes card text scale from rendered card width", () => {
    expect(computeCardTextScale(null, false)).toBe(1);
    expect(computeCardTextScale(156, false)).toBe(1);
    expect(computeCardTextScale(78, false)).toBe(0.5);
    expect(computeCardTextScale(48, false)).toBe(0.48);
    expect(computeCardTextScale(220, true)).toBe(1);
    expect(computeCardTextScale(110, true)).toBe(0.5);
  });

  it("can omit rules text on dense card surfaces", () => {
    const { container, root } = mount(
      <CardDisplay
        card={makeCard({ renderedText: "Draw a card." })}
        hideRulesText
      />,
    );

    expect(container.textContent).toContain("Test Card");
    expect(container.textContent).not.toContain("Draw a card.");
    expect(container.querySelector("[data-rules-text-paragraph]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("preserves aspect ratio and text-scale metadata on the shared card root", () => {
    const { container, root } = mount(<CardDisplay card={makeCard({})} />);
    const cardRoot = container.firstElementChild as HTMLDivElement | null;

    if (cardRoot === null) {
      throw new Error("Missing card root");
    }

    expect(cardRoot.style.aspectRatio).toBe("5 / 7");
    expect(cardRoot.getAttribute("data-card-text-scale")).toBe("1.00");

    act(() => {
      root.unmount();
    });
  });

  it("renders the image fallback through the shared card view", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ name: "Fallback Name" })} />,
    );
    const image = container.querySelector("img");

    if (image === null) {
      throw new Error("Missing card image");
    }

    act(() => {
      image.dispatchEvent(new Event("error", { bubbles: true }));
    });

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("Fallback Name");

    act(() => {
      root.unmount();
    });
  });

  it("lets CardView slot overrides wrap editable field surfaces", () => {
    const { container, root } = mount(
      <CardView
        card={makeCard({
          cardType: "Character",
          subtype: "Scout",
          renderedText: "Draw a card.",
        })}
        slots={{
          energy: (_context, defaultNode) => (
            <span data-slot="energy">{defaultNode}</span>
          ),
          name: (_context, defaultNode) => (
            <span data-slot="name">{defaultNode}</span>
          ),
          typeLine: (_context, defaultNode) => (
            <span data-slot="type-line">{defaultNode}</span>
          ),
          typeLineContent: (_context, defaultNode) => (
            <span data-slot="type-line-content">{defaultNode}</span>
          ),
          rulesText: (_context, defaultNode) => (
            <span data-slot="rules-text">{defaultNode}</span>
          ),
          spark: (_context, defaultNode) => (
            <span data-slot="spark">{defaultNode}</span>
          ),
        }}
      />,
    );

    expect(container.querySelector("[data-slot=\"energy\"] [data-card-stat=\"energy\"]")).not.toBeNull();
    expect(container.querySelector("[data-slot=\"name\"]")?.textContent).toContain("Test Card");
    expect(container.querySelector("[data-slot=\"type-line\"]")?.textContent).toContain("Scout");
    expect(container.querySelector("[data-slot=\"type-line-content\"]")?.textContent).toBe("Scout");
    expect(container.querySelector("[data-slot=\"rules-text\"]")?.textContent).toContain("Draw a card.");
    expect(container.querySelector("[data-slot=\"spark\"] [data-card-stat=\"spark\"]")).not.toBeNull();
    expect(container.firstElementChild?.getAttribute("data-card-text-scale")).toBe("1.00");

    act(() => {
      root.unmount();
    });
  });

  it("lets CardView type-line content slots render for blank formatted type lines", () => {
    const { container, root } = mount(
      <CardView
        card={makeCard({
          cardType: "Character",
          isFast: false,
          subtype: "*",
        })}
        slots={{
          typeLineContent: () => (
            <span data-slot="type-line-content">Add subtype</span>
          ),
        }}
      />,
    );

    const typeLine = container.querySelector<HTMLElement>(
      "[data-testid=\"card-type-line\"]",
    );
    expect(typeLine).not.toBeNull();
    expect(typeLine?.textContent).toBe("Add subtype");
    expect(container.querySelector("[data-slot=\"type-line-content\"]")).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders the energy cost as a glowing flame with a white outlined number", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ energyCost: 4 })} />,
    );

    const energyOrb = container.querySelector<HTMLElement>(
      "[data-card-stat=\"energy\"]",
    );
    expect(energyOrb).not.toBeNull();
    expect(energyOrb?.textContent).toBe("4");
    expect(energyOrb?.getAttribute("aria-label")).toBe("energy cost");
    // The stat is backed by the Boxicons fire-alt glyph.
    expect(energyOrb?.querySelector("i.bxf.bx-fire-alt")).not.toBeNull();
    // The number is white with a black text-shadow outline.
    const numberStyle =
      energyOrb?.querySelector("div")?.getAttribute("style")?.toLowerCase() ??
      "";
    expect(numberStyle).toContain("color: rgb(255, 255, 255)");
    expect(numberStyle).toContain("text-shadow");
    // No bare ● glyph.
    expect(container.textContent).not.toContain("●");

    act(() => {
      root.unmount();
    });
  });

  it("renders the energy cost as 'X' for variable-cost (null) cards", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ energyCost: null })} />,
    );

    const energyOrb = container.querySelector<HTMLElement>(
      "[data-card-stat=\"energy\"]",
    );
    expect(energyOrb?.textContent).toBe("X");

    act(() => {
      root.unmount();
    });
  });

  it("stacks one energy orb per cost for a multi-cost card", () => {
    const { container, root } = mount(
      <CardDisplay
        card={makeCard({ energyCost: 2, energyCosts: ["2", "X"] })}
      />,
    );

    const energyOrbs = container.querySelectorAll<HTMLElement>(
      "[data-card-stat=\"energy\"]",
    );
    expect(energyOrbs.length).toBe(2);
    expect([...energyOrbs].map((orb) => orb.textContent)).toEqual(["2", "X"]);

    act(() => {
      root.unmount();
    });
  });

  it("renders a single orb when a multi-cost array has only one entry", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ energyCost: 5, energyCosts: ["5"] })} />,
    );

    const energyOrbs = container.querySelectorAll<HTMLElement>(
      "[data-card-stat=\"energy\"]",
    );
    expect(energyOrbs.length).toBe(1);
    expect(energyOrbs[0]?.textContent).toBe("5");

    act(() => {
      root.unmount();
    });
  });

  it("renders inline energy symbols in rules text as flame icons", () => {
    const { container, root } = mount(
      <CardDisplay
        card={makeCard({ renderedText: "Pay ●2: draw a card." })}
      />,
    );

    const inlineFlames = container.querySelectorAll(
      "i.bxf.bx-fire-alt[aria-label=\"energy\"]",
    );
    expect(inlineFlames.length).toBe(1);
    expect(container.textContent).not.toContain("●");
    expect(container.textContent).toContain("Pay ");
    expect(container.textContent).toContain("2: draw a card.");

    act(() => {
      root.unmount();
    });
  });

  it("themes Event cards with the purple event accent", () => {
    const { container, root } = mount(
      <CardDisplay
        card={makeCard({
          cardType: "Event",
          spark: null,
        })}
      />,
    );

    const cardRoot = container.firstElementChild as HTMLElement | null;
    // The Event accent is keyed off the card root's `data-card-type`, which
    // drives the purple title-band / text-box gradients in `index.css`.
    expect(cardRoot?.getAttribute("data-card-type")).toBe("Event");
    // The full-bleed frame carries no parchment art.
    expect(container.innerHTML).not.toContain("card_frame");

    act(() => {
      root.unmount();
    });
  });

  it("themes Character cards with the neutral black chrome", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ cardType: "Character" })} />,
    );

    const cardRoot = container.firstElementChild as HTMLElement | null;
    expect(cardRoot?.getAttribute("data-card-type")).toBe("Character");
    expect(container.innerHTML).not.toContain("card_frame");

    act(() => {
      root.unmount();
    });
  });

  it("renders the spark stat as a glowing sparkle with a white outlined number and no ⍏ glyph", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ cardType: "Character", spark: 4 })} />,
    );

    const sparkOrb = container.querySelector<HTMLElement>(
      "[data-card-stat=\"spark\"]",
    );
    expect(sparkOrb).not.toBeNull();
    expect(sparkOrb?.textContent).toBe("4");
    // No bare spark glyph anywhere on the card.
    expect(container.textContent).not.toContain("⍏");
    // The stat is backed by the Boxicons sparkles glyph.
    expect(sparkOrb?.querySelector("i.bxf.bx-sparkles")).not.toBeNull();
    // White number with a black text-shadow outline.
    const numberStyle =
      sparkOrb?.querySelector("div")?.getAttribute("style")?.toLowerCase() ??
      "";
    expect(numberStyle).toContain("color: rgb(255, 255, 255)");
    expect(numberStyle).toContain("text-shadow");

    act(() => {
      root.unmount();
    });
  });

  it("renders inline ⍏N spark references in rules text as a gold pip badge", () => {
    const { container, root } = mount(
      <CardDisplay
        card={makeCard({
          cardType: "Character",
          spark: 1,
          renderedText: "An ally gains ⍏3 this turn.",
        })}
      />,
    );

    // The inline reference renders as its own compact pip badge, separate
    // from the corner spark orb.
    const inlinePips = container.querySelectorAll(
      "[data-pip-variant=\"spark\"]",
    );
    expect(inlinePips.length).toBe(1);
    expect(container.querySelector("[data-card-stat=\"spark\"]")).not.toBeNull();
    // No bare ⍏ glyph anywhere — including inside the rules text.
    expect(container.textContent).not.toContain("⍏");
    // The inline pip displays the value from the rules text.
    expect(inlinePips[0]?.textContent).toBe("3");

    act(() => {
      root.unmount();
    });
  });

  it("wraps the energy orb in a HoverPopover tooltip anchor", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ energyCost: 4 })} />,
    );

    const energyOrb = container.querySelector<HTMLElement>(
      "[data-card-stat=\"energy\"]",
    );
    expect(energyOrb).not.toBeNull();
    // CardStatOrb wraps the orb in a HoverPopover span when a tooltip is set;
    // without a tooltip the orb would be the direct child of the positioning div.
    const wrapper = energyOrb?.parentElement;
    expect(wrapper?.tagName.toLowerCase()).toBe("span");

    act(() => {
      root.unmount();
    });
  });

  it("wraps the spark orb in a HoverPopover tooltip anchor", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ cardType: "Character", spark: 3 })} />,
    );

    const sparkOrb = container.querySelector<HTMLElement>(
      "[data-card-stat=\"spark\"]",
    );
    expect(sparkOrb).not.toBeNull();
    const wrapper = sparkOrb?.parentElement;
    expect(wrapper?.tagName.toLowerCase()).toBe("span");

    act(() => {
      root.unmount();
    });
  });

  it("does not render a spark orb for Event cards", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ cardType: "Event", spark: null })} />,
    );

    expect(container.querySelector("[data-card-stat=\"spark\"]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("does not render the rarity shimmer overlay for non-Legendary rarities", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ rarity: "Starter" })} />,
    );

    expect(
      container.querySelector("[data-testid=\"card-rarity-shimmer\"]"),
    ).toBeNull();
    const cardRoot = container.firstElementChild as HTMLDivElement | null;
    expect(cardRoot?.className.includes("card-rarity-legendary")).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it("does not render the rarity shimmer overlay when rarity is omitted", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({})} />,
    );

    expect(
      container.querySelector("[data-testid=\"card-rarity-shimmer\"]"),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders a Legendary card with a gold rarity frame ring and shimmer overlay", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ rarity: "Legendary" })} />,
    );

    const cardRoot = container.firstElementChild as HTMLDivElement | null;
    if (!cardRoot) {
      throw new Error("Missing card root");
    }
    // Frame ring: gold-tinted outer box-shadow.
    expect(cardRoot.style.boxShadow.toLowerCase()).toContain("#f5c542");
    // CSS hook for the keyframe animation lives on the root and the overlay.
    expect(cardRoot.className.includes("card-rarity-legendary")).toBe(true);
    expect(cardRoot.getAttribute("data-rarity")).toBe("Legendary");
    const shimmer = container.querySelector<HTMLElement>(
      "[data-testid=\"card-rarity-shimmer\"]",
    );
    expect(shimmer).not.toBeNull();
    expect(
      shimmer?.className.includes("card-rarity-legendary__shimmer"),
    ).toBe(true);
    // Overlay is decorative — aria-hidden so screen readers skip it.
    expect(shimmer?.getAttribute("aria-hidden")).toBe("true");

    act(() => {
      root.unmount();
    });
  });

  it("keeps the gold rarity ring on a Legendary character card", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ rarity: "Legendary", cardType: "Character" })} />,
    );

    const cardRoot = container.firstElementChild as HTMLDivElement | null;
    if (!cardRoot) {
      throw new Error("Missing card root");
    }
    // The gold rarity ring composes with the neutral character chrome.
    expect(cardRoot.style.boxShadow.toLowerCase()).toContain("#f5c542");
    expect(cardRoot.getAttribute("data-card-type")).toBe("Character");

    act(() => {
      root.unmount();
    });
  });

  it("renders the fast attribute as a bolt inline before the card name", () => {
    const { container, root } = mount(
      <CardDisplay
        card={makeCard({
          name: "Test Card",
          isFast: true,
          cardType: "Character",
          subtype: "Explorer",
        })}
      />,
    );

    const chip = container.querySelector<HTMLElement>(
      "[data-attribute-chip=\"fast\"]",
    );
    expect(chip).not.toBeNull();
    // A single filled bolt boxicon.
    expect(chip?.querySelectorAll("i.bxf.bx-bolt").length).toBe(1);
    expect(chip?.getAttribute("aria-label")).toBe("fast");
    // White bolt.
    expect((chip?.getAttribute("style") ?? "").toLowerCase()).toContain(
      "color: rgb(255, 255, 255)",
    );

    // The chip is the first child of the name element and precedes the name
    // text (the bolt is an icon glyph, so the name element's text is the name).
    const nameEl = chip?.parentElement;
    expect(nameEl?.firstElementChild).toBe(chip);
    expect(nameEl?.textContent).toBe("Test Card");

    // The bolt does not appear on the type/subtype row.
    const typeLine = container.querySelector<HTMLElement>(
      "[data-testid=\"card-type-line\"]",
    );
    expect(typeLine?.querySelector("[data-attribute-chip]")).toBeNull();
    expect(typeLine?.textContent).toBe("Explorer");

    // No corner badge: there must be no element at the old top-right slot
    // rendering the bolt.
    const cornerBadges = Array.from(
      container.querySelectorAll<HTMLElement>("div[class*='right-'][class*='rounded-full']"),
    ).filter((el) => el.textContent === "↯");
    expect(cornerBadges.length).toBe(0);

    act(() => {
      root.unmount();
    });
  });

  it("renders a double bolt before the name for an interrupt card", () => {
    const { container, root } = mount(
      <CardDisplay
        card={makeCard({
          name: "Test Card",
          isFast: true,
          isInterrupt: true,
          cardType: "Character",
          subtype: "Explorer",
        })}
      />,
    );

    // The interrupt chip replaces the single-bolt fast chip with two bolts.
    expect(
      container.querySelector("[data-attribute-chip=\"fast\"]"),
    ).toBeNull();
    const chip = container.querySelector<HTMLElement>(
      "[data-attribute-chip=\"interrupt\"]",
    );
    expect(chip).not.toBeNull();
    expect(chip?.querySelectorAll("i.bxf.bx-bolt").length).toBe(2);
    expect(chip?.getAttribute("aria-label")).toBe("interrupt");

    // Inline before the card name.
    const nameEl = chip?.parentElement;
    expect(nameEl?.firstElementChild).toBe(chip);
    expect(nameEl?.textContent).toBe("Test Card");

    act(() => {
      root.unmount();
    });
  });

  it("omits the fast chip when the card is not fast", () => {
    const { container, root } = mount(
      <CardDisplay
        card={makeCard({
          isFast: false,
          cardType: "Character",
          subtype: "Explorer",
        })}
      />,
    );

    expect(
      container.querySelector("[data-attribute-chip=\"fast\"]"),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders the fast bolt before the name even when the type line is empty", () => {
    // `formatTypeLine` returns "" for a Character with subtype "*". The bolt
    // rides on the name, so it must still render as the fast indicator.
    const { container, root } = mount(
      <CardDisplay
        card={makeCard({
          name: "Test Card",
          isFast: true,
          cardType: "Character",
          subtype: "*",
        })}
      />,
    );

    const chip = container.querySelector<HTMLElement>(
      "[data-attribute-chip=\"fast\"]",
    );
    expect(chip).not.toBeNull();
    expect(chip?.querySelectorAll("i.bxf.bx-bolt").length).toBe(1);
    const nameEl = chip?.parentElement;
    expect(nameEl?.textContent).toBe("Test Card");

    act(() => {
      root.unmount();
    });
  });

  it("renders the name's fast bolt alongside the inline ↯fast rules-text glyph", () => {
    const { container, root } = mount(
      <CardDisplay
        card={makeCard({
          isFast: true,
          renderedText: "↯fast",
        })}
      />,
    );

    // The chip before the name renders as a filled bolt boxicon.
    const chip = container.querySelector<HTMLElement>(
      "[data-attribute-chip=\"fast\"]",
    );
    expect(chip).not.toBeNull();
    expect(chip?.querySelectorAll("i.bxf.bx-bolt").length).toBe(1);
    // The inline rules-text reference still renders the original colored glyph.
    expect((container.textContent?.match(/↯/g) ?? []).length).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it("gives Character and Event cards an identical drop shadow, differing only by the type accent", () => {
    const characterMount = mount(
      <CardDisplay card={makeCard({ cardType: "Character" })} />,
    );
    const eventMount = mount(
      <CardDisplay
        card={makeCard({ cardType: "Event", spark: null })}
      />,
    );

    const characterRoot =
      characterMount.container.firstElementChild as HTMLDivElement | null;
    const eventRoot =
      eventMount.container.firstElementChild as HTMLDivElement | null;
    if (!characterRoot || !eventRoot) {
      throw new Error("Missing card root");
    }

    // The card box itself carries no type-colored border, so both share the
    // same drop shadow; the Event accent lives on the text box instead.
    expect(characterRoot.style.boxShadow).toBe(eventRoot.style.boxShadow);

    // The card type drives the purple Event accent on the text box.
    expect(characterRoot.getAttribute("data-card-type")).toBe("Character");
    expect(eventRoot.getAttribute("data-card-type")).toBe("Event");

    act(() => {
      characterMount.root.unmount();
      eventMount.root.unmount();
    });
  });
});
