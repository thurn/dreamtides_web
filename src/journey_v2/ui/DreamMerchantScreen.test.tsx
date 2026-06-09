// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import type {
  MerchantAcceptRequest,
  MerchantDeclineRequest,
  MerchantEncounter,
  MerchantGameObject,
  MerchantOffer,
} from "../types";
import { makeMerchantTestCard } from "../testing/fixtures";
import { DreamMerchantScreen } from "./DreamMerchantScreen";

vi.mock("../../components/CardDisplay", () => ({
  CardDisplay: ({ card }: { card: CardData }) => (
    <div data-testid="mock-card-display" data-card-number={card.cardNumber}>
      {card.name}
    </div>
  ),
}));

vi.mock("../../components/DreamsignArtTile", () => ({
  DreamsignArtTile: ({
    dreamsign,
  }: {
    dreamsign: { id?: string; name: string };
  }) => (
    <div data-testid="mock-dreamsign-art" data-dreamsign-id={dreamsign.id}>
      {dreamsign.name}
    </div>
  ),
}));

vi.mock("../../components/RulesText", () => ({
  RulesText: ({ text }: { text: string }) => <span>{text}</span>,
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
    root.render(element);
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
    name: `Merchant Card ${overrides.cardNumber}`,
    cardType: "Character",
    renderedText: "Draw a card.",
    ...overrides,
  });
}

const deckCard = card({
  id: "81000000-0000-4000-8000-000000000001",
  cardNumber: 11,
  name: "Lantern Broker",
});
const newCard = card({
  id: "81000000-0000-4000-8000-000000000002",
  cardNumber: 12,
  name: "Green Contract",
});
const candidateCard = card({
  id: "81000000-0000-4000-8000-000000000003",
  cardNumber: 13,
  name: "Silver Margin",
});

function deckObject(): MerchantGameObject {
  return {
    objectType: "deckCard",
    entryId: "entry-lantern",
    cardUuid: deckCard.id,
    cardNumber: deckCard.cardNumber,
    deckEntry: {
      entryId: "entry-lantern",
      cardNumber: deckCard.cardNumber,
      transfiguration: null,
      isBane: false,
    },
    card: deckCard,
    displayName: deckCard.name,
    badge: { label: "Remove", detail: "Removed from deck" },
  };
}

function catalogObject(cardData = newCard): MerchantGameObject {
  return {
    objectType: "catalogCard",
    cardUuid: cardData.id,
    cardNumber: cardData.cardNumber,
    card: cardData,
    displayName: cardData.name,
    badge: { label: "Gain" },
  };
}

function dreamsignObject(): MerchantGameObject {
  return {
    objectType: "dreamsign",
    dreamsignId: "sign-ledger",
    displayName: "Ledger of Mists",
    dreamsignTemplate: {
      id: "sign-ledger",
      name: "Ledger of Mists",
      effectDescription: "When you gain essence, draw a card.",
    },
    badge: { label: "Boon" },
  };
}

function essenceObject(amount: number): MerchantGameObject {
  return {
    objectType: "essence",
    amount,
    badge: { label: amount > 0 ? "Gain" : "Pay" },
  };
}

function priceDetail(price: number, locked = false): MerchantOffer["priceDetail"] {
  return {
    price,
    locked,
    ...(locked ? { lockedReason: "insufficient_essence" as const } : {}),
    valueEssence: price,
    needSeverity: 0.7,
    needSeverityMultiplier: 1,
    scarcityMultiplier: 1,
    marketJitter: 1,
  };
}

function directOffer(overrides: Partial<MerchantOffer> = {}): MerchantOffer {
  const locked = overrides.locked ?? false;
  const price = overrides.price ?? 55;
  return {
    offerId: "A",
    encounterSignature: "encounter-fixture",
    rewardBuilderId: "replace_weak_with_fit",
    needId: "need-weak-card",
    price,
    priceDetail: priceDetail(price, locked),
    locked,
    ...(locked ? { lockedReason: "insufficient_essence" as const } : {}),
    reward: {
      builderId: "replace_weak_with_fit",
      title: "Trade the weak stitch",
      summary: "Remove a weak card and gain a fitting support card.",
      answersNeedIds: ["need-weak-card"],
      gameObjects: [deckObject(), catalogObject(), essenceObject(20)],
      valueEssence: 80,
      applyPayload: {
        kind: "composite",
        children: [
          {
            kind: "remove_deck_entry",
            entryId: "entry-lantern",
            cardUuid: deckCard.id,
            cardNumber: deckCard.cardNumber,
          },
          {
            kind: "add_catalog_card",
            cardUuid: newCard.id,
            cardNumber: newCard.cardNumber,
          },
        ],
      },
    },
    rewards: [],
    ...overrides,
  };
}

function chooserOffer(overrides: Partial<MerchantOffer> = {}): MerchantOffer {
  const price = overrides.price ?? 75;
  const locked = overrides.locked ?? false;
  const offer: MerchantOffer = {
    offerId: "B",
    encounterSignature: "encounter-fixture",
    rewardBuilderId: "grant_dreamsign",
    needId: "need-dreamsign",
    price,
    priceDetail: priceDetail(price, locked),
    locked,
    ...(locked ? { lockedReason: "insufficient_essence" as const } : {}),
    reward: {
      builderId: "grant_dreamsign",
      title: "Choose a sign",
      summary: "Pick a Dreamsign that steadies your deck.",
      answersNeedIds: ["need-dreamsign"],
      gameObjects: [dreamsignObject()],
      valueEssence: 90,
      choiceRequest: {
        choiceType: "dreamsign",
        prompt: "Choose one sign to carry.",
        candidates: [
          {
            choiceId: "choice-ledger",
            title: "Ledger of Mists",
            summary: "Draw from essence gains.",
            needId: "need-dreamsign",
            builderId: "grant_dreamsign",
            gameObjects: [dreamsignObject()],
            valueEssence: 90,
            applyPayload: {
              kind: "add_dreamsign",
              dreamsignId: "sign-ledger",
              dreamsignTemplate: {
                id: "sign-ledger",
                name: "Ledger of Mists",
                effectDescription: "When you gain essence, draw a card.",
              },
            },
            dreamsignId: "sign-ledger",
          },
          {
            choiceId: "choice-margin",
            title: "Silver Margin",
            summary: "Add a card.",
            needId: "need-dreamsign",
            builderId: "grant_support_card",
            gameObjects: [catalogObject(candidateCard)],
            valueEssence: 70,
            applyPayload: {
              kind: "add_catalog_card",
              cardUuid: candidateCard.id,
              cardNumber: candidateCard.cardNumber,
            },
            cardUuid: candidateCard.id,
            cardNumber: candidateCard.cardNumber,
          },
        ],
      },
    },
    rewards: [],
    ...overrides,
  };
  return {
    ...offer,
    rewards: [offer.reward],
  };
}

function encounter(overrides: Partial<MerchantEncounter> = {}): MerchantEncounter {
  const first = directOffer();
  const second = chooserOffer();
  return {
    encounterSignature: "encounter-fixture",
    siteId: "site-merchant",
    offers: [
      { ...first, rewards: [first.reward] },
      second,
    ],
    dialogue: [
      {
        id: "dialogue-greeting",
        templateId: "greeting-1",
        kind: "greeting",
        phase: "pre_offer",
        text: "The Dream Merchant opens a quiet ledger.",
      },
      {
        id: "dialogue-observation",
        templateId: "observation-1",
        kind: "observation",
        phase: "pre_offer",
        text: "Your deck leans on Lantern Broker more than it admits.",
      },
      {
        id: "dialogue-accept",
        templateId: "accept-1",
        kind: "accept_reaction",
        phase: "accept_reaction",
        text: "A fine purchase. The ledger warms.",
      },
      {
        id: "dialogue-decline",
        templateId: "decline-1",
        kind: "decline_reaction",
        phase: "decline_reaction",
        text: "No sale, then. I close the ledger.",
      },
    ],
    ...overrides,
  };
}

function renderScreen({
  merchantEncounter = encounter(),
  onAcceptOffer = vi.fn(),
  onDecline = vi.fn(),
}: {
  merchantEncounter?: MerchantEncounter;
  onAcceptOffer?: (request: MerchantAcceptRequest) => void;
  onDecline?: (request: MerchantDeclineRequest) => void;
} = {}) {
  const container = mount(
    <DreamMerchantScreen
      site={{
        id: "site-merchant",
        type: "DreamJourney",
        isEnhanced: false,
        isVisited: false,
      }}
      encounter={merchantEncounter}
      onAcceptOffer={onAcceptOffer}
      onDecline={onDecline}
    />,
  );
  return { container };
}

describe("DreamMerchantScreen", () => {
  it("renders a large merchant image slot and both offers in review state", () => {
    const { container } = renderScreen();

    expect(byTestId(container, "dream-merchant-image-slot")).not.toBeNull();
    expect(byTestId(container, "merchant-offer-card-A").textContent).toContain(
      "Trade the weak stitch",
    );
    expect(byTestId(container, "merchant-offer-card-B").textContent).toContain(
      "Choose a sign",
    );
    expect(byTestId(container, "merchant-offer-action-A").textContent).toBe(
      "Take",
    );
    expect(byTestId(container, "merchant-offer-choose-B").textContent).toBe(
      "Choose",
    );
  });

  it("renders pre-action dialogue and excludes reaction beats before action", () => {
    const { container } = renderScreen();
    const dialogue = byTestId(container, "merchant-dialogue").textContent ?? "";

    expect(dialogue).toContain("quiet ledger");
    expect(dialogue).toContain("Lantern Broker");
    expect(dialogue).not.toContain("fine purchase");
    expect(dialogue).not.toContain("No sale");
  });

  it("renders card names, badges, Dreamsign effect text, and essence amounts", () => {
    const { container } = renderScreen();
    const text = container.textContent ?? "";

    expect(text).toContain("Lantern Broker");
    expect(text).toContain("Green Contract");
    expect(text).toContain("Remove");
    expect(text).toContain("Gain");
    expect(text).toContain("Ledger of Mists");
    expect(text).toContain("When you gain essence, draw a card.");
    expect(text).toContain("+20");
  });

  it("calls onAcceptOffer with complete fields for the direct Take path", () => {
    const onAcceptOffer = vi.fn();
    const { container } = renderScreen({ onAcceptOffer });

    click(byTestId(container, "merchant-offer-action-A"));

    expect(onAcceptOffer).toHaveBeenCalledWith({
      encounterSignature: "encounter-fixture",
      offerId: "A",
      expectedPrice: 55,
      rewardBuilderId: "replace_weak_with_fit",
      needId: "need-weak-card",
    });
  });

  it("opens chooser choices, preserves price, confirms selection, and accepts choice id", () => {
    const onAcceptOffer = vi.fn();
    const { container } = renderScreen({ onAcceptOffer });

    click(byTestId(container, "merchant-offer-choose-B"));

    expect(byTestId(container, "merchant-chooser-panel").textContent).toContain(
      "Choose one sign",
    );
    expect(
      byTestId(container, "merchant-chooser-price-context").textContent,
    ).toContain("75 essence");
    expect(
      (byTestId(container, "merchant-offer-action-B") as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    click(byTestId(container, "merchant-choice-choice-ledger"));

    expect(byTestId(container, "merchant-offer-selection-B").textContent).toContain(
      "Selection ready",
    );
    const confirm = byTestId(
      container,
      "merchant-offer-action-B",
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    click(confirm);

    expect(onAcceptOffer).toHaveBeenCalledWith({
      encounterSignature: "encounter-fixture",
      offerId: "B",
      expectedPrice: 75,
      rewardBuilderId: "grant_dreamsign",
      needId: "need-dreamsign",
      choice: { choiceId: "choice-ledger" },
    });
  });

  it("shows locked offers and prevents acceptance", () => {
    const onAcceptOffer = vi.fn();
    const locked = directOffer({ locked: true, price: 320 });
    const { container } = renderScreen({
      merchantEncounter: encounter({
        offers: [{ ...locked, rewards: [locked.reward] }, chooserOffer()],
      }),
      onAcceptOffer,
    });

    expect(byTestId(container, "merchant-offer-locked-A").textContent).toContain(
      "Locked",
    );
    const button = byTestId(
      container,
      "merchant-offer-action-A",
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    click(button);
    expect(onAcceptOffer).not.toHaveBeenCalled();
  });

  it("walks away with the encounter signature and first offer metadata", () => {
    const onDecline = vi.fn();
    const { container } = renderScreen({ onDecline });

    click(byTestId(container, "merchant-walk-away"));

    expect(onDecline).toHaveBeenCalledWith({
      encounterSignature: "encounter-fixture",
      offerId: "A",
      needId: "need-weak-card",
      rewardBuilderId: "replace_weak_with_fit",
    });
  });
});
