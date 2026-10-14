# hv-pu55 public contract and scope

`fromVoid` carries the optional `thisTurn` qualification. The existing shared
void-target predicate checks successful physical membership in the named
current void before evaluating its existing cost bound. Both target offers and
resolution use that predicate. Dissolved and discarded membership accepts
occurrences from either actor; abandoned membership requires the named void
side as the abandoning actor. The existing reader supplies these semantics.
Rules: `docs/rules.md` § Zones → References to cards in a zone, § Targeting,
§ Keywords and Effects → Materialize, and § Current-turn occurrences and
physical membership. Ladder: not invoked; these clauses settle the behavior.

The private contract module runs through the existing eager primitive-contract
runner. It uses synthetic definitions and genuine dissolution, abandonment,
discard, copy, materialization, control-change, interrupt, and turn actions.
Both actors exercise candidate membership, optional zero/one/three selections,
ordinary unqualified references, repeated occurrence deduplication, copied
character cessation, current ownership after control changes, successful
Veil/reclaim distinctions, source-zone order, cost and targetability,
normal/extra turn reset, partial/zero legal resolution after an interrupt,
capacity, and saved qualified choices.

Recovery coverage includes pending-choice serialization and cold fold loading,
state hash/serialization roundtrip, public void view, replay, illegal/stale and
foreign answers, concurrent actions, cancellation/retry with a new attempt,
and rollback of materialization/history writes after a resolution error.
A new turn cannot begin while this target's stack item is pending. History is
fixed within that turn; normal/extra transition tests cover its invalidation.
The interrupt tests use actual zone departures rather than invented history.
Existing zone/history contracts cover the broader state and disclosure reader.

A retained counterfactual omits exactly the new membership guard. Both actors'
public candidate assertions fail on stale and discarded physical members.
The original source bytes are restored and hashed before normal acceptance
checks. This is execution evidence; no permanent implementation-mirror test or
new test entrypoint is added.

The optional field preserves existing exported identities and the independent
693 stored-counter transport. There is no new operation, event, prompt role,
status, state history, or registration entry. Forced fallout is determined by
full typechecks. Existing importer bodies, production catalogs, UI, shared
fixtures and QA infrastructure remain read-only.

The parent's native same-task justiciar admission resolves the added synthetic
live-browser gate: the fixed lab catalog cannot host the private qualified
consumer through a supported API. Public engine/fold acceptance replaces that
foundation-only gate; no browser execution or visual proof is claimed. Original
hv-umm2.194 retains fresh weighted four-UUID fuzz, default preflight/sweep,
D21 decisions, and the actual Heroic Rescue chooser workflow on both actors.
