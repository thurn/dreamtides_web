// Shared fixtures for the reveal coordinator tests: a reveal source over
// semantic UUIDs, a GameCard spec, and the pointer, focus, and log helpers.
import { act, type ReactElement } from "react";
import { getLogEntries } from "../../../logging";
import { renderInCumulus, type CumulusRender } from "../../testing/render";
import { useRevealSource } from "./context";
import { makeTextRevealSpec } from "./test-utils";
import type { RevealSpec } from "./model";
import { parseCardName, type CardSubtype } from "../../../types/card-identity";
import { testCardId, testSemanticEntityId } from "../../../types/test-identities";
import type { SemanticEntityId } from "../../../types/identifiers";

export const UUID_A = testSemanticEntityId("00000000-0000-4000-8000-000000000001");
export const UUID_B = testSemanticEntityId("00000000-0000-4000-8000-000000000002");

interface SourceProps {
  id: SemanticEntityId;
  label?: string;
  onActivate?: () => void;
  spec?: RevealSpec;
  feedback?: "scale" | "stationary";
}

export function Source({ id, label = "Source", onActivate, spec, feedback }: SourceProps) {
  const binding = useRevealSource({
    identity: { entityType: "test", entityId: id },
    spec: spec ?? makeTextRevealSpec(label, "Primary body", ["Secondary body"]),
    feedback,
    onActivate,
  });
  return <button ref={binding.ref} {...binding.sourceProps}>{label}</button>;
}

export function gameCardSpec(subtype: CardSubtype = ""): RevealSpec {
  const cardId = testCardId(UUID_A);
  return {
    primary: {
      kind: "gameCard",
      cardId,
      displaySnapshot: {
        id: cardId,
        name: parseCardName("Fixture Card"),
        cardNumber: 7,
        cardType: "Event",
        subtype,
        isStarter: false,
        rarity: "Special",
        energyCost: 1,
        spark: null,
        isFast: false,
        renderedText: "Fixture text.",
        imageNumber: 7,
        artOwned: false,
      },
    },
    secondaries: [],
  };
}

interface Mounted extends CumulusRender {
  readonly buttons: HTMLButtonElement[];
}

export function mount(element: ReactElement): Mounted {
  const rendered = renderInCumulus(element);
  return { ...rendered, buttons: [...rendered.container.querySelectorAll("button")] };
}

export function setRect(element: HTMLElement, x: number, y: number, width: number, height: number): void {
  element.getBoundingClientRect = () => DOMRect.fromRect({ x, y, width, height });
}

export function fire(target: EventTarget, event: Event): void {
  act(() => void target.dispatchEvent(event));
}

export function pointer(target: EventTarget, type: string, init: PointerEventInit = {}): void {
  fire(target, new PointerEvent(type, { bubbles: true, pointerType: "mouse", ...init }));
}

export function focus(target: HTMLElement, type: "focusin" | "focusout" = "focusin"): void {
  fire(target, new FocusEvent(type, { bubbles: true }));
}

export function logged(kind: "opened" | "closed") {
  return getLogEntries().filter((entry) => entry.event === `cumulus_entity_reveal_${kind}`);
}

export const portal = () => document.querySelector("[data-cumulus-reveal-portal]");
export const isActive = (button: HTMLElement) => button.dataset.revealActive === "true";
