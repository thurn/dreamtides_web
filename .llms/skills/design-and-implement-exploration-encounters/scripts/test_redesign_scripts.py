#!/usr/bin/env python3
"""Synthetic tests for preservation-first Exploration action redesigns."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from assemble_designs import AssemblyError
from assemble_redesigns import assemble_redesigns
from select_redesign_batch import RedesignSelectionError, create_redesign_batch, load_live_encounters
from test_scripts import (
    LIVE_ACTION_ID,
    LIVE_CARD_ID,
    NEW_CARD_ID,
    PipelineFixture,
)
from template_assignments import apply_workset, bootstrap_document
from verify_redesigns import verify_redesigns


LIVE_ACTION_TWO_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
NEW_ACTION_ONE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
NEW_ACTION_TWO_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff"


class RedesignFixture:
    def __init__(self, root: Path, *, donor_template_id: int = 14) -> None:
        self.base = PipelineFixture(root)
        self.base.exploration_compat.write_text(
            f'''schema-version = 2
effect-kinds = ["draft-card"]

[[encounter]]
card-id = "{LIVE_CARD_ID}"
prose = "Already live."

[[encounter.action]]
id = "{LIVE_ACTION_ID}"
label = "Take first"
effect-text = "Draft a card"
effect-kind = "draft-card"
predicate = "warrior"
count = 1
offer-count = 4

[[encounter.action]]
id = "{LIVE_ACTION_TWO_ID}"
label = "Keep second"
effect-text = "Draft another card"
effect-kind = "draft-card"
predicate = "warrior"
count = 1
offer-count = 4

[[encounter]]
card-id = "{NEW_CARD_ID}"
prose = "Also live."

[[encounter.action]]
id = "{NEW_ACTION_ONE_ID}"
label = "Take new first"
effect-text = "Draft a card"
effect-kind = "draft-card"
predicate = "warrior"
count = 1
offer-count = 4

[[encounter.action]]
id = "{NEW_ACTION_TWO_ID}"
label = "Keep new second"
effect-text = "Draft another card"
effect-kind = "draft-card"
predicate = "warrior"
count = 1
offer-count = 4
''',
            encoding="utf-8",
        )
        self.plan = root / "plan.json"
        self.plan.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "assignments": [
                        {
                            "target_template_id": 90,
                            "candidates": [
                                {
                                    "card_id": LIVE_CARD_ID,
                                    "replace_action_id": LIVE_ACTION_ID,
                                    "donor_template_id": donor_template_id,
                                },
                                {
                                    "card_id": NEW_CARD_ID,
                                    "replace_action_id": NEW_ACTION_ONE_ID,
                                    "donor_template_id": donor_template_id,
                                },
                            ],
                        }
                    ],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        self.ledger = root / "template-assignments.json"
        self.ledger.write_text(
            json.dumps(bootstrap_document(self.base.exploration_compat), indent=2) + "\n",
            encoding="utf-8",
        )
        self.selection = create_redesign_batch(
            run_dir=self.base.run_dir,
            plan_path=self.plan,
            source_paths=self.base.source_paths,
            images_dir=self.base.images,
            template_assignments_path=self.ledger,
        )
        self.manifest = json.loads(Path(self.selection["manifest"]).read_text())
        self.assignment = self.manifest["assignments"][0]

    def result(self, mechanic_id: int = 90) -> dict:
        return {
            "assignment_id": self.assignment["assignment_id"],
            "selected_card_id": LIVE_CARD_ID,
            "replaced_action_id": LIVE_ACTION_ID,
            "replacement_action": {
                "action_id": self.assignment["replacement_action_id"],
                "label": "Gather future embers",
                "mechanic_id": mechanic_id,
                "presentation": {"effect_text": "Gain a future reward", "followup": None},
                "effect": {
                    "variant": "FutureReward",
                    "fields": {"future_reward_count": 2},
                    "runtime_effect_kind": "future-reward",
                },
                "implementation_notes": {
                    "state_transition": "Persist two future rewards.",
                    "offer_or_selection": "Prepare rewards deterministically.",
                    "persisted_result": "Persist both reward identifiers.",
                    "outcome": "Show both prepared rewards.",
                },
            },
            "selection_rationale": "Visible embers make the future reward causal and preserve a contrasting draft action.",
            "rejected_candidates": [
                {"card_id": NEW_CARD_ID, "rejected_because": "Its scene offers weaker future-reward causality."}
            ],
        }

    def write_result(self, value: dict) -> None:
        assignment_id = self.assignment["assignment_id"]
        (self.base.run_dir / "results" / f"{assignment_id}.json").write_text(
            json.dumps(value, indent=2) + "\n", encoding="utf-8"
        )


class RedesignPipelineTests(unittest.TestCase):
    def test_non_two_action_encounters_are_excluded_without_blocking_catalog_load(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            fixture.exploration_compat.write_text(
                fixture.exploration_compat.read_text()
                + f'''\n[[encounter]]
card-id = "{NEW_CARD_ID}"
prose = "Two actions."

[[encounter.action]]
id = "{NEW_ACTION_ONE_ID}"
label = "First action"
effect-text = "Draft a card"
effect-kind = "draft-card"

[[encounter.action]]
id = "{NEW_ACTION_TWO_ID}"
label = "Second action"
effect-text = "Draft a card"
effect-kind = "draft-card"
''',
                encoding="utf-8",
            )
            encounters = load_live_encounters(fixture.exploration_compat)
            self.assertNotIn(LIVE_CARD_ID, encounters)
            self.assertIn(NEW_CARD_ID, encounters)

    def test_selector_rejects_a_false_donor_template_claim(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(RedesignSelectionError, "does not match ledger"):
                RedesignFixture(Path(temporary), donor_template_id=65)

    def test_selector_binds_template_and_candidate_actions(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = RedesignFixture(Path(temporary))
            request = json.loads(
                (fixture.base.run_dir / "requests" / f"{fixture.assignment['assignment_id']}.json").read_text()
            )
            self.assertEqual(request["target_template"]["id"], 90)
            self.assertEqual(len(request["candidates"]), 2)
            self.assertEqual(request["candidates"][0]["replace_action_id"], LIVE_ACTION_ID)

    def test_assembly_rejects_template_substitution(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = RedesignFixture(Path(temporary))
            fixture.write_result(fixture.result(mechanic_id=14))
            with self.assertRaisesRegex(AssemblyError, "substitution is forbidden"):
                assemble_redesigns(
                    manifest_path=Path(fixture.selection["manifest"]),
                    results_dir=fixture.base.run_dir / "results",
                    workset_output=fixture.base.run_dir / "workset.json",
                    display_output=fixture.base.run_dir / "display.md",
                )

    def test_verifier_preserves_prose_and_untouched_action(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = RedesignFixture(Path(temporary))
            fixture.write_result(fixture.result())
            workset = fixture.base.run_dir / "workset.json"
            assemble_redesigns(
                manifest_path=Path(fixture.selection["manifest"]),
                results_dir=fixture.base.run_dir / "results",
                workset_output=workset,
                display_output=fixture.base.run_dir / "display.md",
            )
            replacement_id = fixture.assignment["replacement_action_id"]
            implemented = fixture.base.root / "implemented-redesign.toml"
            source = fixture.base.exploration_compat.read_text()
            old_block = f'''[[encounter.action]]
id = "{LIVE_ACTION_ID}"
label = "Take first"
effect-text = "Draft a card"
effect-kind = "draft-card"
predicate = "warrior"
count = 1
offer-count = 4
'''
            new_block = f'''[[encounter.action]]
id = "{replacement_id}"
label = "Gather future embers"
effect-text = "Gain a future reward"
effect-kind = "future-reward"
future-reward-count = 2
'''
            implemented.write_text(source.replace(old_block, new_block), encoding="utf-8")
            apply_workset(
                ledger_path=fixture.ledger,
                workset_path=workset,
                exploration_path=implemented,
                mechanic_path=fixture.base.mechanic_ideas,
            )
            report = verify_redesigns(
                workset,
                implemented,
                fixture.ledger,
                fixture.base.mechanic_ideas,
            )
            self.assertEqual(report["verified_card_ids"], [LIVE_CARD_ID])
            self.assertEqual(report["template_deltas"], [
                {"target_template_id": 90, "target_delta": 1, "donor_template_id": 14, "donor_delta": -1}
            ])


if __name__ == "__main__":
    unittest.main()
