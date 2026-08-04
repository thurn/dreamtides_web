#!/usr/bin/env python3
"""Focused tests for batch exploration encounter helper scripts."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parent
SELECTOR = SCRIPTS_DIR / "select-batch.py"
AGGREGATOR = SCRIPTS_DIR / "aggregate-batch.py"
VALIDATOR = SCRIPTS_DIR.parents[1] / "exploration-encounter-designer/scripts/validate-exploration.py"
ART_FINDER = SCRIPTS_DIR.parents[1] / "exploration-encounter-designer/scripts/find-card-art.py"
CARD_IDS = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
]


def write_cards(path: Path) -> None:
    entries = []
    for index, card_id in enumerate(CARD_IDS, start=1):
        card_type = "Event" if index == 2 else "Character"
        subtype = "" if card_type == "Event" else "Warrior"
        entries.append(
            "\n".join(
                [
                    "[[cards]]",
                    f'id = "{card_id}"',
                    f'name = "Synthetic Card {index}"',
                    f'rendered-text = "Gain {index} energy."',
                    f"image-number = {1000 + index}",
                    f'card-type = "{card_type}"',
                    f'subtype = "{subtype}"',
                ]
            )
        )
    path.write_text("\n\n".join(entries) + "\n", encoding="utf-8")


def events() -> list[dict[str, object]]:
    output = []
    for rank in range(1, 6):
        actions = []
        for action_index in range(2):
            template_id = (rank - 1) * 2 + action_index + 1
            actions.append(
                {
                    "label": f"Choose option {action_index + 1}",
                    "template_id": template_id,
                    "variables": {"count": 2} if template_id == 1 else {},
                }
            )
        output.append(
            {
                "template_pair_id": f"pair-{rank}",
                "prose": f"A synthetic monument occupies scene number {rank}.",
                "actions": actions,
                "scores": {
                    "scene_quality": 8,
                    "action_quality": 8,
                    "mechanical_connection": 8,
                    "archetype_fit": 8,
                    "overall": 8,
                },
                "rank": rank,
                "ranking_rationale": "The synthetic fixture satisfies the observable contract.",
            }
        )
    return output


class BatchScriptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.cards_path = self.root / "cards.toml"
        write_cards(self.cards_path)
        self.candidates_path = self.root / "encounter_candidates.json"
        self.candidates_path.write_text(
            json.dumps({CARD_IDS[0]: [{"rank": 1}]}, indent=2) + "\n",
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def select(self, run_name: str, size: int = 2) -> subprocess.CompletedProcess[str]:
        run_dir = self.root / run_name
        run_dir.mkdir()
        return subprocess.run(
            [
                sys.executable,
                str(SELECTOR),
                "--batch-size",
                str(size),
                "--seed",
                "17",
                "--run-dir",
                str(run_dir),
                "--cards",
                str(self.cards_path),
                "--encounter-candidates",
                str(self.candidates_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_selector_is_reproducible_and_excludes_represented_uuids(self) -> None:
        first = self.select("run-one")
        second = self.select("run-two")

        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(second.returncode, 0, second.stderr)
        first_output = json.loads(first.stdout)
        second_output = json.loads(second.stdout)
        self.assertEqual(first_output["card_ids"], second_output["card_ids"])
        self.assertEqual(set(first_output["card_ids"]), set(CARD_IDS[1:]))
        manifest = json.loads(Path(first_output["manifest"]).read_text())
        self.assertEqual(manifest["batch_size"], 2)
        self.assertEqual(
            manifest["encounter_candidates_sha256"],
            hashlib.sha256(self.candidates_path.read_bytes()).hexdigest(),
        )
        self.assertEqual(
            sorted(path.stem for path in Path(first_output["requests_dir"]).glob("*.json")),
            sorted(CARD_IDS[1:]),
        )

    def test_selector_rejects_a_batch_larger_than_the_remaining_pool(self) -> None:
        result = self.select("oversized", size=3)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("only 2 are unrepresented", result.stderr)

    def prepare_aggregate(self) -> tuple[dict[str, object], list[str]]:
        selected = self.select("aggregate-run")
        self.assertEqual(selected.returncode, 0, selected.stderr)
        output = json.loads(selected.stdout)
        for card_id in output["card_ids"]:
            (Path(output["results_dir"]) / f"{card_id}.json").write_text(
                json.dumps(events(), indent=2) + "\n", encoding="utf-8"
            )

        templates = [
            {
                "template_id": index,
                "template": (
                    "Synthetic {count} $RUNTIME_REWARD" if index == 1
                    else f"Synthetic effect {index}"
                ),
            }
            for index in range(1, 11)
        ]
        (self.root / "templates.json").write_text(
            json.dumps(templates), encoding="utf-8"
        )
        (self.root / "dreamsigns.toml").write_text(
            '\n'.join([
                '[[dreamsign]]',
                'id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"',
                'name = "Synthetic Sign"',
                'rendered-text = "Gain 1 energy."',
            ]),
            encoding="utf-8",
        )
        (self.root / "journey.ts").write_text(
            'export type TransfigurationType = "Empowered";', encoding="utf-8"
        )
        images = self.root / "images"
        images.mkdir()
        for number in (1002, 1003):
            (images / f"synthetic-{number}.png").write_bytes(b"synthetic")
        return output, output["card_ids"]

    def aggregate_command(self, output: dict[str, object]) -> list[str]:
        return [
            sys.executable,
            str(AGGREGATOR),
            "--manifest",
            str(output["manifest"]),
            "--results-dir",
            str(output["results_dir"]),
            "--encounter-candidates",
            str(self.candidates_path),
            "--images-dir",
            str(self.root / "images"),
            "--validator",
            str(VALIDATOR),
            "--art-finder",
            str(ART_FINDER),
            "--template-catalog",
            str(self.root / "templates.json"),
            "--cards-data",
            str(self.cards_path),
            "--dreamsigns-data",
            str(self.root / "dreamsigns.toml"),
            "--transfigurations-data",
            str(self.root / "journey.ts"),
        ]

    def test_aggregator_validates_appends_selects_and_renders_the_full_batch(self) -> None:
        output, card_ids = self.prepare_aggregate()
        display_path = self.root / "display.md"
        result = subprocess.run(
            [*self.aggregate_command(output), "--display-output", str(display_path)],
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        stored = json.loads(self.candidates_path.read_text())
        self.assertEqual(set(stored), set(CARD_IDS))
        for card_id in card_ids:
            self.assertEqual(len(stored[card_id]), 5)
            self.assertEqual(
                stored[card_id][0]["selected"],
                {"prose": True, "actions": True},
            )
            self.assertFalse(any("selected" in event for event in stored[card_id][1:]))
        self.assertEqual(result.stdout, display_path.read_text())
        self.assertEqual(result.stdout.count("# Synthetic Card"), 2)
        self.assertIn("![Source artwork", result.stdout)
        self.assertIn("Synthetic 2 $RUNTIME_REWARD", result.stdout)
        self.assertNotIn("template_pair_id", result.stdout)
        self.assertFalse(any(
            "template" in action or "effect_text" in action
            for card_id in card_ids
            for event in stored[card_id]
            for action in event["actions"]
        ))

    def test_aggregator_refuses_stale_catalog_state_without_writing(self) -> None:
        output, _ = self.prepare_aggregate()
        self.candidates_path.write_text("{}\n", encoding="utf-8")
        before = self.candidates_path.read_bytes()

        result = subprocess.run(
            self.aggregate_command(output), capture_output=True, text=True, check=False
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("changed after batch selection", result.stderr)
        self.assertEqual(self.candidates_path.read_bytes(), before)

    def test_aggregator_refuses_a_partial_batch_without_writing(self) -> None:
        output, card_ids = self.prepare_aggregate()
        (Path(output["results_dir"]) / f"{card_ids[-1]}.json").unlink()
        before = self.candidates_path.read_bytes()

        result = subprocess.run(
            self.aggregate_command(output), capture_output=True, text=True, check=False
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not exist", result.stderr)
        self.assertEqual(self.candidates_path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
