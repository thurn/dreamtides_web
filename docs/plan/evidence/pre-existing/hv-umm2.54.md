# hv-umm2.54: sweep lifecycle oracle

The character sweep must distinguish a failed play from an AI activation that
abandons the played character. For UUID
`49c6e5ad-8da8-47fa-a8f3-906cbef8a3ed`, the enemy base and kindled cells reach the
void by paying the printed self-abandon cost. The first two sweeps recorded
those cells as failures because the expected zone was play.

The scoped oracle accepts the void only with ordered resolved, materialized,
and later-intent abandoned evidence for the same lab instance. The unchanged
resolution, interaction, board-change and error-buffer checks still apply.
The extracted-source guard experiment (`sweep-guard-experiment.result.json`)
accepts that lifecycle and rejects unrelated abandonment, absent materialization
or resolution, absent abandonment, earlier abandonment, and same-intent
abandonment. Final sweep verdicts are appended after the historical failures.

## Hand docking observations

The existing battle surface docks the opponent hand at the top edge. In the
activation captures, its first two face-up cards have desktop rectangles
`(665.01, -3.04, 52.93, 70.88)` and `(722.06, -3.04, 52.93, 70.88)`, and mobile
rectangles `(146.58, -5.52, 58.17, 76.33)` and
`(185.24, -5.52, 58.17, 76.33)` (x, y, width, height in CSS pixels). The lower
hand card extends past the bottom edge in the captures. Source edits in this
bead concern rules, content and the sweep oracle; the existing layout is the
surface used for these observations. Both captures show the revealed faces,
the surviving identical ally, and the face-up drawn card.

Captures: `reveal-activated-desktop.png`, `reveal-activated-mobile.png`,
`reveal-ending-desktop.png`.
