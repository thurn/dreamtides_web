# Existing forced multi-character payment notice

The baseline `a59425584229158adec9828c6424abc51d8b725f` uses
`autoAnsweredChoice` in `src/runtime/battle-prompt-messages.ts:413` to
identify an automatically answered abandon payment as one character. A
forced answer can instead be the only legal combination of two characters.
The current notice therefore describes that multi-character payment as one
character. The copy source is byte-identical to the baseline; proof is
`pre-existing-copy-proof.json`.

The native `run-VlRu13` Offering and selector workflows paid two physical
figments, and their transient captures displayed that singular notice.
The gameplay action log retains both physical IDs. This bead preserves the
read-only notice/event/UI modules and records the presentation issue here.
