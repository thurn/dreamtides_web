import { useRef } from "react";
import { guideDialogueLines } from "../../data/dreamscapes";
import type { DreamGuideContent } from "../../types/content";

/** Select one authored line for this mount and keep it stable across renders. */
export function useGuideDialogue(
  guide: DreamGuideContent,
  context: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  const selectionRef = useRef<{ key: string; line: string } | null>(null);
  const key = `${guide.id}:${context}:${JSON.stringify(values)}`;
  if (selectionRef.current?.key !== key) {
    const lines = guideDialogueLines(guide, context, values);
    selectionRef.current = {
      key,
      line: lines[Math.floor(Math.random() * lines.length)],
    };
  }
  return selectionRef.current.line;
}
