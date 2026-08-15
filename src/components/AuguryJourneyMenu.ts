import { assertLocalized } from "@trox/runtime";
import { useMemo } from "react";
import type { AuguryArchetypeId } from "../journey_v2";
import {
  buildAugurySiteModel,
  resolveAuguryGuide,
} from "../screens/cumulus_adapters/augury-view-model";
import { useJourney } from "../state/journey-context";
import type { DreamscapeNode, SiteState } from "../types/journey";
import { GLYPHS } from "../cumulus/primitives/glyph";
import type { JourneyUtilityMenuAction } from "./JourneyUtilityMenuController";
import { guideDialogueLines } from "../data/dreamscapes";
import { auguryArchetype } from "../data/augury-data";

/** Builds the Augury commands contributed to the shared Cumulus menu. */
export function useAuguryJourneyMenuActions(
  site: SiteState | undefined,
  sceneNode: DreamscapeNode | undefined,
): readonly JourneyUtilityMenuAction[] {
  const { state, mutations, journeyContent } = useJourney();
  const result = useMemo(() => {
    if (
      site === undefined ||
      site.type !== "Augury" ||
      sceneNode === undefined
    ) {
      return null;
    }
    const guide = resolveAuguryGuide(journeyContent.guides);
    return buildAugurySiteModel({
      state,
      sceneNode,
      site,
      journeyContent,
      guide,
      guideLine: guideDialogueLines(guide, "site")[0],
    });
  }, [journeyContent, sceneNode, site, state]);

  return useMemo(() => {
    if (
      site === undefined ||
      result?.encounter === null ||
      result?.encounter === undefined
    ) {
      return [];
    }
    const actions: JourneyUtilityMenuAction[] = [];
    const forceCategory = mutations.forceAuguryArchetype;
    if (forceCategory !== undefined) {
      const forcedArchetypeId = result.context?.forcedArchetypeId ?? null;
      const archetypeName = (archetypeId: AuguryArchetypeId) =>
        auguryArchetype(journeyContent.auguryData, archetypeId).name;
      const eligibleArchetypes = [
        ...(result.debug?.eligibleArchetypeIds ?? []),
      ].sort((left, right) =>
        archetypeName(left).localeCompare(archetypeName(right)),
      );
      actions.push({
        id: "forceJourneyCategory",
        kind: "group",
        glyph: GLYPHS.bug,
        label: assertLocalized("Force Category"),
        active: forcedArchetypeId !== null,
        actions: [
          {
            id: "forceJourneyCategory:clear",
            kind: "action" as const,
            glyph: GLYPHS.refresh,
            label: assertLocalized("Random (clear force)"),
            active: forcedArchetypeId === null,
            onCommand: () => forceCategory(site.id, null),
          },
          ...eligibleArchetypes.map((archetypeId) => ({
            id: `forceJourneyCategory:${archetypeId}`,
            kind: "action" as const,
            glyph: GLYPHS.check,
            label: assertLocalized(archetypeName(archetypeId)),
            active: forcedArchetypeId === archetypeId,
            onCommand: () => forceCategory(site.id, archetypeId),
          })),
        ],
      });
    }
    const rerollJourney = mutations.rerollAugury;
    if (rerollJourney !== undefined) {
      actions.push({
        id: "rerollJourney",
        kind: "action",
        glyph: GLYPHS.refresh,
        label: assertLocalized("Reroll Journey"),
        onCommand: () => rerollJourney(site.id),
      });
    }
    return actions;
  }, [journeyContent.auguryData, mutations, result, site]);
}
