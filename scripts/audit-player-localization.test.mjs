// @vitest-environment node

import { describe, expect, it } from "vitest";
import { auditPlayerLocalization, classify } from "./audit-player-localization.mjs";

describe("player localization audit", () => {
  it("classifies authored, diagnostic, and excluded sources without a baseline", () => {
    expect(classify("src/data/example.ts", "label: \"authored\"")).toBe("authored-data-source");
    expect(classify("src/runtime/example.ts", "throw new Error(\"diagnostic\")")).toBe("machine-or-diagnostic-value");
    expect(classify("src/editor/example.tsx", "label=\"Developer\"")).toBe("excluded-developer-surface");
    expect(classify("src/battle/ai/example.ts", "label: \"AI\"")).toBe("excluded-developer-surface");
    expect(classify("src/cumulus/screens/TutorialEditorRail.tsx", "label: \"Edit\"")).toBe("excluded-developer-surface");
    expect(classify("src/battle/integration/example.ts", "subtitle: \"Projection\"")).toBe("machine-or-diagnostic-value");
  });

  it("does not audit files owned by the player localization boundary", () => {
    expect(auditPlayerLocalization(["src/cumulus/screens/MainMenuScreen.tsx"])).toEqual([]);
  });
});
