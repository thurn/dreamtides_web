import { useRef } from "react";
import { LocalizedString } from "@trox/runtime";
import { guideDialogueLines } from "../../data/dreamscapes";
import type { DreamGuideContent } from "../../types/content";

/** Select one authored line for this mount and keep it stable across renders. */
export function useGuideDialogue(
  guide: DreamGuideContent,
  context: string,
  values: Readonly<Record<string, LocalizedString | number>> = {},
): LocalizedString {
  const selectionRef = useRef<{
    key: string;
    line: LocalizedString;
  } | null>(null);
  const keyValues = Object.entries(values).map(([name, value]) => [
    name,
    value instanceof LocalizedString ? value.entryId : value,
  ]);
  const key = `${guide.id}:${context}:${JSON.stringify(keyValues)}`;
  if (selectionRef.current?.key !== key) {
    const lines = guideDialogueLines(guide, context, values);
    selectionRef.current = {
      key,
      line: lines[Math.floor(Math.random() * lines.length)],
    };
  }
  return selectionRef.current.line;
}
