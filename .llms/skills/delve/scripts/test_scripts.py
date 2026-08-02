#!/usr/bin/env python3
"""Focused tests for the Delve skill scripts."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True


SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parents[3]
VALIDATOR = SCRIPTS_DIR / "validate-delve.py"
LOCATOR_PATH = SCRIPTS_DIR / "find-card-art.py"
GENERATOR = REPO_ROOT / "scripts/generate-delve-input.py"
CATALOG = SCRIPTS_DIR.parent / "references/templates.json"


def load_locator():
    spec = importlib.util.spec_from_file_location("find_card_art", LOCATOR_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def card() -> dict[str, object]:
    return {
        "id": "11111111-1111-4111-8111-111111111111",
        "name": "Synthetic Animal",
        "ability": "Gain 1 energy.",
        "image_number": 123456,
        "card_type": "Character",
        "subtype": "Spirit Animal",
    }


def template_action(template_id: int, template: str) -> dict[str, object]:
    return {"template_id": template_id, "template": template}


def request() -> dict[str, object]:
    return {
        "card": card(),
        "template_pairs": [
            {
                "id": f"pair-{i}",
                "actions": [
                    template_action(1, "Gain {essence} essence"),
                    template_action(28, "Gain a random dreamsign"),
                ],
            }
            for i in range(1, 6)
        ],
    }


def output() -> list[dict[str, object]]:
    events = []
    for i in range(1, 6):
        score = 11 - i
        events.append(
            {
                "template_pair_id": f"pair-{i}",
                "prose": "A vast silver arch hums softly above the waiting road.",
                "actions": [
                    {
                        "label": "Gather Warmth",
                        "resolution": "Warm light settles gently across your hands.",
                        "template_id": 1,
                        "template": "Gain {essence} essence",
                        "variables": {"essence": i},
                        "effect_text": f"Gain {i} essence",
                    },
                    {
                        "label": "Read the Signs",
                        "resolution": "Clear markings brighten along the silver arch.",
                        "template_id": 28,
                        "template": "Gain a random dreamsign",
                        "variables": {},
                        "effect_text": "Gain a random dreamsign",
                    },
                ],
                "scores": {
                    "scene_quality": score,
                    "action_quality": score,
                    "mechanical_connection": score,
                    "archetype_fit": score,
                    "overall": score,
                },
                "rank": i,
                "ranking_rationale": "The synthetic scene supports two natural actions and both fixed effects.",
            }
        )
    return events


def replace_action(
    request_data,
    output_data,
    action_index: int,
    template_id: int,
    template: str,
    action: dict[str, object],
) -> None:
    action.setdefault("resolution", "A clear answer rises from the waiting air.")
    request_data["template_pairs"][0]["actions"][action_index] = template_action(
        template_id, template
    )
    output_data[0]["actions"][action_index] = action


class FindCardArtTests(unittest.TestCase):
    def test_resolves_number_immediately_before_extension(self) -> None:
        locator = load_locator()
        with tempfile.TemporaryDirectory() as directory:
            images_dir = Path(directory)
            expected = images_dir / "stock-photo-example-123456.jpg"
            expected.touch()
            (images_dir / "stock-photo-example-123456-extra.jpg").touch()
            self.assertEqual(
                locator.find_image("123456", images_dir), expected.resolve()
            )

    def test_rejects_ambiguous_images(self) -> None:
        locator = load_locator()
        with tempfile.TemporaryDirectory() as directory:
            images_dir = Path(directory)
            (images_dir / "first-123456.jpg").touch()
            (images_dir / "second-123456.png").touch()
            with self.assertRaises(RuntimeError):
                locator.find_image("123456", images_dir)


class GenerateDelveInputTests(unittest.TestCase):
    def test_prints_valid_seeded_request(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            templates_path = root / "templates.json"
            templates_path.write_text(
                json.dumps(
                    [
                        {"template_id": i, "template": f"Synthetic template {i}"}
                        for i in range(1, 13)
                    ]
                ),
                encoding="utf-8",
            )
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

            command = [
                sys.executable,
                str(GENERATOR),
                "--seed",
                "7",
                "--templates",
                str(templates_path),
                "--cards",
                str(cards_path),
            ]
            first = subprocess.run(
                command, capture_output=True, text=True, check=False
            )
            second = subprocess.run(
                command, capture_output=True, text=True, check=False
            )

            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(first.stdout, second.stdout)
            self.assertEqual(first.stderr, "")
            generated = json.loads(first.stdout)
            self.assertEqual(generated["card"], card())
            self.assertEqual(len(generated["template_pairs"]), 5)
            actions = [
                action
                for pair in generated["template_pairs"]
                for action in pair["actions"]
            ]
            self.assertEqual(len(actions), 10)
            self.assertEqual(len({action["template_id"] for action in actions}), 10)


class ValidateDelveTests(unittest.TestCase):
    def run_validator(self, request_data, output_data=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_path = root / "input.json"
            input_path.write_text(json.dumps(request_data), encoding="utf-8")
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

[[cards]]
id = "44444444-4444-4444-8444-444444444444"
name = "Synthetic Event"
rendered-text = "Draw a card."
image-number = 654321
card-type = "Event"
subtype = ""
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
                'export type TransfigurationType = "Empowered" | "Kindled";',
                encoding="utf-8",
            )
            command = [
                sys.executable,
                str(VALIDATOR),
                "--input",
                str(input_path),
                "--template-catalog",
                str(CATALOG),
                "--cards-data",
                str(cards_path),
                "--dreamsigns-data",
                str(dreamsigns_path),
                "--transfigurations-data",
                str(transfigurations_path),
            ]
            if output_data is not None:
                output_path = root / "output.json"
                output_path.write_text(json.dumps(output_data), encoding="utf-8")
                command.extend(["--output", str(output_path)])
            return subprocess.run(command, capture_output=True, text=True, check=False)

    def test_accepts_valid_contracts(self) -> None:
        result = self.run_validator(request(), output())
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_template_text_mismatch(self) -> None:
        data = request()
        data["template_pairs"][0]["actions"][0]["template"] = "Gain lots of essence"
        result = self.run_validator(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not match catalog template", result.stderr)

    def test_rejects_noncanonical_source_card(self) -> None:
        data = request()
        data["card"]["id"] = "33333333-3333-4333-8333-333333333333"
        result = self.run_validator(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not identify a canonical card", result.stderr)

    def test_accepts_canonical_event_source_card(self) -> None:
        data = request()
        data["card"] = {
            "id": "44444444-4444-4444-8444-444444444444",
            "name": "Synthetic Event",
            "ability": "Draw a card.",
            "image_number": 654321,
            "card_type": "Event",
            "subtype": "",
        }
        result = self.run_validator(data)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_validates_canonical_entity_references(self) -> None:
        request_data = request()
        output_data = output()
        replace_action(
            request_data,
            output_data,
            0,
            10,
            "Gain {card_id}",
            {
                "label": "Welcome an Ally",
                "template_id": 10,
                "template": "Gain {card_id}",
                "variables": {
                    "card_id": {
                        "id": "11111111-1111-4111-8111-111111111111",
                        "display_name": "Synthetic Animal",
                    }
                },
                "effect_text": "Gain Synthetic Animal",
            },
        )
        replace_action(
            request_data,
            output_data,
            1,
            27,
            "Gain {dreamsign_name}",
            {
                "label": "Keep the Sign",
                "template_id": 27,
                "template": "Gain {dreamsign_name}",
                "variables": {
                    "dreamsign_name": {
                        "id": "22222222-2222-4222-8222-222222222222",
                        "display_name": "Synthetic Sign",
                    }
                },
                "effect_text": "Gain Synthetic Sign",
            },
        )
        result = self.run_validator(request_data, output_data)
        self.assertEqual(result.returncode, 0, result.stderr)

        output_data[0]["actions"][1]["variables"]["dreamsign_name"]["display_name"] = (
            "Invented Sign"
        )
        result = self.run_validator(request_data, output_data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must match canonical name", result.stderr)

    def test_accepts_custom_event_and_rejects_uuid_collision(self) -> None:
        request_data = request()
        output_data = output()
        custom_event = {
            "id": "55555555-5555-4555-8555-555555555555",
            "name": "Synthetic Arrival",
            "energy_cost": 1,
            "card_type": "Event",
            "subtype": "",
            "rendered_text": "Draw a card.",
            "spark": "",
        }
        replace_action(
            request_data,
            output_data,
            0,
            26,
            "Gain $CUSTOM_CARD",
            {
                "label": "Accept the Arrival",
                "template_id": 26,
                "template": "Gain $CUSTOM_CARD",
                "variables": {"custom_card": custom_event},
                "effect_text": "Gain Synthetic Arrival",
            },
        )
        result = self.run_validator(request_data, output_data)
        self.assertEqual(result.returncode, 0, result.stderr)

        custom_event["id"] = "11111111-1111-4111-8111-111111111111"
        result = self.run_validator(request_data, output_data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be a new UUID", result.stderr)

    def test_validates_card_name_and_dreamsign_alias_references(self) -> None:
        request_data = request()
        output_data = output()
        card_template = 'Gain {count} "Nightmare" bane cards. Gain {card_name}.'
        replace_action(
            request_data,
            output_data,
            0,
            70,
            card_template,
            {
                "label": "Endure the Omen",
                "template_id": 70,
                "template": card_template,
                "variables": {
                    "count": 1,
                    "card_name": {
                        "id": "11111111-1111-4111-8111-111111111111",
                        "display_name": "Synthetic Animal",
                    },
                },
                "effect_text": 'Gain 1 "Nightmare" bane card. Gain Synthetic Animal.',
            },
        )
        dreamsign_template = 'Gain {count} "Nightmare" bane cards. Gain {dreamsign}.'
        replace_action(
            request_data,
            output_data,
            1,
            69,
            dreamsign_template,
            {
                "label": "Read the Omen",
                "template_id": 69,
                "template": dreamsign_template,
                "variables": {
                    "count": 1,
                    "dreamsign": {
                        "id": "22222222-2222-4222-8222-222222222222",
                        "display_name": "Synthetic Sign",
                    },
                },
                "effect_text": 'Gain 1 "Nightmare" bane card. Gain Synthetic Sign.',
            },
        )
        result = self.run_validator(request_data, output_data)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_validates_custom_dreamsign_and_selection(self) -> None:
        request_data = request()
        output_data = output()
        replace_action(
            request_data,
            output_data,
            0,
            49,
            "Gain {count} copies of $DECK_CARD",
            {
                "label": "Echo a Companion",
                "template_id": 49,
                "template": "Gain {count} copies of $DECK_CARD",
                "variables": {"count": 2},
                "selection": {"$DECK_CARD": {"predicate": "Character"}},
                "effect_text": "Gain 2 copies of a Character from your deck",
            },
        )
        replace_action(
            request_data,
            output_data,
            1,
            31,
            "Gain $CUSTOM_DREAMSIGN",
            {
                "label": "Keep the Omen",
                "template_id": 31,
                "template": "Gain $CUSTOM_DREAMSIGN",
                "variables": {
                    "custom_dreamsign": {
                        "id": "66666666-6666-4666-8666-666666666666",
                        "name": "Synthetic Omen",
                        "rendered_text": "Your first character costs 1● less.",
                    }
                },
                "effect_text": "Gain Synthetic Omen",
            },
        )
        result = self.run_validator(request_data, output_data)
        self.assertEqual(result.returncode, 0, result.stderr)

        output_data[0]["actions"][1]["variables"]["custom_dreamsign"]["id"] = (
            "22222222-2222-4222-8222-222222222222"
        )
        result = self.run_validator(request_data, output_data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be a new UUID", result.stderr)

        output_data[0]["actions"][1]["variables"]["custom_dreamsign"]["id"] = (
            "66666666-6666-4666-8666-666666666666"
        )
        output_data[0]["actions"][0]["selection"] = {
            "$OFFERED_CARD": {"predicate": "Character"}
        }
        result = self.run_validator(request_data, output_data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("is not present in the template", result.stderr)

    def test_rejects_noncanonical_transfiguration(self) -> None:
        request_data = request()
        output_data = output()
        replace_action(
            request_data,
            output_data,
            0,
            18,
            "Apply {transfiguration} to a chosen card",
            {
                "label": "Reshape a Memory",
                "template_id": 18,
                "template": "Apply {transfiguration} to a chosen card",
                "variables": {"transfiguration": "Invented"},
                "effect_text": "Apply Invented to a chosen card",
            },
        )
        result = self.run_validator(request_data, output_data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be a canonical transfiguration", result.stderr)

    def test_rejects_long_prose(self) -> None:
        data = output()
        data[0]["prose"] = " ".join(["dream"] * 21)
        result = self.run_validator(request(), data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("at most 20 words", result.stderr)

    def test_validates_resolution_length(self) -> None:
        data = output()
        del data[0]["actions"][0]["resolution"]
        result = self.run_validator(request(), data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("resolution: must be a non-empty string", result.stderr)

        data = output()
        data[0]["actions"][0]["resolution"] = "Too brief"
        result = self.run_validator(request(), data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must contain 5 to 10 words", result.stderr)

        data[0]["actions"][0]["resolution"] = " ".join(["word"] * 11)
        result = self.run_validator(request(), data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must contain 5 to 10 words", result.stderr)

    def test_accepts_five_word_action_label(self) -> None:
        data = output()
        data[0]["actions"][0]["label"] = "Call the Distant Figures Near"
        result = self.run_validator(request(), data)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_requires_mechanical_connection_score(self) -> None:
        data = output()
        del data[0]["scores"]["mechanical_connection"]
        result = self.run_validator(request(), data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("mechanical_connection: must be an integer", result.stderr)

    def test_weights_mechanical_connection_in_overall_score(self) -> None:
        data = output()
        data[0]["scores"]["mechanical_connection"] = 1
        result = self.run_validator(request(), data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("40/15/30/15 weighted score", result.stderr)

    def test_accepts_rank_order_independent_of_input_pair_order(self) -> None:
        data = output()
        rank_by_pair = {"pair-1": 2, "pair-2": 5, "pair-3": 1, "pair-4": 4, "pair-5": 3}
        for event in data:
            event["rank"] = rank_by_pair[event["template_pair_id"]]
            for key in (
                "scene_quality",
                "action_quality",
                "mechanical_connection",
                "archetype_fit",
                "overall",
            ):
                event["scores"][key] = 8
        data.sort(key=lambda event: event["rank"])

        result = self.run_validator(request(), data)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_events_not_sorted_by_rank(self) -> None:
        data = output()
        data[0], data[1] = data[1], data[0]
        result = self.run_validator(request(), data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be sorted by ascending rank", result.stderr)


if __name__ == "__main__":
    unittest.main()
