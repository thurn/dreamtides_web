import { assertLocalized } from "@trox/runtime";
import type { RevealSpec } from "./model";

export function makeTextRevealSpec(
  title: string,
  body: string,
  secondaries: readonly string[] = [],
): RevealSpec {
  return {
    primary: {
      kind: "infoCard",
      card: {
        variant: "text",
        title: assertLocalized(title),
        body: { kind: "plain", text: assertLocalized(body) },
      },
    },
    secondaries: secondaries.map((text, index) => ({
      variant: "text",
      title: assertLocalized(`Secondary ${String(index + 1)}`),
      body: { kind: "plain" as const, text: assertLocalized(text) },
    })),
  };
}
