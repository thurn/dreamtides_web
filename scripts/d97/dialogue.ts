// The D97 dialogue validator (decision P17): `npm run d97:dialogue -- validate`
// checks every registered dialogue module, quest and item against the
// registered maps' anchors, prints each finding, and exits 1 on any. The
// rules are in src/d97/dialogue/validate.ts.

import { D97_DREAM_MAPS } from "../../src/content/d97/maps/index.ts";
import { REGISTERED_DIALOGUE_CONTENT } from "../../src/d97/dialogue/catalog.ts";
import { validateDialogueContent, type D97DialogueFinding } from "../../src/d97/dialogue/validate.ts";
import type { DreamAnchorKind } from "../../src/d97/map/definition.ts";
import { DEV_MAP_DEFINITION } from "../../src/d97/overworld/dev-map.ts";
import type { DreamAnchorId } from "../../src/types/identifiers.ts";

const USAGE = "Usage: npm run d97:dialogue -- validate";

function formatFinding(finding: D97DialogueFinding): string {
  return `error ${finding.rule}: ${finding.subject.kind} ${finding.subject.id}: ${finding.ref}`;
}

function validate(): number {
  const anchors = new Map<DreamAnchorId, DreamAnchorKind>();
  for (const map of [...D97_DREAM_MAPS, DEV_MAP_DEFINITION]) {
    for (const anchor of map.anchors) anchors.set(anchor.id, anchor.kind);
  }
  const findings = validateDialogueContent({ contents: REGISTERED_DIALOGUE_CONTENT, anchors });
  const dialogues = REGISTERED_DIALOGUE_CONTENT.reduce((total, content) => total + content.dialogues.length, 0);
  const quests = REGISTERED_DIALOGUE_CONTENT.reduce((total, content) => total + content.quests.length, 0);
  for (const finding of findings) console.log(formatFinding(finding));
  console.log(
    `${String(dialogues)} dialogue modules, ${String(quests)} quests: ${String(findings.length)} findings`,
  );
  return findings.length === 0 ? 0 : 1;
}

const [command, ...rest] = process.argv.slice(2);
if (command !== "validate" || rest.length > 0) {
  console.error(USAGE);
  process.exit(2);
}
process.exit(validate());
