import { beforeEach, describe, expect, it } from "vitest";
import { getLogEntries, resetLog } from "../../../logging";
import { glossaryInfoCard } from "./glossary-info-card";
import { testGlossaryEntryId } from "../../../types/test-identities";

const MISSING_GLOSSARY_ID = testGlossaryEntryId("missing-glossary-entry");

describe("glossaryInfoCard", () => {
  beforeEach(() => {
    resetLog();
  });

  it("keeps rendering when the requested glossary entry is unavailable", () => {
    const card = glossaryInfoCard(MISSING_GLOSSARY_ID);

    expect(card.variant).toBe("text");
    expect("titleMessage" in card && card.titleMessage).toBeDefined();
    expect("bodyMessage" in card && card.bodyMessage).toBeDefined();
    expect(getLogEntries()).toContainEqual(
      expect.objectContaining({
        event: "glossary_entry_missing",
        glossaryId: MISSING_GLOSSARY_ID,
      }),
    );
  });

  it("logs each unavailable glossary entry only once", () => {
    glossaryInfoCard(MISSING_GLOSSARY_ID);
    glossaryInfoCard(MISSING_GLOSSARY_ID);

    expect(
      getLogEntries().filter(
        (entry) => entry.event === "glossary_entry_missing",
      ),
    ).toHaveLength(1);
  });
});
