// Print the merged archetype lists (the set of lists the merged-archetype-lists
// pool algorithm draws from) so they can be inspected. Reuses buildMergedLists
// from the experiment script, so what is printed is exactly what the algorithm
// would use — no logic is duplicated.
//
// Run:   node scripts/dump-merged-lists.mjs [threshold]
//   threshold  a card joins a list when it recurs in at least this many real
//              decks of that archetype (default 2; pass e.g. 3 for tighter lists).
//
// Pipe it to a pager or a file to browse:
//   node scripts/dump-merged-lists.mjs | less
//   node scripts/dump-merged-lists.mjs > /tmp/merged-lists.txt

import { buildMergedLists } from "./merged-archetype-pool-experiment.mjs";

const threshold = Number.parseInt(process.argv[2] ?? "2", 10);
const lists = buildMergedLists(threshold);
const sorted = [...lists.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const sizes = sorted.map(([, set]) => set.size);

console.log(`# merged archetype lists`);
console.log(`#   threshold = ${threshold} (card must recur in >= ${threshold} real decks of the archetype)`);
console.log(`#   ${lists.size} lists; cards per list min/avg/max = ` +
  `${Math.min(...sizes)} / ${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)} / ${Math.max(...sizes)}`);
console.log("");

for (const [label, set] of sorted) {
  console.log(`## ${label}  (${set.size} cards)`);
  for (const card of [...set].sort()) console.log(`  ${card}`);
  console.log("");
}
