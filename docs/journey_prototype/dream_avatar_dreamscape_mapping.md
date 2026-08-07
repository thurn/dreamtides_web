# Dream Avatar ↔ Dreamscape mapping

Every non-starter dreamscape in `data/dreamscapes.ron` lists the 3–4
Dream Avatars that call it home, under a `dream-avatar-ids` field. Together these
lists **partition** `data/dream_avatars.ron`: each of the 32
Dream Avatars belongs to exactly one dreamscape, and no Dream Avatar is shared.
The starter region (Firstlight Meadow) has no residents.

The id is the source of truth; the trailing `# Name` comment on each entry is for
human readers only.

## Strategy

Each dreamscape already carries a thematic `affiliation-id` (warriors, events,
discard, …). A Dream Avatar's `rendered-text` describes what it wants to do, so
the mapping is built in two passes:

1. **Affiliation-driven (mechanical).** Where a Dream Avatar's ability names a
   region's theme, it goes to that region. This places the clear cases with no
   judgement: all three warrior payoffs (Gunnar Deepforge, Tensho, Valdren) →
   Tsukiren; the three event payoffs (Kasane, Rael, Ovanel) → Frostforge; the
   abandon trio (Ossian, Caedryn, Kragg) → Wilderveil; the discard converters
   (Vrakmoth, Corvath) → Grid City; and so on.

2. **Closest thematic fit (flavor).** Dream Avatars whose abilities are
   theme-neutral (generic card draw, energy ramp, board buffs) are placed by the
   region whose flavor and secondary mechanics fit best — e.g. the
   defensive/raider callers (Karev Soltis, Calloway Flint) join Kell Tarn in the
   Rust Expanse's survivor attrition, and the board-buff callers (Korrax, Kaleth,
   Senemhet) reinforce Hope's End's go-wide character plan.

32 Dream Avatars across 10 non-starter regions means **eight regions of 3 and two
of 4**. The two four-caller regions are Pharaoh's Gate (The Void) and Grid City
(Discard), which have the deepest natural pools of matching callers.

## Notable / intentionally unintuitive placements

- **Edran → Winterwake Fjords (Tempo).** Edran materializes outsider figments,
  which reads as a Figments caller. He is placed in the tempo region on purpose:
  his recurring bodies act as a tempo engine for the Fjords rather than a figment
  payoff.
- **Threxan → Farpoint Station (Figments).** A theme-neutral turn-one card draw,
  Threxan fills Farpoint's third slot; his proactive draw suits the station's
  gamble-for-tempo identity.

## Current mapping

| Dreamscape | Affiliation | Dream Avatars |
| --- | --- | --- |
| Tumbleleaf Village | Spirit Animals | Grath, Radulf, Demetrios |
| Pharaoh's Gate | The Void | Seld Rakor, Seraveth, Vaela, Vethran |
| Winterwake Fjords | Tempo | Yveth Coravel, Drusus Calvus, Edran |
| Frostforge | Events | Kasane, Rael, Ovanel |
| Hope's End | Characters | Korrax, Kaleth, Senemhet |
| Tsukiren | Warriors | Gunnar Deepforge, Tensho, Valdren |
| Wilderveil | Abandon | Ossian, Caedryn, Kragg |
| The Rust Expanse | Survivors | Kell Tarn, Karev Soltis, Calloway Flint |
| Farpoint Station | Figments | Serenath Veyl, Kael Voss, Threxan |
| Grid City | Discard | Vrakmoth, Corvath, Tessa, Zeva |

## Enforcement

`scripts/setup-assets.mjs` validates the invariant at build time
(`validateDreamAvatarMapping`). The structural checks — the same Dream Avatar
listed under two dreamscapes, a non-starter region outside the 3–4 band, or the
starter carrying residents — are **fatal**; they depend only on
`dreamscapes.ron`, so a routine edit elsewhere can never trip them. The
referential checks against the Dream Avatar set are **warnings**: a
`dream-avatar-id` that resolves to no Dream Avatar, and a Dream Avatar assigned to
no dreamscape. They warn rather than abort because the build may run against a
reduced Dream Avatar fixture (the asset tests swap one in). In a full production
build both files are real, so a stray id surfaces as paired warnings — the bad
id is "unknown" and the orphaned Dream Avatar is "unassigned". The per-region
assignment is echoed to the build log for reconstruction.
