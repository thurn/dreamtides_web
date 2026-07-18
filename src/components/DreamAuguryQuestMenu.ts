import { useMemo } from "react";
import {
  MERCHANT_ARCHETYPE_LABELS,
  type MerchantArchetypeId,
} from "../journey_v2";
import {
  buildDreamAugurySiteModel,
  resolveDreamAuguryGuide,
} from "../screens/cumulus_adapters/dream-augury-view-model";
import { useQuest } from "../state/quest-context";
import type { DreamscapeNode, SiteState } from "../types/quest";
import { GLYPHS } from "../cumulus/primitives/glyph";
import type { QuestUtilityMenuAction } from "./QuestUtilityMenuController";

/** Builds the Dream Augury commands contributed to the shared Cumulus menu. */
export function useDreamAuguryQuestMenuActions(
  site: SiteState | undefined,
  sceneNode: DreamscapeNode | undefined,
): readonly QuestUtilityMenuAction[] {
  const { state, mutations, questContent } = useQuest();
  const result = useMemo(() => {
    if (
      site === undefined ||
      site.type !== "DreamAugury" ||
      sceneNode === undefined
    ) {
      return null;
    }
    return buildDreamAugurySiteModel({
      state,
      sceneNode,
      site,
      questContent,
      guide: resolveDreamAuguryGuide(questContent.guides),
      guideLine: null,
    });
  }, [questContent, sceneNode, site, state]);

  return useMemo(() => {
    if (
      site === undefined ||
      result?.encounter === null ||
      result?.encounter === undefined
    ) {
      return [];
    }
    const actions: QuestUtilityMenuAction[] = [];
    const forceCategory = mutations.forceDreamAuguryArchetype;
    if (forceCategory !== undefined) {
      const forcedArchetypeId = result.context?.forcedArchetypeId ?? null;
      const eligibleArchetypes = [...(result.debug?.eligibleArchetypeIds ?? [])]
        .sort(compareArchetypeLabels);
      actions.push({
        id: "forceJourneyCategory",
        kind: "group",
        glyph: GLYPHS.bug,
        label: "Force Category",
        active: forcedArchetypeId !== null,
        actions: [
          {
            id: "forceJourneyCategory:clear",
            kind: "action" as const,
            glyph: GLYPHS.refresh,
            label: "Random (clear force)",
            active: forcedArchetypeId === null,
            onCommand: () => forceCategory(site.id, null),
          },
          ...eligibleArchetypes.map((archetypeId) => ({
            id: `forceJourneyCategory:${archetypeId}`,
            kind: "action" as const,
            glyph: GLYPHS.check,
            label: MERCHANT_ARCHETYPE_LABELS[archetypeId],
            active: forcedArchetypeId === archetypeId,
            onCommand: () => forceCategory(site.id, archetypeId),
          })),
        ],
      });
    }
    const rerollJourney = mutations.rerollDreamAugury;
    if (rerollJourney !== undefined) {
      actions.push({
        id: "rerollJourney",
        kind: "action",
        glyph: GLYPHS.refresh,
        label: "Reroll Journey",
        onCommand: () => rerollJourney(site.id),
      });
    }
    return actions;
  }, [mutations, result, site]);
}

function compareArchetypeLabels(
  left: MerchantArchetypeId,
  right: MerchantArchetypeId,
): number {
  return MERCHANT_ARCHETYPE_LABELS[left].localeCompare(
    MERCHANT_ARCHETYPE_LABELS[right],
  );
}
