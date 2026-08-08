import { beforeEach, describe, expect, it } from "vitest";
import { getLogEntries, resetLog } from "../../../logging";
import { glossaryInfoCard } from "./glossary-info-card";

describe("glossaryInfoCard", () => {
  beforeEach(() => {
    resetLog();
  });

  it("keeps rendering when the requested glossary entry is unavailable", () => {
    const card = glossaryInfoCard("missing-glossary-entry");

    expect(card.variant).toBe("text");
    expect(card.titleDescriptor).toEqual({
      id: "glossary-definition-unavailable-title",
    });
    expect(card.bodyDescriptor).toEqual({
      id: "glossary-definition-unavailable-body",
    });
    expect(getLogEntries()).toContainEqual(
      expect.objectContaining({
        event: "glossary_entry_missing",
        glossaryId: "missing-glossary-entry",
      }),
    );
  });

  it("logs each unavailable glossary entry only once", () => {
    glossaryInfoCard("missing-glossary-entry");
    glossaryInfoCard("missing-glossary-entry");

    expect(
      getLogEntries().filter((entry) => entry.event === "glossary_entry_missing"),
    ).toHaveLength(1);
  });
});
