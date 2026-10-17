// The D97 dialogue validator (decision P17): `npm run d97:dialogue -- validate`
// checks every registered dialogue module, quest and item against the
// registered maps' anchors, and every dream module (the catalog dreams and
// the development dream): its topology against its map's anchors, and its
// residents against those anchors and the character and dialogue catalogs; it prints each finding, and exits 1 on
// any. The rules are in src/d97/dialogue/validate.ts and
// src/d97/overworld/dream-occupants.ts.

import { D97_CHARACTER_SPRITES } from "../../src/content/d97/characters/index.ts";
import { D97_DREAM_MODULES } from "../../src/content/d97/dreams/index.ts";
import { D97_DREAM_MAPS } from "../../src/content/d97/maps/index.ts";
import { REGISTERED_DIALOGUE_CONTENT } from "../../src/d97/dialogue/catalog.ts";
import { validateDialogueContent, type D97DialogueFinding } from "../../src/d97/dialogue/validate.ts";
import type { DreamAnchorKind } from "../../src/d97/map/definition.ts";
import { DEV_MAP_DEFINITION } from "../../src/d97/overworld/dev-map.ts";
import { validateDreamResidents, validateDreamTopology, type D97DreamFinding } from "../../src/d97/overworld/dream-occupants.ts";
import type { DreamAnchorId } from "../../src/types/identifiers.ts";

const USAGE = "Usage: npm run d97:dialogue -- validate";

function formatFinding(finding: D97DialogueFinding): string {
  return `error ${finding.rule}: ${finding.subject.kind} ${finding.subject.id}: ${finding.ref}`;
}

function formatDreamFinding(finding: D97DreamFinding): string {
  return `error ${finding.rule}: dream ${finding.dreamId}: anchor ${finding.anchorId}`;
}

/** Each dream module's topology and resident findings, formatted; a dream whose map is unregistered is one. */
function dreamFindings(): string[] {
  const maps = [...D97_DREAM_MAPS, DEV_MAP_DEFINITION];
  const characterIds = new Set(D97_CHARACTER_SPRITES.map((recipe) => recipe.id));
  const dialogueIds = new Set(REGISTERED_DIALOGUE_CONTENT.flatMap((content) => content.dialogues.map((module) => module.id)));
  return D97_DREAM_MODULES.flatMap((dream) => {
    const map = maps.find((candidate) => candidate.id === dream.mapId);
    if (map === undefined) return [`error unknown-map: dream ${dream.id}: map ${dream.mapId}`];
    return [
      ...validateDreamTopology(dream, map.anchors),
      ...validateDreamResidents(dream, { anchors: map.anchors, characterIds, dialogueIds }),
    ].map(formatDreamFinding);
  });
}

function validate(): number {
  const anchors = new Map<DreamAnchorId, DreamAnchorKind>();
  for (const map of [...D97_DREAM_MAPS, DEV_MAP_DEFINITION]) {
    for (const anchor of map.anchors) anchors.set(anchor.id, anchor.kind);
  }
  const findings = validateDialogueContent({ contents: REGISTERED_DIALOGUE_CONTENT, anchors });
  const dreams = dreamFindings();
  for (const finding of dreams) console.log(finding);
  const dialogues = REGISTERED_DIALOGUE_CONTENT.reduce((total, content) => total + content.dialogues.length, 0);
  const quests = REGISTERED_DIALOGUE_CONTENT.reduce((total, content) => total + content.quests.length, 0);
  for (const finding of findings) console.log(formatFinding(finding));
  console.log(
    `${String(dialogues)} dialogue modules, ${String(quests)} quests: ${String(findings.length)} findings`,
  );
  console.log(`${String(D97_DREAM_MODULES.length)} dream modules: ${String(dreams.length)} dream findings`);
  return findings.length === 0 && dreams.length === 0 ? 0 : 1;
}

const [command, ...rest] = process.argv.slice(2);
if (command !== "validate" || rest.length > 0) {
  console.error(USAGE);
  process.exit(2);
}
process.exit(validate());
