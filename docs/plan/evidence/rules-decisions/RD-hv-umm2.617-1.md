# RD-hv-umm2.617-1: Additional Draw-phase cards are counted before the ordinary draw

- Ladder: 4, adapted Magic Comprehensive Rules analog for count snapshot and
  ordering. The whole first-Draw skip is settled by the explicit Dreamtides
  rules, so the ladder is not invoked for that skip.
- rules.md: § Turn Structure → Additional Draw-phase cards; Battle start;
  § Keywords and Effects → Fatigue. Decision P5 governs completed-step victory.
- Affects: the entity-free `additionalDrawPhaseCards(player, count)` static
  instruction; `b8590328-ca72-4869-a795-c7f4b6802bed` is authored with its whole
  printed text and complete acceptance in `hv-umm2.257`.
- Why: determine the applicable static count once before any individual draw,
  draw the ordinary card first, then each additional card. Each held copy adds
  its count. Every requested card uses ordinary draw/Fatigue and actual draws
  count toward ordinary draw triggers. Those triggers resolve after the whole
  phase action. A skipped Draw requests no cards; an extra turn receives its
  ordinary Draw. Draws from effects receive only the effect's own count.
- Higher-tier evidence: decisions D/C/P contain no additional Draw-phase count
  or ordering policy. The prototype's catalog entry is pending and the phase
  consumer supplies one ordinary draw. The unchanged Draw sentence in the
  read-only Rust `docs/battle_rules/battle_rules.md` and the
  `phase_mutations/turn.rs` Dreamwell-to-Draw case support the first-turn skip;
  that case supplies no additional-draw count policy. Internal phase markers
  remain compatible with the normative absence of first-Draw card requests.
- Analog: the official [Comprehensive Rules effective September 25, 2026](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt),
  verified from [Wizards' rules page](https://magic.wizards.com/en/rules),
  CR 121.2/121.2a supplies individual draws and counting draw modifications
  before individual draws; CR 504.1 supplies the ordinary draw as the first
  turn-based action; CR 614.10/614.10a supplies skipped scheduled actions.
  Adapting this to the static Draw-phase instruction establishes the snapshot
  and normal-before-additional ordering. Magic does not directly specify this
  Dreamtides instruction or its static-source timing. The explicit Dreamtides
  first-Draw skip and P5 completed-step victory remain binding.
- Source verification: parent receipt `official-rules-verification.json`,
  verified `2026-10-14T13:53:49.558736+00:00`; source/body audit
  `stage1-body-audit.json` at base
  `4571cc9ede8cd71d873b95bb7ff383dfc85192c0`, retained with bead QA audit receipts.
