import type { RevealSpec } from "./model";

export function makeTextRevealSpec(title: string, body: string, secondaries: readonly string[] = []): RevealSpec {
  return {
    primary: { kind: "infoCard", card: { variant: "text", title, body: { kind: "plain", text: body } } },
    secondaries: secondaries.map((text, index) => ({ variant: "text", title: `Secondary ${String(index + 1)}`, body: { kind: "plain" as const, text } })),
  };
}
