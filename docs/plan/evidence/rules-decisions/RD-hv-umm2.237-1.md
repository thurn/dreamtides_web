# RD-hv-umm2.237-1: First occasions belong to the whole current turn

- Ladder: 5, simplest reading consistent with both printed texts. D10 steps
  1–4 were checked as detailed below.
- rules.md: § Ability Types → The first time each turn; When your hand becomes
  empty; When a named ability triggers; Triggering that ability again.
- Affects: ef25fba0-58a0-4b69-be06-3668679fcdc7,
  2d4eb3ee-0931-45ed-8365-69f18096ead5.
- Why: “The first time each turn” identifies the player's first qualifying
  occasion, including one before the watching source was acquired. Every
  eligible copy reacts to that occasion. A source's failure to trigger does
  not change which occasion was first. Each actual turn resets both players'
  histories. Successful named admissions retain the exact referent and limits
  settled by RD-hv-p1ss-1 and RD-hv-vwcb-1; hand-empty sequencing follows
  RD-hv-6yev-1 and RD-hv-sw0d-1.

D/C/P entries and the existing normative rules settle successful admissions,
trigger order, exact repeats and D22 privacy. The global Dawn crossing and
materialization-history rules provide consistent history precedents. They do
not directly specify the acquisition distinction for these two texts.

Read-only prototype rule-body searches found no implementation of either
UUID. The Rust engine's `TriggerEvent` enum has neither hand-empty nor
named-admission events. Its Green Cauldron catalog text is unchanged, but
`docs/battle_rules/battle_rules.md` § Ability Types does not settle first
occasions. Its Charm Pouch text describes banish/materialize Echo and differs
from this UUID's current printed text, so that behavior cannot govern it.

The official [Comprehensive Rules effective September 25, 2026](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt),
linked by the [Wizards rules page](https://magic.wizards.com/en/rules), provide
general analogs: 603.2g requires an actual event, 603.2h addresses an indicated
action limited by its source's controller, and 603.3a–b retain controller and
place observer triggers after their causing batch. These do not directly
settle this global-first acquisition distinction. The simplest printed reading
therefore supplies it, rather than substituting a source-local once-per-turn
allowance.

Public hand sizes make empty occasions public. Named classification follows
the actual historical definition and permitted audiences. An identifiable
observer can establish a named occasion without revealing its hidden cause.
Only provable category facts persist; ambiguous combined observers do not
identify a causing branch. A fair sample may reconstruct wholly unobserved
history as empty under the existing D22 conservative-history convention.
