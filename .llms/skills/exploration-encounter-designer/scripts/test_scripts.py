#!/usr/bin/env python3
"""Focused tests for Exploration Encounter Designer helper scripts."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parent
GENERATOR = SCRIPTS_DIR / "generate-exploration-input.py"
VALIDATOR = SCRIPTS_DIR / "validate-exploration.py"


def canonical_card() -> dict[str, object]:
    return {
        "id": "11111111-1111-4111-8111-111111111111",
        "name": "Synthetic Animal",
        "ability": "Gain 1 energy.",
        "image_number": 123456,
        "card_type": "Character",
        "subtype": "Spirit Animal",
    }


class GenerateExplorationInputTests(unittest.TestCase):
    def test_prints_only_a_reproducible_random_card(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cards_path = Path(directory) / "cards.toml"
            cards_path.write_text(
                """
[[cards]]
id = "11111111-1111-4111-8111-111111111111"
name = "Synthetic Animal"
rendered-text = "Gain 1 energy."
image-number = 123456
card-type = "Character"
subtype = "Spirit Animal"

[[cards]]
id = "22222222-2222-4222-8222-222222222222"
name = "Synthetic Event"
rendered-text = "Draw a card."
image-number = 654321
card-type = "Event"
subtype = ""
""".strip(),
                encoding="utf-8",
            )
            command = [
                sys.executable,
                str(GENERATOR),
                "--seed",
                "7",
                "--cards",
                str(cards_path),
            ]
            first = subprocess.run(command, capture_output=True, text=True, check=False)
            second = subprocess.run(command, capture_output=True, text=True, check=False)

            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(first.stdout, second.stdout)
            self.assertEqual(set(json.loads(first.stdout)), {"card"})

            character = subprocess.run(
                [*command, "--card-type", "character"],
                capture_output=True,
                text=True,
                check=False,
            )
            event = subprocess.run(
                [*command, "--card-type", "event"],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(character.returncode, 0, character.stderr)
            self.assertEqual(event.returncode, 0, event.stderr)
            self.assertEqual(json.loads(character.stdout)["card"]["card_type"], "Character")
            self.assertEqual(json.loads(event.stdout)["card"]["card_type"], "Event")


class ValidateExplorationTests(unittest.TestCase):
    def run_validator(self, template_ids: list[int]) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            templates = [
                {"template_id": index, "template": f"Synthetic template {index}"}
                for index in range(1, 11)
            ]
            catalog_path = root / "templates.json"
            catalog_path.write_text(json.dumps(templates), encoding="utf-8")
            cards_path = root / "cards.toml"
            cards_path.write_text(
                """
[[cards]]
id = "11111111-1111-4111-8111-111111111111"
name = "Synthetic Animal"
rendered-text = "Gain 1 energy."
image-number = 123456
card-type = "Character"
subtype = "Spirit Animal"
""".strip(),
                encoding="utf-8",
            )
            dreamsigns_path = root / "dreamsigns.toml"
            dreamsigns_path.write_text(
                """
[[dreamsign]]
id = "22222222-2222-4222-8222-222222222222"
name = "Synthetic Sign"
rendered-text = "Gain 1 energy."
""".strip(),
                encoding="utf-8",
            )
            transfigurations_path = root / "journey.ts"
            transfigurations_path.write_text(
                'export type TransfigurationType = "Empowered";', encoding="utf-8"
            )
            request = {
                "card": canonical_card(),
                "template_pairs": [
                    {
                        "id": f"pair-{index + 1}",
                        "actions": [
                            templates[template_ids[index * 2] - 1],
                            templates[template_ids[index * 2 + 1] - 1],
                        ],
                    }
                    for index in range(5)
                ],
            }
            input_path = root / "request.json"
            input_path.write_text(json.dumps(request), encoding="utf-8")
            return subprocess.run(
                [
                    sys.executable,
                    str(VALIDATOR),
                    "--input",
                    str(input_path),
                    "--template-catalog",
                    str(catalog_path),
                    "--cards-data",
                    str(cards_path),
                    "--dreamsigns-data",
                    str(dreamsigns_path),
                    "--transfigurations-data",
                    str(transfigurations_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )

    def test_accepts_ten_distinct_templates(self) -> None:
        result = self.run_validator(list(range(1, 11)))
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_a_template_reused_across_pairs(self) -> None:
        result = self.run_validator([1, 2, 3, 4, 5, 6, 7, 8, 9, 1])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be unique across all pairs", result.stderr)


if __name__ == "__main__":
    unittest.main()
