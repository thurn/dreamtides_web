// The D97 dialogue validator (decision P17): `npm run d97:dialogue -- validate`
// checks every dialogue module, quest and item (the catalog's and the
// development fixtures') against the maps' anchors, and every dream module
// (the catalog dreams and the development dream): its topology and rooms
// against its maps' anchors (its rooms' included), and its residents against
// those anchors and the character and dialogue catalogs; it prints each
// finding, and exits 1 on any. The rules are in src/d97/dialogue/validate.ts
// and src/d97/overworld/dream-occupants.ts.

import { D97_CHARACTER_SPRITES } from "../../src/content/d97/characters/index.ts";
import { D97_DIALOGUE_CONTENT } from "../../src/content/d97/dialogue/index.ts";
import { D97_DREAMS } from "../../src/content/d97/dreams/index.ts";
import { D97_DREAM_MAPS } from "../../src/content/d97/maps/index.ts";
import { D97_DEVELOPMENT_CONTENT } from "../../src/d97/development-content.ts";
import { validateDialogueContent, type D97DialogueFinding } from "../../src/d97/dialogue/validate.ts";
import type { DreamAnchorKind } from "../../src/d97/map/definition.ts";
import { validateDreamResidents, validateDreamTopology, type D97DreamFinding } from "../../src/d97/overworld/dream-occupants.ts";
import { dreamMapAnchors } from "../../src/rules/d97/d97-dreams.ts";
import type { DreamAnchorId } from "../../src/types/identifiers.ts";

const USAGE = "Usage: npm run d97:dialogue -- validate";

const DREAMS = [...D97_DREAMS, D97_DEVELOPMENT_CONTENT.dream];
const MAPS = [...D97_DREAM_MAPS, D97_DEVELOPMENT_CONTENT.map];
const DIALOGUE_CONTENT = [D97_DIALOGUE_CONTENT, D97_DEVELOPMENT_CONTENT.dialogue];
const CHARACTER_SPRITES = [...D97_CHARACTER_SPRITES, ...D97_DEVELOPMENT_CONTENT.characterSprites];

function formatFinding(finding: D97DialogueFinding): string {
  return `error ${finding.rule}: ${finding.subject.kind} ${finding.subject.id}: ${finding.ref}`;
}

function formatDreamFinding(finding: D97DreamFinding): string {
  return `error ${finding.rule}: dream ${finding.dreamId}: anchor ${finding.anchorId}`;
}

/** Each dream module's topology and resident findings, formatted; a dream whose map is unregistered is one. */
function dreamFindings(): string[] {
  const characterIds = new Set(CHARACTER_SPRITES.map((recipe) => recipe.id));
  const dialogues = new Map(DIALOGUE_CONTENT.flatMap((content) => content.dialogues.map((module) => [module.id, module] as const)));
  return DREAMS.flatMap((dream) => {
    const missing = [dream.mapId, ...dream.rooms.map((room) => room.mapId)].filter((mapId) => !MAPS.some((map) => map.id === mapId));
    if (missing.length > 0) return missing.map((mapId) => `error unknown-map: dream ${dream.id}: map ${mapId}`);
    const anchors = dreamMapAnchors(dream, (mapId) => MAPS.find((map) => map.id === mapId)?.anchors);
    return [
      ...validateDreamTopology(dream, anchors),
      ...validateDreamResidents(dream, { anchors, characterIds, dialogues }),
    ].map(formatDreamFinding);
  });
}

function validate(): number {
  const anchors = new Map<DreamAnchorId, DreamAnchorKind>();
  for (const map of MAPS) {
    for (const anchor of map.anchors) anchors.set(anchor.id, anchor.kind);
  }
  const findings = validateDialogueContent({ contents: DIALOGUE_CONTENT, anchors });
  const dreams = dreamFindings();
  for (const finding of dreams) console.log(finding);
  const dialogues = DIALOGUE_CONTENT.reduce((total, content) => total + content.dialogues.length, 0);
  const quests = DIALOGUE_CONTENT.reduce((total, content) => total + content.quests.length, 0);
  for (const finding of findings) console.log(formatFinding(finding));
  console.log(
    `${String(dialogues)} dialogue modules, ${String(quests)} quests: ${String(findings.length)} findings`,
  );
  console.log(`${String(DREAMS.length)} dream modules: ${String(dreams.length)} dream findings`);
  return findings.length === 0 && dreams.length === 0 ? 0 : 1;
}

const [command, ...rest] = process.argv.slice(2);
if (command !== "validate" || rest.length > 0) {
  console.error(USAGE);
  process.exit(2);
}
process.exit(validate());
