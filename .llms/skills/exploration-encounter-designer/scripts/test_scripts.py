#!/usr/bin/env python3
"""Focused tests for Exploration Encounter Designer helper scripts."""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from template_rendering import render_template


SCRIPTS_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPTS_DIR.parent
GENERATOR = SCRIPTS_DIR / "generate-exploration-input.py"
VALIDATOR = SCRIPTS_DIR / "validate-exploration.py"
CANDIDATE_LISTER = SCRIPTS_DIR / "list-template-candidates.py"
TEMPLATE_CATALOG = SCRIPTS_DIR.parents[3] / "data/templates.json"


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


class ListTemplateCandidatesTests(unittest.TestCase):
    def run_lister(
        self,
        templates: list[dict[str, object]],
        encounter_template_uses: list[list[int]],
        required_template_count: int = 2,
    ) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            catalog_path = root / "templates.json"
            catalog_path.write_text(json.dumps(templates), encoding="utf-8")
            exploration_path = root / "exploration.toml"
            exploration_lines: list[str] = []
            for encounter_index, template_uses in enumerate(
                encounter_template_uses
            ):
                exploration_lines.extend(
                    [
                        "[[encounter]]",
                        f'card-id = "synthetic-card-{encounter_index}"',
                    ]
                )
                for template_id in template_uses:
                    exploration_lines.extend(
                        [
                            "[[encounter.action]]",
                            f"template-id = {template_id}",
                        ]
                    )
            exploration_path.write_text(
                "\n".join(exploration_lines), encoding="utf-8"
            )
            return subprocess.run(
                [
                    sys.executable,
                    str(CANDIDATE_LISTER),
                    "--template-catalog",
                    str(catalog_path),
                    "--exploration-data",
                    str(exploration_path),
                    "--required-template-count",
                    str(required_template_count),
                ],
                capture_output=True,
                text=True,
                check=False,
            )

    @staticmethod
    def synthetic_templates(count: int) -> list[dict[str, object]]:
        return [
            {"template_id": index, "template": f"Synthetic template {index}"}
            for index in range(1, count + 1)
        ]

    def test_prints_all_templates_when_no_usage_exists(self) -> None:
        result = self.run_lister(self.synthetic_templates(4), [])

        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(
            [entry["template_id"] for entry in output["templates"]],
            [1, 2, 3, 4],
        )
        self.assertEqual(output["balance"]["soft_warnings"], [])
        self.assertEqual(output["balance"]["omitted_templates"], [])
        self.assertEqual(
            output["template_diagnostics"],
            [
                {
                    "template_id": template_id,
                    "template": f"Synthetic template {template_id}",
                    "required_variables": [],
                    "special_variables": [],
                    "usage_count": 0,
                    "status": "unused",
                    "reasons": [],
                }
                for template_id in range(1, 5)
            ],
        )

    def test_reports_exact_variables_for_each_template(self) -> None:
        templates = self.synthetic_templates(2)
        templates[0]["template"] = (
            "Gain {essence_per_energy} essence for $OFFERED_CARD"
        )
        result = self.run_lister(templates, [])

        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        by_id = {entry["template_id"]: entry for entry in output["templates"]}
        self.assertEqual(
            by_id[1]["required_variables"], ["essence_per_energy"]
        )
        self.assertEqual(by_id[1]["special_variables"], ["$OFFERED_CARD"])
        self.assertEqual(by_id[2]["required_variables"], [])
        self.assertEqual(by_id[2]["special_variables"], [])

    def test_warns_then_omits_above_the_least_used_template(self) -> None:
        templates = self.synthetic_templates(6)
        templates[-1]["template"] = "Gain $SYNTHETIC_CARD"
        result = self.run_lister(templates, [[1, 1, 1, 2, 2, 3]])

        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        balance = output["balance"]
        self.assertEqual(balance["mean_uses_per_template"], 1.0)
        self.assertEqual(balance["minimum_uses_per_template"], 0)
        self.assertEqual(balance["soft_warning_threshold"], 1)
        self.assertEqual(balance["omission_threshold"], 2)
        self.assertEqual(
            balance["soft_warnings"],
            [
                {
                    "template_id": 3,
                    "usage_count": 1,
                    "reasons": ["production"],
                }
            ],
        )
        self.assertEqual(
            balance["omitted_templates"],
            [
                {
                    "template_id": 1,
                    "usage_count": 3,
                    "reasons": ["production"],
                },
                {
                    "template_id": 2,
                    "usage_count": 2,
                    "reasons": ["production"],
                },
            ],
        )
        self.assertEqual(
            [entry["template_id"] for entry in output["templates"]],
            [4, 5, 6, 3],
        )
        self.assertEqual(
            {
                entry["template_id"]: entry["status"]
                for entry in output["template_diagnostics"]
            },
            {1: "hidden", 2: "hidden", 3: "warning", 4: "unused", 5: "unused", 6: "unused"},
        )
        self.assertEqual(output["special_variables"], ["$SYNTHETIC_CARD"])

    def test_unique_effects_hide_at_the_normal_warning_threshold(self) -> None:
        templates = self.synthetic_templates(6)
        templates[0]["balance_class"] = "unique_effect"
        result = self.run_lister(
            templates,
            [[1], [2]],
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        balance = output["balance"]
        self.assertEqual(balance["soft_warning_threshold"], 1)
        self.assertEqual(balance["omission_threshold"], 2)
        self.assertEqual(balance["unique_effect_omission_threshold"], 1)
        self.assertEqual(
            balance["omitted_templates"],
            [
                {
                    "template_id": 1,
                    "usage_count": 1,
                    "reasons": ["production"],
                }
            ],
        )
        self.assertEqual(
            balance["soft_warnings"],
            [
                {
                    "template_id": 2,
                    "usage_count": 1,
                    "reasons": ["production"],
                }
            ],
        )

    def test_retains_minimum_candidate_pool_under_extreme_skew(self) -> None:
        result = self.run_lister(
            self.synthetic_templates(12),
            [[template_id for template_id in range(1, 10) for _ in range(8)]],
            required_template_count=10,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(len(output["templates"]), 10)
        self.assertEqual(
            [
                entry["template_id"]
                for entry in output["balance"][
                    "reintroduced_to_preserve_minimum_pool"
                ]
            ],
            [1, 2, 3, 4, 5, 6, 7],
        )
        self.assertEqual(
            output["balance"]["omitted_templates"],
            [
                {
                    "template_id": 8,
                    "usage_count": 8,
                    "reasons": ["production"],
                },
                {
                    "template_id": 9,
                    "usage_count": 8,
                    "reasons": ["production"],
                },
            ],
        )
        self.assertEqual(
            {
                entry["template_id"]: entry["status"]
                for entry in output["template_diagnostics"]
                if entry["template_id"] <= 9
            },
            {
                1: "reintroduced",
                2: "reintroduced",
                3: "reintroduced",
                4: "reintroduced",
                5: "reintroduced",
                6: "reintroduced",
                7: "reintroduced",
                8: "hidden",
                9: "hidden",
            },
        )

    def test_scales_balance_thresholds_at_one_hundred_cards(self) -> None:
        template_uses = [(index % 70) + 1 for index in range(1000)]
        template_uses[19] = 1
        cards = [
            template_uses[index : index + 10]
            for index in range(0, len(template_uses), 10)
        ]
        result = self.run_lister(
            self.synthetic_templates(70),
            cards,
            required_template_count=10,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        balance = output["balance"]
        self.assertEqual(balance["production_encounters"], 100)
        self.assertEqual(balance["recorded_template_uses"], 1000)
        self.assertEqual(balance["mean_uses_per_template"], 14.286)
        self.assertEqual(balance["minimum_uses_per_template"], 14)
        self.assertEqual(balance["soft_warning_threshold"], 15)
        self.assertEqual(balance["omission_threshold"], 16)
        self.assertEqual(
            balance["omitted_templates"],
            [
                {
                    "template_id": 1,
                    "usage_count": 16,
                    "reasons": ["production"],
                }
            ],
        )
        self.assertEqual(
            [warning["template_id"] for warning in balance["soft_warnings"]],
            list(range(2, 20)),
        )

    def test_fair_share_prevents_a_rare_template_from_freezing_progress(self) -> None:
        cards = [
            [
                ((card_index * 10 + action_index) % 60) + 1
                for action_index in range(10)
            ]
            for card_index in range(100)
        ]
        result = self.run_lister(
            self.synthetic_templates(70),
            cards,
            required_template_count=10,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        balance = output["balance"]
        self.assertEqual(balance["production_encounters"], 100)
        self.assertEqual(balance["minimum_uses_per_template"], 0)
        self.assertEqual(balance["mean_uses_per_template"], 14.286)
        self.assertEqual(balance["soft_warning_threshold"], 15)
        self.assertEqual(balance["omission_threshold"], 16)


class ValidateExplorationTests(unittest.TestCase):
    def test_canonical_catalog_excludes_custom_content_templates(self) -> None:
        templates = json.loads(TEMPLATE_CATALOG.read_text(encoding="utf-8"))
        template_ids = {entry["template_id"] for entry in templates}

        self.assertNotIn(26, template_ids)
        self.assertNotIn(31, template_ids)

    def test_authoring_docs_do_not_nominate_catalog_templates(self) -> None:
        templates = json.loads(TEMPLATE_CATALOG.read_text(encoding="utf-8"))
        canonical_by_id = {
            entry["template_id"]: entry["template"] for entry in templates
        }
        documentation = "\n".join(
            path.read_text(encoding="utf-8")
            for path in [
                SKILL_DIR / "SKILL.md",
                *sorted((SKILL_DIR / "references").glob("*.md")),
            ]
        )

        documented_ids = {
            int(match)
            for match in re.findall(r'"template_id"\s*:\s*(\d+)', documentation)
        }
        leaked_ids = documented_ids.intersection(canonical_by_id)
        leaked_templates = {
            template_id: template
            for template_id, template in canonical_by_id.items()
            if template in documentation
        }

        self.assertEqual(leaked_ids, set())
        self.assertEqual(leaked_templates, {})

    def run_validator(
        self,
        template_ids: list[int],
        legacy_field: str | None = None,
    ) -> subprocess.CompletedProcess[str]:
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
                            {"template_id": template_ids[index * 2]},
                            {"template_id": template_ids[index * 2 + 1]},
                        ],
                    }
                    for index in range(5)
                ],
            }
            if legacy_field is not None:
                request["template_pairs"][0]["actions"][0][legacy_field] = (
                    "Copied template text"
                )
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

    def run_output_validator(
        self,
        referenced_card_id: str,
        placeholder: str = "card_id",
        prose: str | None = None,
        label: str = "Take reward",
        variable_value: object | None = None,
        *,
        omit_variable: bool = False,
        extra_variable: tuple[str, object] | None = None,
        derive_template_pairs_from_output: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            templates = [
                {
                    "template_id": index,
                    "template": (
                        f"Reference {{{placeholder}}}"
                        if index == 1
                        else f"Synthetic template {index}"
                    ),
                }
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

[[cards]]
id = "33333333-3333-4333-8333-333333333333"
name = "Synthetic Animal"
rendered-text = "Gain 2 energy."
image-number = 654321
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
                            {"template_id": action["template_id"]}
                            for action in templates[index * 2 : index * 2 + 2]
                        ],
                    }
                    for index in range(5)
                ],
            }
            events = []
            for event_index, pair in enumerate(request["template_pairs"]):
                actions = []
                for action in pair["actions"]:
                    variables = {}
                    if action["template_id"] == 1 and not omit_variable:
                        variables[placeholder] = (
                            {
                                "id": referenced_card_id,
                                "display_name": "Synthetic Animal",
                            }
                            if variable_value is None
                            else variable_value
                        )
                    if action["template_id"] == 1 and extra_variable is not None:
                        extra_name, extra_value = extra_variable
                        variables[extra_name] = extra_value
                    actions.append(
                        {
                            "template_id": action["template_id"],
                            "label": label,
                            "variables": variables,
                        }
                    )
                events.append(
                    {
                        "template_pair_id": pair["id"],
                        "prose": prose
                        or f"A synthetic scene waits here number {event_index + 1}",
                        "actions": actions,
                        "scores": {
                            "scene_quality": 8,
                            "action_quality": 8,
                            "mechanical_connection": 8,
                            "archetype_fit": 8,
                            "overall": 8,
                        },
                        "rank": event_index + 1,
                        "ranking_rationale": "A concise synthetic rationale supports this rank.",
                    }
                )
            input_path = root / "request.json"
            validation_input = (
                {"card": request["card"]}
                if derive_template_pairs_from_output
                else request
            )
            input_path.write_text(json.dumps(validation_input), encoding="utf-8")
            output_path = root / "events.json"
            output_path.write_text(json.dumps(events), encoding="utf-8")
            command = [
                sys.executable,
                str(VALIDATOR),
                "--input",
                str(input_path),
                "--output",
                str(output_path),
            ]
            if derive_template_pairs_from_output:
                command.append("--derive-template-pairs-from-output")
            command.extend(
                [
                    "--template-catalog",
                    str(catalog_path),
                    "--cards-data",
                    str(cards_path),
                    "--dreamsigns-data",
                    str(dreamsigns_path),
                    "--transfigurations-data",
                    str(transfigurations_path),
                ]
            )
            return subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=False,
            )

    def test_accepts_ten_distinct_templates(self) -> None:
        result = self.run_validator(list(range(1, 11)))
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_renderer_substitutes_braced_variables_and_preserves_runtime_tokens(self) -> None:
        self.assertEqual(
            render_template(
                "Draw {count} cards, then gain $OFFERED_CARD",
                {"count": 2},
            ),
            "Draw 2 cards, then gain $OFFERED_CARD",
        )

    def test_rejects_a_template_reused_across_pairs(self) -> None:
        result = self.run_validator([1, 2, 3, 4, 5, 6, 7, 8, 9, 1])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be unique across all pairs", result.stderr)

    def test_rejects_copied_template_text_fields(self) -> None:
        for legacy_field in ("template", "effect_text"):
            with self.subTest(legacy_field=legacy_field):
                result = self.run_validator(list(range(1, 11)), legacy_field)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(
                    f".{legacy_field}: is forbidden",
                    result.stderr,
                )

    def test_rejects_source_card_as_a_template_variable(self) -> None:
        for placeholder in ("card_id", "card_name"):
            with self.subTest(placeholder=placeholder):
                result = self.run_output_validator(
                    "11111111-1111-4111-8111-111111111111",
                    placeholder,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("must not identify the source card", result.stderr)

    def test_accepts_distinct_card_uuid_with_the_same_display_name(self) -> None:
        result = self.run_output_validator(
            "33333333-3333-4333-8333-333333333333"
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_validates_exact_output_from_a_card_only_request(self) -> None:
        result = self.run_output_validator(
            "33333333-3333-4333-8333-333333333333",
            derive_template_pairs_from_output=True,
        )

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_a_missing_required_variable(self) -> None:
        result = self.run_output_validator(
            "33333333-3333-4333-8333-333333333333",
            placeholder="essence_per_energy",
            omit_variable=True,
            derive_template_pairs_from_output=True,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("is missing {essence_per_energy}", result.stderr)

    def test_rejects_a_variable_absent_from_the_template(self) -> None:
        result = self.run_output_validator(
            "33333333-3333-4333-8333-333333333333",
            placeholder="essence_per_energy",
            variable_value=25,
            extra_variable=("offer_count", 4),
            derive_template_pairs_from_output=True,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "contains values absent from the canonical template: offer_count",
            result.stderr,
        )

    def test_rejects_non_integer_values_for_editable_mechanical_placeholders(self) -> None:
        for placeholder in (
            "essence_per_spark",
            "energy_cost_reduction",
            "nightmare_count",
            "offer_count",
            "pack_count",
            "pack_size",
            "spark_bonus",
        ):
            with self.subTest(placeholder=placeholder):
                result = self.run_output_validator(
                    "33333333-3333-4333-8333-333333333333",
                    placeholder=placeholder,
                    variable_value="not a number",
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("must be an integer", result.stderr)

    def test_rejects_player_references_in_prose(self) -> None:
        for prose in (
            "You watch a silver owl spread its wings",
            "A silver owl spreads its wings above your head",
            "The player watches a silver owl spread its wings",
            "A silver owl spreads its wings before the viewer",
        ):
            with self.subTest(prose=prose):
                result = self.run_output_validator(
                    "33333333-3333-4333-8333-333333333333",
                    prose=prose,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(
                    "must use entity-focused third-person prose",
                    result.stderr,
                )

    def test_rejects_the_definite_article_anywhere_in_prose(self) -> None:
        for prose in (
            "The owl clutches the branch",
            "The silver owl spreads broad wings beneath stars",
            "A silver owl grips the branch beneath stars",
        ):
            with self.subTest(prose=prose):
                result = self.run_output_validator(
                    "33333333-3333-4333-8333-333333333333",
                    prose=prose,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(
                    "must not use the definite article 'the'", result.stderr
                )

    def test_allows_one_after_an_introduced_subject(self) -> None:
        result = self.run_output_validator(
            "33333333-3333-4333-8333-333333333333",
            prose="A silver owl raises one wing beneath stars",
        )

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_accepts_clear_subject_introductions_without_a_or_an(self) -> None:
        for prose in (
            "An owl clutches a branch",
            "Luminous seams cross silver plating beneath stars",
            "Three silver owls spread broad wings beneath stars",
            "Moonlight gleams across feathered wings beneath stars",
        ):
            with self.subTest(prose=prose):
                result = self.run_output_validator(
                    "33333333-3333-4333-8333-333333333333",
                    prose=prose,
                )
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_one_as_a_singular_subject_introduction(self) -> None:
        result = self.run_output_validator(
            "33333333-3333-4333-8333-333333333333",
            prose="One silver owl spreads broad wings beneath stars",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must not begin with 'one'", result.stderr)

    def test_rejects_synth_as_scene_taxonomy(self) -> None:
        for field, value in (
            ("prose", "A seated synth raises an open palm beneath a deep hood"),
            ("label", "Welcome the synth"),
        ):
            with self.subTest(field=field):
                result = self.run_output_validator(
                    "33333333-3333-4333-8333-333333333333",
                    **{field: value},
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("card taxonomy word 'synth'", result.stderr)


if __name__ == "__main__":
    unittest.main()
