# RD-hv-umm2.270-1: Journey type-remap acquisition and lifetime

- Ladder: C12 and P8 directly; step 5 for lifetime, repeated acquisitions, earned-choice ordering, and suspension, consistent with the current acquisition rules. The limited Magic analog supports persistence (611.2a) and the distinction between type words and proper names (612.2).
- rules.md: § Journey Dreamsign Acquisition Effects → Journey Type Remapping; § Keywords and Effects → Choose a character type; § Ability Types → Card ability type remapping; RD-hv-umm2.723-1.
- Affects: 3d86f8ce-42ac-43dc-96d5-121e6d1a6167.
- Why: C12 stores one remap with the run and explicitly includes future deck entries. Each genuine acquired physical copy earns its printed choice; the latest completed choice replaces the run value and transforms original references. The earned effect persists after source loss. Mandatory type-remap choices wrap the completed acquisition continuation, before optional starter purges and their existing mandatory-copy and earned-site continuations. Suspension preserves an initialized battle and its prompt, while later initialization projects the current run value into every player deck entry. Local picker dismissal is presentation state; only the confirmed intent changes the run.

Read-only inspection of
`~/dreamtides/client/Assets/StreamingAssets/Tabula/dreamsigns.toml` lines
254–260 binds the same UUID to different text, “Allied Figments count as
Warriors.” The reference Rust engine, battle rules, and constructed prototype
supply no same-text implementation. The parent inspected the official Magic
Comprehensive Rules effective June 19, 2026; its ordinary copying exclusion for
text changes (707.2) does not determine Dreamtides copy inheritance. C12 and
RD-hv-umm2.723-1 govern that behavior. These facts support the explicit step-5
journey ruling above, rather than attributing future-entry, repeated-choice, or
Variant semantics to the analog.

The type picker uses the game's catalog types, excluding placeholders. Its
pending permission owns gameplay, admits its exact resolution and Dreamsign
removal, and survives source loss and validated save/reload. Existing
administrative validation remains in force. UI-only word substitution preserves
UUID-resolved proper names and dynamic type phrases, and respects C12's
figment-creation restriction. Mixed acquisition effects compose through their
admitted physical-source handoff; each effect retains its own semantics.

Removal is an admitted intent class, subject to the existing independent
continuation contract. A removal that invalidates a nested copy or other earned
permission is refused atomically. The type-remap source itself may be lost when
the saved continuation remains valid; source loss preserves that permission.
This step-5 refinement keeps physical copy addressing intact and requires no
readdressing or pruning of another effect's earned history.
