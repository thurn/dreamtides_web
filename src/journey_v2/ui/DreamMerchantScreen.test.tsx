// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TangoRoot } from "../../tango/TangoRoot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import type {
  MerchantAcceptRequest,
  MerchantChoiceCandidate,
  MerchantEncounter,
  MerchantGameObject,
  MerchantOffer,
} from "../types";
import { makeMerchantTestCard } from "../testing/fixtures";
import { asCardId, asCardName } from "../../types/card-identity";
import { DreamMerchantScreen } from "./DreamMerchantScreen";

vi.mock("../../tango/components/card/CardView", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../tango/components/card/CardView")
  >()),
  CardView: ({ card }: { card: CardData }) => (
    <div data-testid="mock-card-view" data-card-number={card.cardNumber}>
      {card.name}
    </div>
  ),
}));

vi.mock("../../tango/components/hud/Dreamsign", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../tango/components/hud/Dreamsign")>()),
  DreamsignInfoCard: () => null,
}));

const roots: Root[] = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

function mount(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(<TangoRoot>{element}</TangoRoot>);
  });
  return container;
}

function byTestId(container: ParentNode, testId: string): HTMLElement {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing test id: ${testId}`);
  }
  return element;
}

function click(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function card(overrides: Partial<CardData> & Pick<CardData, "id" | "cardNumber">) {
  return makeMerchantTestCard({
    name: asCardName(`Merchant Card ${String(overrides.cardNumber)}`),
    cardType: "Character",
    renderedText: "Draw a card.",
    ...overrides,
  });
}

const grantCard = card({
  id: asCardId("81000000-0000-4000-8000-000000000002"),
  cardNumber: 12,
  name: asCardName("Green Contract"),
});

function catalogObject(cardData = grantCard): MerchantGameObject {
  return {
    objectType: "catalogCard",
    cardUuid: cardData.id,
    cardNumber: cardData.cardNumber,
    card: cardData,
    displayName: cardData.name,
  };
}

function grantOffer(): MerchantOffer {
  return {
    offerId: "A",
    encounterSignature: "sig-1",
    archetypeId: "strong_card",
    family: "grant",
    title: "Receive Green Contract",
    summary: "A premium card for your deck.",
    targetKey: grantCard.id,
    gameObjects: [catalogObject()],
    applyPayload: {
      kind: "add_catalog_card",
      cardUuid: grantCard.id,
      cardNumber: grantCard.cardNumber,
    },
  };
}

function dreamsignOffer(): MerchantOffer {
  return {
    offerId: "B",
    encounterSignature: "sig-1",
    archetypeId: "dreamsign",
    family: "dreamsign",
    title: "Gain the Ledger of Mists dreamsign",
    summary: "A dreamsign suited to your deck.",
    targetKey: "sign-ledger",
    gameObjects: [
      {
        objectType: "dreamsign",
        dreamsignId: "sign-ledger",
        displayName: "Ledger of Mists",
        dreamsignTemplate: {
          id: "sign-ledger",
          name: "Ledger of Mists",
          effectDescription: "When you gain essence, draw a card.",
        },
      },
    ],
    applyPayload: {
      kind: "add_dreamsign",
      dreamsignId: "sign-ledger",
      dreamsignTemplate: {
        id: "sign-ledger",
        name: "Ledger of Mists",
        effectDescription: "When you gain essence, draw a card.",
      },
    },
  };
}

function chooserOffer(): MerchantOffer {
  const candidate = (suffix: string): MerchantChoiceCandidate => {
    const c = card({
      id: asCardId(`81000000-0000-4000-8000-0000000000${suffix}`),
      cardNumber: Number(suffix),
      name: asCardName(`Choice ${suffix}`),
    });
    return {
      choiceId: `choice-${suffix}`,
      title: c.name,
      summary: "Draft pick.",
      gameObjects: [catalogObject(c)],
      applyPayload: {
        kind: "add_catalog_card",
        cardUuid: c.id,
        cardNumber: c.cardNumber,
      },
      cardUuid: c.id,
      cardNumber: c.cardNumber,
    };
  };
  return {
    offerId: "A",
    encounterSignature: "sig-1",
    archetypeId: "fit_card_draft",
    family: "grant",
    title: "Draft a card",
    summary: "Pick 1 of 4.",
    targetKey: "draft",
    gameObjects: [],
    choiceRequest: {
      choiceType: "catalogCard",
      prompt: "Draft a card",
      candidates: [
        candidate("21"),
        candidate("22"),
        candidate("23"),
        candidate("24"),
      ],
    },
  };
}

function encounter(offers: readonly MerchantOffer[]): MerchantEncounter {
  return {
    encounterSignature: "sig-1",
    siteId: "site-1",
    offers,
    dialogue: { line: "Green Contract is the strong stock today.", offerId: "A" },
    acceptReaction: "Done. A clean trade.",
  };
}

const site = {
  id: "site-1",
  type: "DreamAugury" as const,
  isEnhanced: false,
  isVisited: false,
};

describe("DreamMerchantScreen", () => {
  it("renders both offers and the dialogue line", () => {
    const container = mount(
      <DreamMerchantScreen
        site={site}
        encounter={encounter([grantOffer(), dreamsignOffer()])}
        onAcceptOffer={() => undefined}
        onDecline={() => undefined}
      />,
    );
    expect(byTestId(container, "merchant-offer-card-A")).toBeDefined();
    expect(byTestId(container, "merchant-offer-card-B")).toBeDefined();
    expect(byTestId(container, "merchant-dialogue-line").textContent).toContain(
      "Green Contract",
    );
    expect(byTestId(container, "dream-merchant-v2-screen").dataset.offerCount).toBe(
      "2",
    );
  });

  it("accepts a face-up offer with the archetype id and shows the reaction", () => {
    const requests: MerchantAcceptRequest[] = [];
    const container = mount(
      <DreamMerchantScreen
        site={site}
        encounter={encounter([grantOffer(), dreamsignOffer()])}
        onAcceptOffer={(request) => {
          requests.push(request);
          return { ok: true };
        }}
        onDecline={() => undefined}
      />,
    );
    click(byTestId(container, "merchant-offer-action-A"));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      offerId: "A",
      archetypeId: "strong_card",
      encounterSignature: "sig-1",
    });
    expect(byTestId(container, "merchant-accept-reaction").textContent).toContain(
      "clean trade",
    );
  });

  it("opens a chooser and accepts with the selected choice", () => {
    const requests: MerchantAcceptRequest[] = [];
    const container = mount(
      <DreamMerchantScreen
        site={site}
        encounter={encounter([chooserOffer(), dreamsignOffer()])}
        onAcceptOffer={(request) => {
          requests.push(request);
          return { ok: true };
        }}
        onDecline={() => undefined}
      />,
    );
    // Selection is intrinsic to the object: click the candidate card to choose
    // it, then confirm with the accept button (which is disabled until a pick).
    click(byTestId(container, "journey-choice-choice-22"));
    click(byTestId(container, "merchant-offer-action-A"));
    expect(requests).toHaveLength(1);
    expect(requests[0].choice?.choiceId).toBe("choice-22");
  });

  it("declines via walk away", () => {
    let declined = false;
    const container = mount(
      <DreamMerchantScreen
        site={site}
        encounter={encounter([grantOffer(), dreamsignOffer()])}
        onAcceptOffer={() => undefined}
        onDecline={() => {
          declined = true;
        }}
      />,
    );
    click(byTestId(container, "merchant-walk-away"));
    expect(declined).toBe(true);
  });
});
