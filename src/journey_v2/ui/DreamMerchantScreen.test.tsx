// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import type { QuestState } from "../../types/quest";
import type {
  MerchantAcceptRequest,
  MerchantChoiceCandidate,
  MerchantCommitRequest,
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
    name: `Merchant Card ${String(overrides.cardNumber)}`,
    cardType: "Character",
    renderedText: "Draw a card.",
    ...overrides,
  });
}

const grantCard = card({
  id: "81000000-0000-4000-8000-000000000002",
  cardNumber: 12,
  name: "Green Contract",
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
    hiddenUntilCommit: false,
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
    hiddenUntilCommit: false,
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
      id: `81000000-0000-4000-8000-0000000000${suffix}`,
      cardNumber: Number(suffix),
      name: `Choice ${suffix}`,
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
    hiddenUntilCommit: false,
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
  type: "DreamJourney" as const,
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
    // First click opens the chooser.
    click(byTestId(container, "merchant-offer-action-A"));
    click(byTestId(container, "merchant-choice-choice-22"));
    // Now confirm.
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

// --- Hidden offer (hiddenUntilCommit) tests ---

/** Builds a hiddenUntilCommit offer with 4 candidates whose names must not
 *  appear in the DOM before the player commits. */
function hiddenDraftOffer(): MerchantOffer {
  const secretCard = (suffix: string) => {
    const c = card({
      id: `81000000-0000-4000-8000-0000000000${suffix}`,
      cardNumber: Number(suffix),
      name: `Secret Card ${suffix}`,
    });
    return c;
  };
  const candidate = (suffix: string): MerchantChoiceCandidate => {
    const c = secretCard(suffix);
    return {
      choiceId: `hidden-choice-${suffix}`,
      title: c.name,
      summary: "Premium pick.",
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
    encounterSignature: "sig-hidden",
    archetypeId: "premium_draft",
    family: "grant",
    title: "Four exceptionally strong cards",
    summary: "Draft 1 of 4 premium cards.",
    hiddenUntilCommit: true,
    targetKey: "premium",
    gameObjects: [],
    choiceRequest: {
      choiceType: "catalogCard",
      prompt: "Draft a premium card",
      candidates: [
        candidate("31"),
        candidate("32"),
        candidate("33"),
        candidate("34"),
      ],
    },
  };
}

/** Builds a minimal QuestState with a committed offer id for a given site. */
function questStateWithCommit(siteId: string, committedOfferId: string): QuestState {
  return {
    siteRuntime: {
      [siteId]: {
        kind: "dreamJourney",
        completed: false,
        merchantCommittedOfferId: committedOfferId,
      },
    },
  } as unknown as QuestState;
}

describe("DreamMerchantScreen — hidden offers", () => {
  it("pre-commit: hidden offer shows concealed treatment with NO candidate card names in the DOM", () => {
    // Bug class: leaking the hidden shelf through the DOM before commit.
    const container = mount(
      <DreamMerchantScreen
        site={site}
        encounter={encounter([hiddenDraftOffer(), dreamsignOffer()])}
        onAcceptOffer={() => undefined}
        onDecline={() => undefined}
      />,
    );

    const offerCard = byTestId(container, "merchant-offer-card-A");

    // The hidden body placeholder must be present.
    expect(
      container.querySelector('[data-testid="merchant-offer-hidden-body-A"]'),
    ).not.toBeNull();

    // The commit button must be present (not the accept/choose button).
    expect(
      container.querySelector('[data-testid="merchant-offer-commit-A"]'),
    ).not.toBeNull();

    // The accept/choose action button must NOT be present for the hidden offer.
    expect(
      container.querySelector('[data-testid="merchant-offer-action-A"]'),
    ).toBeNull();

    // INVARIANT: none of the candidate card names appear anywhere in the DOM.
    const domText = offerCard.textContent ?? "";
    expect(domText).not.toContain("Secret Card 31");
    expect(domText).not.toContain("Secret Card 32");
    expect(domText).not.toContain("Secret Card 33");
    expect(domText).not.toContain("Secret Card 34");

    // The offer title IS shown (it's part of the concealed treatment).
    expect(domText).toContain("Four exceptionally strong cards");
  });

  it("pre-commit: commit button fires onCommit callback with correct offer and signature", () => {
    const commits: MerchantCommitRequest[] = [];
    const container = mount(
      <DreamMerchantScreen
        site={site}
        encounter={encounter([hiddenDraftOffer(), dreamsignOffer()])}
        onAcceptOffer={() => undefined}
        onDecline={() => undefined}
        onCommit={(req) => {
          commits.push(req);
          return { ok: true };
        }}
      />,
    );
    click(
      container.querySelector('[data-testid="merchant-offer-commit-A"]') as HTMLElement,
    );
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({
      offerId: "A",
      archetypeId: "premium_draft",
      // encounterSignature comes from the encounter, not the offer fixture.
      encounterSignature: "sig-1",
    });
  });

  it("post-commit: committed offer shows chooser accept control; forfeited offer shows no accept control", () => {
    // Bug class: post-commit state not correctly hiding the forfeited offer's
    // accept control or not revealing the committed offer's chooser.
    const qs = questStateWithCommit(site.id, "A");
    const container = mount(
      <DreamMerchantScreen
        site={site}
        encounter={encounter([hiddenDraftOffer(), dreamsignOffer()])}
        onAcceptOffer={() => undefined}
        onDecline={() => undefined}
        questState={qs}
      />,
    );

    // The committed offer (A) must expose the accept/choose action button.
    expect(
      container.querySelector('[data-testid="merchant-offer-action-A"]'),
    ).not.toBeNull();

    // The committed offer must NOT show the commit button any more.
    expect(
      container.querySelector('[data-testid="merchant-offer-commit-A"]'),
    ).toBeNull();

    // The forfeited offer (B) must have no accept button.
    expect(
      container.querySelector('[data-testid="merchant-offer-action-B"]'),
    ).toBeNull();

    // After commit the walk-away button is hidden.
    expect(
      container.querySelector('[data-testid="merchant-walk-away"]'),
    ).toBeNull();
  });

  it("post-commit: choosing a candidate and confirming sends the choice to onAcceptOffer", () => {
    const requests: MerchantAcceptRequest[] = [];
    const qs = questStateWithCommit(site.id, "A");
    const container = mount(
      <DreamMerchantScreen
        site={site}
        encounter={encounter([hiddenDraftOffer(), dreamsignOffer()])}
        onAcceptOffer={(req) => {
          requests.push(req);
          return { ok: true };
        }}
        onDecline={() => undefined}
        questState={qs}
      />,
    );

    // Open chooser for committed offer.
    click(byTestId(container, "merchant-offer-action-A"));
    // Select a candidate.
    click(byTestId(container, "merchant-choice-hidden-choice-33"));
    // Confirm.
    click(byTestId(container, "merchant-offer-action-A"));

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      offerId: "A",
      archetypeId: "premium_draft",
    });
    expect(requests[0].choice?.choiceId).toBe("hidden-choice-33");
  });
});
