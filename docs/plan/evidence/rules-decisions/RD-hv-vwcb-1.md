# RD-hv-vwcb-1: Trigger that exact admitted ability again

- Ladder: not invoked for existing once-per-turn, disabled-admission and intervening-condition restrictions; 5 for the captured referent after source loss, after checking 1–4 below.
- rules.md: Ability Types → Triggering that ability again; Intervening conditions; Once per turn; Floating and delayed triggers; Disabled triggers; Trigger timing and order. Earlier anchors: RD-hv-7x4l.6-2, RD-hv-p1ss-1.
- Affects: 2d4eb3ee-0931-45ed-8365-69f18096ead5 (authoring remains hv-umm2.237). This primitive authors zero production entities.
- Why: “that ability” identifies one already admitted occurrence, so its source, original definition, numeric ability and floating node, controller, subject and bindings remain its referent. A new current-source scan could trigger several other abilities. Its fresh admission follows the existing restrictions, including a spent once-per-turn original and a consumed delayed one-shot. Removing gained-ability records does not replenish this captured allowance. Source loss alone does not replace its definition or controller; a condition that depends on the source can still prevent it.

D10 checks: no D/C/P entry supplies a limit exception. The current genuine
explicit named-trigger prototype enforces admission restrictions, and this
exact-repeat form has no prototype. Pending catalog text is not behavior.
Read-only Rust `ability_data/src/triggered_ability.rs` declares once-per-turn;
`standard_effect.rs` has predicate/collection TriggerJudgmentAbility, while
`battle_mutations/src/phase_mutations/fire_triggers.rs` rescans current
character abilities and skips absent characters. This Judgment model has no
unchanged exact-repeat rule for the affected text.

The [official CR effective 2026-09-25](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt),
linked by the [rules page](https://magic.wizards.com/en/rules), distinguishes
additional triggering (603.2d), admission limitations (603.2h), independent
queued text/controller (603.3/603.3a), and condition rechecks (603.4).
Dreamtides keeps its explicit resolving instruction, FIFO, private/floating
admissions and D12 recursion; the analog's static multiplication and exclusions
do not define these rules.

[Official MH3 notes](https://magic.wizards.com/en/news/feature/modern-horizons-3-release-notes)
(Echoes of Eternity) support separate instances, choices and linkage.
[Official Commander Masters notes](https://magic.wizards.com/en/news/feature/commander-masters-release-notes)
(Abstruse Archaic) distinguish copying an already queued ability. The affected
text instructs triggering again, so a successful repeat counts as an actual
named admission and can cause further reactions. The smallest adaptation
preserves the exact referent and ordinary limits while retaining queued
context through source loss.
