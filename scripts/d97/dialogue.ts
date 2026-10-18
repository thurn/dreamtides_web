// The D97 dialogue validator (decision P17): `npm run d97:dialogue -- validate`
// checks every dialogue module, quest and item (the catalog's and the
// development fixtures') against the maps' anchors; the dream catalog with
// the catalog validator (src/d97/dreams/validate.ts): each catalog dream's
// maps, brief, tileset, size class, topology, town, rooms, residents,
// personas and quest roles against the map, character, dialogue, quest,
// Avatar and tileset catalogs; and the development dream's topology, rooms
// and residents (src/d97/overworld/dream-occupants.ts). It prints each
// finding, and exits 1 on any.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { AVATARS } from "../../src/content/avatars/index.ts";
import { D97_CHARACTER_SPRITES } from "../../src/content/d97/characters/index.ts";
import { D97_DIALOGUE_CONTENT } from "../../src/content/d97/dialogue/index.ts";
import { D97_DREAMS } from "../../src/content/d97/dreams/index.ts";
import { D97_TILESETS } from "../../src/content/d97/dreams/tilesets.ts";
import { D97_DREAM_SIZE_ANCHORS } from "../../src/content/d97/dreams/tuning.ts";
import { D97_DREAM_MAPS } from "../../src/content/d97/maps/index.ts";
import { D97_DEVELOPMENT_CONTENT } from "../../src/d97/development-content.ts";
import { validateDialogueContent, type D97DialogueFinding } from "../../src/d97/dialogue/validate.ts";
import { validateDreamCatalog, type D97DreamCatalogFinding } from "../../src/d97/dreams/validate.ts";
import type { DreamAnchorKind } from "../../src/d97/map/definition.ts";
import { validateDreamResidents, validateDreamTopology, type D97DreamFinding } from "../../src/d97/overworld/dream-occupants.ts";
import { dreamMapAnchors } from "../../src/rules/d97/d97-dreams.ts";
import { parseAvatarId, parseD97DreamId, type D97DreamId, type DreamAnchorId, type DreamMapId } from "../../src/types/identifiers.ts";
import { REPO_ROOT } from "./map-library.ts";

const USAGE = "Usage: npm run d97:dialogue -- validate";

const MAPS = [...D97_DREAM_MAPS, D97_DEVELOPMENT_CONTENT.map];
const DIALOGUE_CONTENT = [D97_DIALOGUE_CONTENT, D97_DEVELOPMENT_CONTENT.dialogue];
const CHARACTER_SPRITES = [...D97_CHARACTER_SPRITES, ...D97_DEVELOPMENT_CONTENT.characterSprites];

function formatFinding(finding: D97DialogueFinding): string {
  return `error ${finding.rule}: ${finding.subject.kind} ${finding.subject.id}: ${finding.ref}`;
}

function formatDreamFinding(finding: D97DreamFinding): string {
  return `error ${finding.rule}: dream ${finding.dreamId}: anchor ${finding.anchorId}`;
}

function formatCatalogFinding(finding: D97DreamCatalogFinding): string {
  return `error ${finding.code}: ${finding.dreamId === null ? "catalog" : `dream ${finding.dreamId}`}: ${finding.ref}`;
}

const mapAnchors = (mapId: DreamMapId) => MAPS.find((map) => map.id === mapId)?.anchors;

/** The dreams whose brief, `<dream-uuid>.md`, sits beside their module. */
function briefDreamIds(): Set<D97DreamId> {
  const directory = join(REPO_ROOT, "src", "content", "d97", "dreams");
  return new Set(
    readdirSync(directory).flatMap((file) => {
      const match = /^(.+)\.md$/u.exec(file);
      if (match?.[1] === undefined) return [];
      try {
        return [parseD97DreamId(match[1])];
      } catch {
        return [];
      }
    }),
  );
}

/** The catalog validator's findings and the development dream's, formatted. */
function dreamFindings(): string[] {
  const characterIds = new Set(CHARACTER_SPRITES.map((recipe) => recipe.id));
  const dialogues = new Map(DIALOGUE_CONTENT.flatMap((content) => content.dialogues.map((module) => [module.id, module] as const)));
  const catalog = validateDreamCatalog({
    dreams: D97_DREAMS,
    mapAnchors,
    characterIds,
    dialogues,
    quests: new Map(D97_DIALOGUE_CONTENT.quests.map((quest) => [quest.id, quest])),
    avatarIds: new Set(AVATARS.map((avatar) => parseAvatarId(avatar.id))),
    tilesetIds: new Set(D97_TILESETS.map((tileset) => tileset.id)),
    briefs: briefDreamIds(),
    sizeAnchors: D97_DREAM_SIZE_ANCHORS,
  }).map(formatCatalogFinding);
  const dream = D97_DEVELOPMENT_CONTENT.dream;
  const anchors = dreamMapAnchors(dream, mapAnchors);
  const development = [
    ...validateDreamTopology(dream, anchors),
    ...validateDreamResidents(dream, { anchors, characterIds, dialogues }),
  ].map(formatDreamFinding);
  return [...catalog, ...development];
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
  console.log(`${String(D97_DREAMS.length)} catalog dreams and the development dream: ${String(dreams.length)} dream findings`);
  return findings.length === 0 && dreams.length === 0 ? 0 : 1;
}

const [command, ...rest] = process.argv.slice(2);
if (command !== "validate" || rest.length > 0) {
  console.error(USAGE);
  process.exit(2);
}
process.exit(validate());
