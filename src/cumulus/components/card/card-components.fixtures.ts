// Shared fixtures for the card component tests: a card UUID, a live
// glossary keyword, and the accessible description a reveal source names.
import { GLOSSARY, glossaryRulesTextForms } from "../../../data/glossary";
import { testCardId } from "../../../types/test-identities";

export const CARD_ID = testCardId("11111111-1111-4111-8111-111111111111");

// A live glossary keyword the tokenizer recognizes as written, so the rules
// text tests track the data instead of hardcoding a name.
export const KEYWORD = GLOSSARY.find(
  (entry) =>
    /^[A-Za-z]+$/.test(entry.term) &&
    glossaryRulesTextForms(entry).includes(entry.term),
)!;

export function describedText(source: Element | null | undefined): string {
  return (
    document.getElementById(source?.getAttribute("aria-describedby") ?? "")
      ?.textContent ?? ""
  );
}
