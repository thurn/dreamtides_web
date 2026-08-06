#!/usr/bin/env python3
"""Synthetic tests for the one-pass Exploration encounter pipeline."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from assemble_designs import AssemblyError, assemble
from select_batch import SelectionError, create_batch
from verify_live import VerificationError, verify


LIVE_CARD_ID = "11111111-1111-4111-8111-111111111111"
NEW_CARD_ID = "22222222-2222-4222-8222-222222222222"
DREAMSIGN_ID = "33333333-3333-4333-8333-333333333333"


class PipelineFixture:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.run_dir = root / "run"
        self.run_dir.mkdir()
        self.images = root / "images"
        self.images.mkdir()
        (self.images / "stock-photo-live-111.jpg").write_bytes(b"live art")
        (self.images / "stock-photo-new-222.jpg").write_bytes(b"new art")
        self.cards = root / "cards.toml"
        self.cards.write_text(
            f'''[[cards]]
id = "{LIVE_CARD_ID}"
name = "Live Card"
rendered-text = "Live ability."
image-number = 111
card-type = "Character"
subtype = "Warrior"

[[cards]]
id = "{NEW_CARD_ID}"
name = "New Card"
rendered-text = "New ability."
image-number = 222
card-type = "Character"
subtype = "Spirit Animal"
''',
            encoding="utf-8",
        )
        self.dreamsigns = root / "dreamsigns.toml"
        self.dreamsigns.write_text(
            f'''[[dreamsign]]
id = "{DREAMSIGN_ID}"
name = "Test Sign"
''',
            encoding="utf-8",
        )
        self.exploration = root / "exploration.toml"
        self.exploration.write_text(
            f'''[[encounter]]
card-id = "{LIVE_CARD_ID}"
prose = "Already live."

[[encounter.action]]
id = "{LIVE_CARD_ID}:first"
label = "Take first"
effect-text = "Gain 1 essence"
template-id = 1
template-variables = {{ essence = 1 }}
effect-kind = "gain-essence"

[[encounter.action]]
id = "{LIVE_CARD_ID}:second"
label = "Take second"
effect-text = "Draft a Warrior from 4 choices"
template-id = 2
template-variables = {{ predicate = "Warrior", offer_count = 4 }}
effect-kind = "draft-card"
''',
            encoding="utf-8",
        )
        self.templates = root / "templates.json"
        self.templates.write_text(
            json.dumps(
                [
                    {"template_id": 1, "template": "Gain {essence} essence"},
                    {
                        "template_id": 2,
                        "template": "Draft a {predicate} from {offer_count} choices",
                    },
                    {"template_id": 3, "template": "Gain {card_id}"},
                    {"template_id": 4, "template": "Gain {dreamsign_name}"},
                    {
                        "template_id": 5,
                        "template": "Apply {transfiguration} to $DECK_CARD",
                    },
                    {"template_id": 6, "template": "Gain $OFFERED_CARD"},
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        self.journey_types = root / "journey.ts"
        self.journey_types.write_text(
            'export type TransfigurationType = "Cheaper" | "Stronger";\n',
            encoding="utf-8",
        )

    def select(self) -> dict:
        return create_batch(
            run_dir=self.run_dir,
            batch_size=5,
            seed=None,
            requested_card_ids=[NEW_CARD_ID],
            cards_path=self.cards,
            dreamsigns_path=self.dreamsigns,
            exploration_path=self.exploration,
            templates_path=self.templates,
            journey_types_path=self.journey_types,
            images_dir=self.images,
        )

    def valid_result(self) -> dict:
        notes = {
            "state_transition": "Increase essence by 9.",
            "offer_or_selection": "No offer or selection is required.",
            "persisted_result": "Persist the exact essence delta.",
            "outcome": "Present the numeric essence gain.",
        }
        draft_notes = {
            "state_transition": "Add the selected offered card UUID to the deck.",
            "offer_or_selection": "Mint four eligible UUIDs and select one UUID.",
            "persisted_result": "Persist offered and selected card UUIDs.",
            "outcome": "Present the exact gained card.",
        }
        return {
            "card_id": NEW_CARD_ID,
            "prose": "A bronze wolf watches embers drift across black grass.",
            "actions": [
                {
                    "label": "Gather warm embers",
                    "template_id": 1,
                    "variables": {"essence": 9},
                    "implementation_notes": notes,
                },
                {
                    "label": "Follow fading tracks",
                    "template_id": 2,
                    "variables": {"predicate": "Warrior", "offer_count": 4},
                    "implementation_notes": draft_notes,
                },
            ],
            "selection_rationale": "Strong art fidelity and two useful effects with clear scene causality.",
            "alternatives_considered": [
                {"summary": "A guarded exchange", "rejected_because": "Weaker art connection."},
                {"summary": "A risky pursuit", "rejected_because": "One choice was dominated."},
                {"summary": "A quiet vigil", "rejected_because": "Lower archetype fit."},
                {"summary": "A sudden retreat", "rejected_because": "Less vivid action labels."},
            ],
        }

    def write_result(self, result: dict | None = None) -> Path:
        result_path = self.run_dir / "results" / f"{NEW_CARD_ID}.json"
        result_path.write_text(
            json.dumps(result or self.valid_result(), indent=2) + "\n",
            encoding="utf-8",
        )
        return result_path


class OnePassPipelineTests(unittest.TestCase):
    def test_selects_only_cards_absent_from_live_exploration(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            report = fixture.select()

            self.assertEqual(report["card_ids"], [NEW_CARD_ID])
            request = json.loads(
                (fixture.run_dir / "requests" / f"{NEW_CARD_ID}.json").read_text()
            )
            self.assertEqual(request["card"]["id"], NEW_CARD_ID)
            self.assertTrue(Path(request["art_path"]).is_absolute())
            self.assertEqual(Path(request["art_path"]).read_bytes(), b"new art")

    def test_rejects_an_explicit_live_uuid(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            with self.assertRaisesRegex(SelectionError, "already represented"):
                create_batch(
                    run_dir=fixture.run_dir,
                    batch_size=5,
                    seed=None,
                    requested_card_ids=[LIVE_CARD_ID],
                    cards_path=fixture.cards,
                    dreamsigns_path=fixture.dreamsigns,
                    exploration_path=fixture.exploration,
                    templates_path=fixture.templates,
                    journey_types_path=fixture.journey_types,
                    images_dir=fixture.images,
                )

    def test_assembles_one_validated_winner_without_a_candidate_catalog(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            selection = fixture.select()
            fixture.write_result()
            workset = fixture.run_dir / "encounter_workset.toml"
            display = fixture.run_dir / "display.md"

            report = assemble(
                manifest_path=Path(selection["manifest"]),
                results_dir=fixture.run_dir / "results",
                workset_output=workset,
                display_output=display,
            )

            self.assertEqual(report["card_ids"], [NEW_CARD_ID])
            self.assertIn(f'card-id = "{NEW_CARD_ID}"', workset.read_text())
            self.assertIn('effect-text = "Gain 9 essence"', workset.read_text())
            self.assertNotIn("effect-kind", workset.read_text())
            self.assertIn("# New Card", display.read_text())
            self.assertIn("***Gather warm embers*** — Gain 9 essence", display.read_text())

    def test_rejects_a_stale_source_before_writing_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            selection = fixture.select()
            fixture.write_result()
            fixture.templates.write_text("[]\n", encoding="utf-8")
            workset = fixture.run_dir / "encounter_workset.toml"
            display = fixture.run_dir / "display.md"

            with self.assertRaisesRegex(AssemblyError, "source changed"):
                assemble(
                    manifest_path=Path(selection["manifest"]),
                    results_dir=fixture.run_dir / "results",
                    workset_output=workset,
                    display_output=display,
                )
            self.assertFalse(workset.exists())
            self.assertFalse(display.exists())

    def test_rejects_copied_template_wording_in_a_design(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            selection = fixture.select()
            result = fixture.valid_result()
            result["actions"][0]["effect_text"] = "Gain 9 essence"
            fixture.write_result(result)

            with self.assertRaisesRegex(AssemblyError, "effect_text.*forbidden"):
                assemble(
                    manifest_path=Path(selection["manifest"]),
                    results_dir=fixture.run_dir / "results",
                    workset_output=fixture.run_dir / "workset.toml",
                    display_output=fixture.run_dir / "display.md",
                )

    def test_rejects_a_full_losing_candidate_disguised_as_an_alternative(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            selection = fixture.select()
            result = fixture.valid_result()
            result["alternatives_considered"][0]["summary"] = (
                "A bronze wolf guards a gate while Gather Sparks gains essence "
                "and Follow Tracks drafts four Warriors"
            )
            fixture.write_result(result)

            with self.assertRaisesRegex(AssemblyError, "at most 12 words"):
                assemble(
                    manifest_path=Path(selection["manifest"]),
                    results_dir=fixture.run_dir / "results",
                    workset_output=fixture.run_dir / "workset.toml",
                    display_output=fixture.run_dir / "display.md",
                )

    def test_accepts_canonical_card_and_dreamsign_entity_references(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            selection = fixture.select()
            result = fixture.valid_result()
            result["actions"][0].update(
                {
                    "label": "Accept offered ally",
                    "template_id": 3,
                    "variables": {
                        "card_id": {"id": LIVE_CARD_ID, "display_name": "Live Card"}
                    },
                }
            )
            result["actions"][1].update(
                {
                    "label": "Take glowing token",
                    "template_id": 4,
                    "variables": {
                        "dreamsign_name": {
                            "id": DREAMSIGN_ID,
                            "display_name": "Test Sign",
                        }
                    },
                }
            )
            fixture.write_result(result)

            assemble(
                manifest_path=Path(selection["manifest"]),
                results_dir=fixture.run_dir / "results",
                workset_output=fixture.run_dir / "workset.toml",
                display_output=fixture.run_dir / "display.md",
            )

            self.assertIn('effect-text = "Gain Live Card"', (fixture.run_dir / "workset.toml").read_text())
            self.assertIn('effect-text = "Gain Test Sign"', (fixture.run_dir / "workset.toml").read_text())

    def test_rejects_a_mismatched_entity_display_name(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            selection = fixture.select()
            result = fixture.valid_result()
            result["actions"][0].update(
                {
                    "template_id": 3,
                    "variables": {
                        "card_id": {"id": LIVE_CARD_ID, "display_name": "Wrong Name"}
                    },
                }
            )
            fixture.write_result(result)

            with self.assertRaisesRegex(AssemblyError, "must equal 'Live Card'"):
                assemble(
                    manifest_path=Path(selection["manifest"]),
                    results_dir=fixture.run_dir / "results",
                    workset_output=fixture.run_dir / "workset.toml",
                    display_output=fixture.run_dir / "display.md",
                )

    def test_rejects_the_source_card_as_an_entity_reference(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            selection = fixture.select()
            result = fixture.valid_result()
            result["actions"][0].update(
                {
                    "template_id": 3,
                    "variables": {
                        "card_id": {"id": NEW_CARD_ID, "display_name": "New Card"}
                    },
                }
            )
            fixture.write_result(result)

            with self.assertRaisesRegex(AssemblyError, "must not identify the source card"):
                assemble(
                    manifest_path=Path(selection["manifest"]),
                    results_dir=fixture.run_dir / "results",
                    workset_output=fixture.run_dir / "workset.toml",
                    display_output=fixture.run_dir / "display.md",
                )

    def test_accepts_transfiguration_and_special_variable_selection(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            selection = fixture.select()
            result = fixture.valid_result()
            result["actions"][0].update(
                {
                    "label": "Temper chosen memory",
                    "template_id": 5,
                    "variables": {"transfiguration": "Cheaper"},
                    "selection": {"$DECK_CARD": {"predicate": "Survivor"}},
                }
            )
            result["actions"][1].update(
                {
                    "label": "Welcome offered spirit",
                    "template_id": 6,
                    "variables": {},
                    "selection": {"$OFFERED_CARD": {"predicate": "Event"}},
                }
            )
            fixture.write_result(result)

            assemble(
                manifest_path=Path(selection["manifest"]),
                results_dir=fixture.run_dir / "results",
                workset_output=fixture.run_dir / "workset.toml",
                display_output=fixture.run_dir / "display.md",
            )

            workset = (fixture.run_dir / "workset.toml").read_text()
            self.assertIn("Apply Cheaper to $DECK_CARD", workset)
            self.assertIn('selection = { "$DECK_CARD" = { predicate = "Survivor" } }', workset)

    def test_rejects_unknown_transfigurations_and_selection_tokens(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            selection = fixture.select()
            result = fixture.valid_result()
            result["actions"][0].update(
                {
                    "template_id": 5,
                    "variables": {"transfiguration": "Imaginary"},
                    "selection": {"$DECK_CARD": {"predicate": "Survivor"}},
                }
            )
            fixture.write_result(result)

            with self.assertRaisesRegex(AssemblyError, "canonical transfiguration"):
                assemble(
                    manifest_path=Path(selection["manifest"]),
                    results_dir=fixture.run_dir / "results",
                    workset_output=fixture.run_dir / "workset.toml",
                    display_output=fixture.run_dir / "display.md",
                )

            result["actions"][0]["variables"] = {"transfiguration": "Cheaper"}
            result["actions"][0]["selection"] = {
                "$OFFERED_CARD": {"predicate": "Survivor"}
            }
            fixture.write_result(result)
            with self.assertRaisesRegex(AssemblyError, "not a special variable in the template"):
                assemble(
                    manifest_path=Path(selection["manifest"]),
                    results_dir=fixture.run_dir / "results",
                    workset_output=fixture.run_dir / "workset.toml",
                    display_output=fixture.run_dir / "display.md",
                )

    def test_verifies_runtime_complete_live_actions(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            selection = fixture.select()
            fixture.write_result()
            workset = fixture.run_dir / "encounter_workset.toml"
            assemble(
                manifest_path=Path(selection["manifest"]),
                results_dir=fixture.run_dir / "results",
                workset_output=workset,
                display_output=fixture.run_dir / "display.md",
            )
            designed = workset.read_text(encoding="utf-8")
            live = designed.replace(
                'template-variables = { essence = 9 }',
                'template-variables = { essence = 9 }\neffect-kind = "gain-essence"',
            ).replace(
                'template-variables = { predicate = "Warrior", offer_count = 4 }',
                'template-variables = { predicate = "Warrior", offer_count = 4 }\neffect-kind = "draft-card"',
            )
            live_path = fixture.root / "implemented.toml"
            live_path.write_text(live, encoding="utf-8")

            report = verify(workset, live_path)

            self.assertEqual(report["verified_card_ids"], [NEW_CARD_ID])

    def test_rejects_a_live_action_without_an_effect_kind(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            selection = fixture.select()
            fixture.write_result()
            workset = fixture.run_dir / "encounter_workset.toml"
            assemble(
                manifest_path=Path(selection["manifest"]),
                results_dir=fixture.run_dir / "results",
                workset_output=workset,
                display_output=fixture.run_dir / "display.md",
            )

            with self.assertRaisesRegex(VerificationError, "no runtime effect-kind"):
                verify(workset, workset)


if __name__ == "__main__":
    unittest.main()
