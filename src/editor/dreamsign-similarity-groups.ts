// TEMPORARY: semantic-similarity grouping for the dreamsign editor.
//
// This maps dreamsign UUIDs into hand-curated "these do nearly the same thing"
// clusters so the editor can sort them adjacently and show a numeric group
// badge. It is a review aid for de-duplicating overlapping effects, not part of
// the shipping game data. Delete this file (and the "similarityGroup" sort
// option that references it) once the dreamsign de-duplication pass is done.
//
// Groups are ordered roughly by how redundant the cluster is: group 1 is the
// strongest near-duplicate, higher numbers are looser design-space overlaps.

export interface DreamsignSimilarityGroup {
  group: number;
  label: string;
}

const GROUP_LABELS: Record<number, string> = {
  1: "Reclaim cost reduction",
  2: "Essence on enemy kill",
  3: "Draw when an ally is dissolved",
  4: "Draft choices show +1 card",
  5: "Recur a lower-cost character from void on ally death",
  6: "Abandon → 0✦ copy back",
  7: "Abandon → random ally gains ✦",
  8: "Challenger ✦ anthem",
  9: "Random transfiguration on card acquisition",
  10: "First character each turn costs 2● less",
  11: "Score ⍟ → draw a card",
  12: "Pick a character type on gain",
};

// UUID -> group number. UUIDs are upper-cased on lookup so casing in the TOML
// never matters.
const GROUP_BY_ID: Record<string, number> = {
  // 1: Reclaim cost reduction
  "8778BF17-4E0A-4CE7-B23C-4DAF49A782A7": 1, // Wolf Sigil
  "2059AA74-8897-4C76-833F-DDEF7D34346C": 1, // Skull Codex
  // 2: Essence on enemy kill
  "427C71E3-178F-4352-8D6F-F0789CB13C2D": 2, // Carved Stick
  "EB55B141-82F8-4BA4-B319-420F762E9EE4": 2, // Strange Fruit
  // 3: Draw when an ally is dissolved
  "FDFBD522-C2BE-4B77-A63F-E9A64CA3DE3B": 3, // Parchment
  "6B5C0F18-198C-44E7-92E8-D639298B8CF6": 3, // Charm Staff
  // 4: Draft choices show +1 card
  "2DCF92BF-93B3-400C-AB97-69D3098F8868": 4, // Wing
  "E377C3ED-16F5-4424-A9F1-73F9750ACE9F": 4, // Tortoise Shell
  "1C505034-E405-495D-8418-6E3C06D974F0": 4, // Sea Urchin
  // 5: Recur a lower-cost character from void on ally death
  "293A610D-EA75-4974-88DA-13E4C86F248F": 5, // Mandrake Root
  "4A9F95D5-B72D-4EE8-8D29-B05646EDC23D": 5, // Herb Mortar
  // 6: Abandon → 0✦ copy back
  "2EBF0BBB-440C-4DBA-8E48-228DAADC0A1E": 6, // Glow Pouch
  "B765F6BB-0B8A-4847-ADA4-477B9493E3AD": 6, // Flower Petals
  // 7: Abandon → random ally gains ✦
  "ADC23870-55F8-4F23-B973-A358FC257414": 7, // Gold Feather
  "73EFD845-6009-4686-860C-01C7F5B1C074": 7, // Black Feather
  // 8: Challenger ✦ anthem
  "989B55BD-139F-40DC-B1FD-EB2F7B1C091A": 8, // Charm Bracelet
  "15FD5A22-A786-48E3-99B0-919E810B3EBA": 8, // Oak Leaf
  "08A3983A-1B95-4D2E-A445-9D8DC2B8FCA7": 8, // Crystal Orb
  "EB6A5C19-26A6-41EF-AC7A-CE1152557B5C": 8, // Egg Nest
  // 9: Random transfiguration on card acquisition
  "8B69DE8A-835D-4F0C-AC25-DC0E700E2983": 9, // White Rat
  "C2AF5460-E61F-409B-9B86-6AC7DB34D748": 9, // Blue Crystal
  "10BD78DE-87EC-44E4-9B16-E755DA2A9717": 9, // Rainbow Mushroom
  "CD4BB1F4-66BB-45EA-ABFE-CE0C66E4EC4F": 9, // Bestiary
  // 10: First character each turn costs 2● less
  "3DD05E97-1AF8-4AE9-8E1F-954EAA63E112": 10, // Worm Apple
  "9204FBC8-BA40-4E33-9FBC-F62CCC4A43D1": 10, // Powder Bowl
  // 11: Score ⍟ → draw a card
  "4BB408A8-7941-42DC-9FF6-DBC1400C99ED": 11, // Red Pin
  "055F211D-AA51-49EB-9162-190A946B1614": 11, // Root Staff
  // 12: Pick a character type on gain
  "3D86F8CE-42AC-43DC-96D5-121E6D1A6167": 12, // Theater Mask
  "8E2D26A8-FF39-48A4-A30E-434479C4675F": 12, // Toad
};

/** Dreamsigns with no curated similarity group sort after all grouped ones. */
export const UNGROUPED_SORT_VALUE = Number.MAX_SAFE_INTEGER;

/**
 * Returns the curated similarity group for a dreamsign id, or null when the
 * dreamsign is not part of any flagged cluster.
 */
export function similarityGroupFor(id: string): DreamsignSimilarityGroup | null {
  const group = GROUP_BY_ID[id.toUpperCase()];
  if (group === undefined) {
    return null;
  }
  return { group, label: GROUP_LABELS[group] ?? `Group ${group}` };
}

/** Sort key: group number for grouped dreamsigns, sentinel for the rest. */
export function similaritySortValue(id: string): number {
  return GROUP_BY_ID[id.toUpperCase()] ?? UNGROUPED_SORT_VALUE;
}
