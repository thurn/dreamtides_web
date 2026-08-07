#!/usr/bin/env node
// Dumps every card in data/cards.toml as a readable plain-text list
// for archetype-pool analysis. Output: name, type/subtype, cost, spark, tags,
// and full rules text for each card. Usage: node scripts/dump-cards-v2.mjs
import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('../data/cards.toml', import.meta.url), 'utf8');

// Lightweight TOML parse limited to the [[cards]] array-of-tables shape used by
// cards.toml. Handles basic strings, triple-quoted strings, numbers, bools,
// and inline arrays for the fields we render.
const blocks = raw.split(/\[\[cards\]\]\n/).slice(1);
const lines = [];
let n = 0;
for (const block of blocks) {
  const get = (key) => {
    // triple-quoted (""" or ''')
    const tq = block.match(new RegExp(`^${key} = (?:"""|''')([\\s\\S]*?)(?:"""|''')`, 'm'));
    if (tq) return tq[1].replace(/^\n/, '').trim();
    const sq = block.match(new RegExp(`^${key} = "([^"]*)"`, 'm'));
    if (sq) return sq[1];
    const sqs = block.match(new RegExp(`^${key} = '([^']*)'`, 'm'));
    if (sqs) return sqs[1];
    const num = block.match(new RegExp(`^${key} = (\\d+)`, 'm'));
    if (num) return num[1];
    return '';
  };
  const name = get('name');
  if (!name) continue;
  n += 1;
  const type = get('card-type');
  const subtype = get('subtype');
  const cost = get('energy-cost');
  const spark = get('spark');
  const tagsMatch = block.match(/^tags = (\[[^\]]*\])/m);
  const tags = tagsMatch ? tagsMatch[1] : '[]';
  const text = get('rendered-text').replace(/\n/g, ' / ');
  const typeStr = subtype ? `${type} - ${subtype}` : type;
  const sparkStr = spark === '' ? '' : ` spark=${spark}`;
  lines.push(`#${n} ${name} [${typeStr}] cost=${cost}${sparkStr} tags=${tags}`);
  lines.push(`    ${text}`);
}
console.log(`# CardsV2 Pool Dump — ${n} cards\n`);
console.log(lines.join('\n'));
