# hv-97uo: figment creation and reserved positions

Battlefield Capacity in `docs/rules.md` counts a controller's effective characters
on the stack toward its back rank. Each played character has a position when it
resolves. Figment creation uses the unreserved positions reported by
`freeBackSlotsAfterStack`, clamped at zero. Opposing pending characters and
effective events consume none of that controller's positions. D39 deck-entry
modifications supply the effective card type through the existing catalog API.

A group fills available positions from left to right. When only part fits, its
total spark is divided among the created figments, with the remainder assigned
from left to right. With zero available positions, creation publishes a capacity
result and creates no instance. Awakened entry, existing figment identities and
C5 copiable values follow their existing rules. Both primitive materialization
and C5 creation use this shared routine.

These rules are explicit; this bead introduces no rules ambiguity or provisional
Apollyon design. The source preparation in `hv-umm2.640` and original pair
`hv-umm2.290` retain their separate acceptance and content ownership. The two
exact incarnation Aspect modules and production authoring statuses belong to
those tasks.

The new public synthetic contracts use genuine permanent card sources and an
Avatar emblem, ordinary play and Interrupt response chains, D39 variants,
public views, and fold intents. Both controllers exercise full reservations,
multiple own pending characters, opposing pending characters, events, partial
and complete groups, awakened entry, C5 creation, refusal, reload, replay,
stale and foreign answers, competing actions, uncancellable triggers and
creation rollback after a later instruction fails.

The immutable original-capacity baseline has 14 causal failures and 16 passing
controls across 30 cases. The causal failures cover permanent card and emblem
sources, multiple own pending characters, a D39 event played as a character,
partial group distribution, C5 creation at capacity and a suspended creation
prefix. The final test changes correct the secondary Avatar source shape and
add a stale-prompt guard; the failing capacity expectations remain identical.
Raw baseline bytes, hashes, output and command receipts are retained in this
bead's QA evidence. The baseline is a real counterfactual execution, not an
assertion about an implementation literal.
