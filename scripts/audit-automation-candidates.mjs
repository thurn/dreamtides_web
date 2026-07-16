#!/usr/bin/env node
// Audit character rules text while enforcing Support-only automation.
//
// Loads public/cards_v2-data.json (a JSON ARRAY of card objects, each with
// `id` UUID, `name`, `renderedText`, `subtype`, `energyCost`, `cardType`) and
// emits docs/automation-audit.json: a catalog of every card whose renderedText
// contains an automatable trigger clause.
//
// Trigger detection:
//   - Combined "▸Materialized, Dawn:" / "▸Materialized, ▸Dawn:" — a SINGLE
//     clause whose effect fires on BOTH materialize and each dawn. Detected
//     first (before the plain markers below) and recorded as carrying BOTH the
//     `dawn` and `materialized` triggers. Its one shared line is stored under
//     both ruleLines.dawn and ruleLines.materialized so every trigger has a
//     corresponding rule line.
//   - ▸Dawn:          a standalone dawn clause.
//   - ▸Materialized:  a standalone materialized clause (the colon is required).
//   - Support –       (em-dash U+2013) or "Support -" (ascii hyphen)
//
// Only the relevant trigger CLAUSE is parsed for effects. Activated abilities
// ("N●, ☪: ..."), other keywords (▸Dissolved, Reclaim, ▸Challenge), and play
// costs ("To play this card, ...") are resolved manually and never contribute
// effect atoms to a trigger's classification.
//
// Effect atoms map to the downstream builder vocabulary:
//   Deterministic builders -> kinds: gain-energy, gain-points, draw, erode,
//     add-spark (target:self), discard (your whole hand), support-spark.
//   Interactive prompts (scriptable, need a player choice) -> kinds: foresee
//     (the only interactive atom the parser emits; draw/discard atoms are always
//     deterministic).
//   Anything else -> kind:other (not scriptable).
//
// Multi-trigger rule (single-trigger registry constraint):
//   The downstream registry BATTLE_CARD_EFFECTS maps each card UUID to exactly
//   ONE trigger ("dawn" | "materialized" | "support") and its steps. A UUID can
//   therefore automate only one trigger. Any card whose automatable content
//   spans MORE THAN ONE trigger type (`triggers.length > 1` — whether two
//   separate clauses like "▸Materialized: ... ▸Dawn: ..." OR a combined
//   "▸Materialized, Dawn:" line) is classified `manual` (scriptable:false)
//   regardless of how scriptable the individual effects are. Registering such a
//   card would fire both triggers' effects on one trigger, producing wrong game
//   state. Err toward manual: never feed flattened multi-trigger steps
//   downstream.
//
// Automation policy:
//   - Support is the only character mechanic eligible for automation.
//   - Dawn and Materialized effects are cataloged for visibility and classified
//     manual even when their effect text could be expressed by a builder.
//
// Classification rules:
//   - multi-trigger : triggers.length > 1 -> manual, scriptable:false (see
//                     above). Evaluated before the single-trigger rules below.
//   - deterministic : every atom is a deterministic builder. scriptable:true.
//   - interactive   : >=1 atom needs a player choice (interactive:true /
//                     foresee), and the rest are scriptable. scriptable:true.
//   - partial       : part scriptable, part not (e.g. Support "+N✦ and
//                     unstoppable" — automate the spark, leave the rest).
//                     scriptable:true; notes name the manual remainder.
//   - manual        : nothing reliably scriptable (conditional / targeted /
//                     for-each / opponent-directed effects, or any phrasing the
//                     parser does not recognize). scriptable:false.
//   Err toward manual: a missed card is safe; a mis-scripted card is not.
//
// Deterministic and re-runnable: `cards` is sorted by `id` and the output is
// byte-stable. Do NOT hand-edit docs/automation-audit.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const SOURCE = 'public/cards_v2-data.json';
const OUTPUT = join(repoRoot, 'docs', 'automation-audit.json');

const DAWN_MARK = '▸Dawn:';
const MAT_MARK = '▸Materialized:';
const SUPPORT_MARKS = ['Support –', 'Support -'];
// Combined trigger: one clause firing on BOTH materialize and each dawn.
// Two spellings appear in the pool — triangle on Dawn or not.
const COMBINED_MARKS = ['▸Materialized, ▸Dawn:', '▸Materialized, Dawn:'];

// ---------------------------------------------------------------------------
// Clause extraction
// ---------------------------------------------------------------------------

/** Return the trimmed line containing `marker`, or null. */
function findLine(text, marker) {
  for (const raw of text.split(/\n+/)) {
    if (raw.includes(marker)) return raw.trim();
  }
  return null;
}

/** Return the first line containing any of the support markers, or null. */
function findSupportLine(text) {
  for (const raw of text.split(/\n+/)) {
    if (SUPPORT_MARKS.some((m) => raw.includes(m))) return raw.trim();
  }
  return null;
}

/** Strip the leading "▸Dawn:" / "▸Materialized, ▸Dawn:" prefix from a line. */
function dawnBody(line) {
  const idx = line.indexOf(DAWN_MARK);
  return line.slice(idx + DAWN_MARK.length).trim();
}

function materializedBody(line) {
  const idx = line.indexOf(MAT_MARK);
  return line.slice(idx + MAT_MARK.length).trim();
}

/** Return the first combined marker found in `text`, or null. */
function findCombinedMark(text) {
  return COMBINED_MARKS.find((m) => text.includes(m)) ?? null;
}

/** Strip the leading combined "▸Materialized, [▸]Dawn:" prefix from a line. */
function combinedBody(line, mark) {
  const idx = line.indexOf(mark);
  return line.slice(idx + mark.length).trim();
}

function supportBody(line) {
  for (const m of SUPPORT_MARKS) {
    const idx = line.indexOf(m);
    if (idx !== -1) return line.slice(idx + m.length).trim();
  }
  return line;
}

// ---------------------------------------------------------------------------
// Effect parsing for Dawn / Materialized clauses
// ---------------------------------------------------------------------------
//
// A clause body is split into sentences on ". ". Each sentence is matched
// against a deterministic / interactive pattern. If ANY sentence fails to
// match a known pattern, an `other` atom is produced for it (driving the card
// toward `manual`). We deliberately keep patterns tight: a tight miss is safe.

const NUM = '(\\d+)';

/** Parse one sentence of a Dawn/Materialized clause into an atom, or null. */
function parseSentence(sentence) {
  let s = sentence.trim().replace(/\.$/, '').trim();
  if (s === '') return null;
  // A fragment that followed ", then " starts with a lowercase verb; restore
  // its leading capital so the patterns below match uniformly.
  s = s.charAt(0).toUpperCase() + s.slice(1);
  let m;

  // gain-energy: "Gain N●"
  if ((m = s.match(new RegExp(`^Gain ${NUM}●$`)))) {
    return { kind: 'gain-energy', amount: Number(m[1]), target: 'self' };
  }
  // gain-points (self): "Gain N⍟"
  if ((m = s.match(new RegExp(`^Gain ${NUM}⍟$`)))) {
    return { kind: 'gain-points', amount: Number(m[1]), target: 'self' };
  }
  // erode (self): "Erode N"
  if ((m = s.match(new RegExp(`^Erode ${NUM}$`)))) {
    return { kind: 'erode', amount: Number(m[1]), target: 'self' };
  }
  // add-spark to self: "This character gains +N✦"
  if ((m = s.match(new RegExp(`^This character gains \\+${NUM}✦$`)))) {
    return { kind: 'add-spark', amount: Number(m[1]), target: 'self' };
  }
  // draw: "Draw a card" / "Draw N cards"
  if (/^Draw a card$/.test(s)) {
    return { kind: 'draw', amount: 1, target: 'self' };
  }
  if ((m = s.match(new RegExp(`^Draw ${NUM} cards$`)))) {
    return { kind: 'draw', amount: Number(m[1]), target: 'self' };
  }
  // foresee: "Foresee N" (interactive — player reorders/discards)
  if ((m = s.match(new RegExp(`^Foresee ${NUM}$`)))) {
    return { kind: 'foresee', amount: Number(m[1]), interactive: true };
  }
  // discard your whole hand: "Discard your hand" (deterministic)
  if (/^Discard your hand$/.test(s)) {
    return { kind: 'discard', target: 'self' };
  }

  // Unrecognized sentence -> non-scriptable atom.
  return { kind: 'other' };
}

/** Parse a Dawn/Materialized clause body into an array of atoms. */
function parseClause(body) {
  // Split into sentences on a sentence-final period, and also on the
  // sequential connector ", then " (e.g. "Discard your hand, then draw 3
  // cards." is two deterministic builders).
  const parts = body
    .split(/(?<=\.)\s+|,\s+then\s+/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length === 0) return [{ kind: 'other' }];
  return parts.map(parseSentence).filter((a) => a !== null);
}

// ---------------------------------------------------------------------------
// Effect parsing for Support clauses
// ---------------------------------------------------------------------------
//
// Recognized: "Supported <filter> have +N✦" optionally followed by
// " and have unstoppable" (partial — spark scriptable, unstoppable manual).
// "for each ..." variants are conditional/for-each -> manual.

const SUPPORT_SUBTYPES = {
  'spirit animals': 'Spirit Animal',
  warriors: 'Warrior',
  allies: null, // "allies" = all allied characters, no subtype filter
  characters: null,
};

/** Parse a Support clause body into atoms. Returns { atoms, partialNote? }. */
function parseSupport(body) {
  // e.g. "Supported spirit animals have +2✦."
  //      "Supported allies have +2✦ and have unstoppable."
  let m = body.match(
    /^Supported ([a-z ]+?) have \+(\d+)✦( and (?:have )?unstoppable)?\.?$/
  );
  if (m) {
    const filterPhrase = m[1].trim();
    const amount = Number(m[2]);
    const hasUnstoppable = Boolean(m[3]);
    if (Object.prototype.hasOwnProperty.call(SUPPORT_SUBTYPES, filterPhrase)) {
      const subtype = SUPPORT_SUBTYPES[filterPhrase];
      const atom = {
        kind: 'support-spark',
        amount,
        target: 'all-supported',
      };
      if (subtype) atom.subtypeFilter = subtype;
      const atoms = [atom];
      if (hasUnstoppable) {
        return { atoms, partialNote: 'grants unstoppable (not scriptable)' };
      }
      return { atoms };
    }
  }
  // "for each ..." and any other phrasing -> not scriptable.
  return { atoms: [{ kind: 'other' }] };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const DETERMINISTIC_KINDS = new Set([
  'gain-energy',
  'gain-points',
  'erode',
  'add-spark',
  'draw',
  'discard',
  'support-spark',
]);

/**
 * Classify a card from its trigger list, full atom list, plus optional partial
 * note. Returns { classification, scriptable, notes? }.
 */
function classify(triggers, atoms, partialNote) {
  if (triggers.some((trigger) => trigger !== 'support')) {
    return {
      classification: 'manual',
      scriptable: false,
      notes: 'character-triggered effects are resolved manually; only Support is automated',
    };
  }

  // Multi-trigger cards cannot be automated by the single-trigger registry:
  // registering one trigger would also run the other trigger's flattened
  // steps. Mark manual regardless of how scriptable the effects look.
  if (triggers.length > 1) {
    const list = [...triggers].sort().join(' + ');
    return {
      classification: 'manual',
      scriptable: false,
      notes: `multiple triggers (${list}); the single-trigger registry cannot automate both`,
    };
  }

  const hasOther = atoms.some((a) => a.kind === 'other');
  const hasInteractive = atoms.some((a) => a.interactive === true);
  const hasDeterministic = atoms.some((a) => DETERMINISTIC_KINDS.has(a.kind));

  // Partial: a recognized scriptable atom plus a known non-scriptable rider
  // (currently only Support "+N✦ and unstoppable").
  if (partialNote) {
    return {
      classification: 'partial',
      scriptable: true,
      notes: partialNote,
    };
  }

  // Any unrecognized sentence -> manual. Err toward manual.
  if (hasOther) {
    return {
      classification: 'manual',
      scriptable: false,
      notes: 'unrecognized phrasing — needs human review',
    };
  }

  if (atoms.length === 0) {
    return {
      classification: 'manual',
      scriptable: false,
      notes: 'no parseable effect — needs human review',
    };
  }

  if (hasInteractive) {
    // Every non-interactive atom must still be deterministic/scriptable.
    return { classification: 'interactive', scriptable: true };
  }

  if (hasDeterministic) {
    return { classification: 'deterministic', scriptable: true };
  }

  return {
    classification: 'manual',
    scriptable: false,
    notes: 'unrecognized phrasing — needs human review',
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const cards = JSON.parse(readFileSync(join(repoRoot, SOURCE), 'utf8'));
  const entries = [];

  for (const card of cards) {
    const text = card.renderedText;
    if (typeof text !== 'string' || text === '') continue;

    // A combined "▸Materialized, [▸]Dawn:" line carries BOTH triggers via one
    // shared clause. Detect it first so its line is not double-counted by the
    // plain ▸Dawn: / ▸Materialized: markers below.
    const combinedMark = findCombinedMark(text);
    const hasCombined = combinedMark !== null;
    // The combined line contains the substring "▸Dawn:", so guard the plain
    // markers against it; ▸Materialized: (with colon) never matches the
    // combined line, but guard symmetrically for clarity.
    const hasDawn = !hasCombined && text.includes(DAWN_MARK);
    const hasMat = !hasCombined && text.includes(MAT_MARK);
    const supportLine = findSupportLine(text);
    const hasSupport = supportLine !== null;
    if (!hasCombined && !hasDawn && !hasMat && !hasSupport) continue;

    const triggers = [];
    const ruleLines = {};
    let atoms = [];
    let partialNote;

    if (hasCombined) {
      const line = findLine(text, combinedMark);
      // One shared clause fires on both materialize and each dawn; record the
      // line under both triggers and parse its effects once.
      triggers.push('dawn', 'materialized');
      ruleLines.dawn = line;
      ruleLines.materialized = line;
      atoms = atoms.concat(parseClause(combinedBody(line, combinedMark)));
    }
    if (hasDawn) {
      const line = findLine(text, DAWN_MARK);
      triggers.push('dawn');
      ruleLines.dawn = line;
      atoms = atoms.concat(parseClause(dawnBody(line)));
    }
    if (hasMat) {
      const line = findLine(text, MAT_MARK);
      triggers.push('materialized');
      ruleLines.materialized = line;
      atoms = atoms.concat(parseClause(materializedBody(line)));
    }
    if (hasSupport) {
      triggers.push('support');
      ruleLines.support = supportLine;
      const parsed = parseSupport(supportBody(supportLine));
      atoms = atoms.concat(parsed.atoms);
      if (parsed.partialNote) partialNote = parsed.partialNote;
    }

    const { classification, scriptable, notes } = classify(
      triggers,
      atoms,
      partialNote
    );

    const entry = {
      id: card.id,
      name: card.name,
      triggers,
      ruleLines,
      effects: atoms,
      classification,
      scriptable,
    };
    if (notes) entry.notes = notes;
    entries.push(entry);
  }

  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const catalog = {
    generatedFrom: SOURCE,
    cards: entries,
  };

  writeFileSync(OUTPUT, JSON.stringify(catalog, null, 2) + '\n');

  // Summary to stderr so stdout stays clean for piping.
  const counts = {};
  for (const e of entries) {
    counts[e.classification] = (counts[e.classification] || 0) + 1;
  }
  process.stderr.write(
    `Wrote ${entries.length} entries to docs/automation-audit.json\n` +
      Object.entries(counts)
        .sort()
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n') +
      '\n'
  );
}

main();
