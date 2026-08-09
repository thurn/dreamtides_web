#!/usr/bin/env python3
"""Synthetic tests for the one-pass Exploration encounter pipeline."""

from __future__ import annotations

import json
import tempfile
import unittest
import uuid
from pathlib import Path

from assemble_designs import AssemblyError, assemble
from mechanic_ideas import action_effect_schema, load_mechanic_catalog, render_markdown
from select_batch import SOURCE_KEYS, SelectionError, create_batch, parse_args
from verify_live import VerificationError, verify


LIVE_CARD_ID = "11111111-1111-4111-8111-111111111111"
NEW_CARD_ID = "22222222-2222-4222-8222-222222222222"
DREAMSIGN_ID = "33333333-3333-4333-8333-333333333333"
LIVE_ACTION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
ACTION_ONE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ACTION_TWO_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


class PipelineFixture:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.run_dir = root / "run"
        self.run_dir.mkdir()
        self.images = root / "images"
        self.images.mkdir()
        (self.images / "stock-photo-live-111.jpg").write_bytes(b"live art")
        (self.images / "stock-photo-new-222.jpg").write_bytes(b"new art")

        self.cards_source = root / "cards.ron"
        self.cards_source.write_text("[]\n", encoding="utf-8")
        self.cards_compat = root / "cards.toml"
        self.cards_compat.write_text(
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
        self.dreamsigns_source = root / "dreamsigns.ron"
        self.dreamsigns_source.write_text("[]\n", encoding="utf-8")
        self.dreamsigns_compat = root / "dreamsigns.toml"
        self.dreamsigns_compat.write_text(
            f'''[[dreamsign]]
id = "{DREAMSIGN_ID}"
name = "Test Sign"
''',
            encoding="utf-8",
        )
        self.exploration_source = root / "exploration.ron"
        self.exploration_source.write_text("[]\n", encoding="utf-8")
        self.exploration_compat = root / "exploration.toml"
        self.exploration_compat.write_text(
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
''',
            encoding="utf-8",
        )
        self.transfiguration_source = root / "transfiguration.ron"
        self.transfiguration_source.write_text("()\n", encoding="utf-8")
        self.transfiguration_compat = root / "transfiguration.toml"
        self.transfiguration_compat.write_text(
            '''[[forms]]
id = "Empowered"
name = "Empowered"
''',
            encoding="utf-8",
        )
        self.exploration_model = root / "exploration.rs"
        self.exploration_model.write_text(
            '''pub enum ActionEffect {
    DraftCard {
        predicate: Predicate,
        count: i64,
        offer_count: i64,
    },
    GainNamedCard {
        card_id: String,
    },
}
''',
            encoding="utf-8",
        )
        self.mechanic_ideas = root / "mechanic-ideas.json"
        self.mechanic_ideas.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "purpose": "Synthetic design-only mechanic ideas.",
                    "mechanics": [
                        {
                            "id": 14,
                            "concept": "Draft a {predicate} from {offer_count} choices",
                            "balance_class": "standard",
                            "implementation": {
                                "status": "reuse",
                                "effect_variant": "DraftCard",
                                "runtime_effect_kind": "draft-card",
                            },
                        },
                        {
                            "id": 10,
                            "concept": "Gain {card_id}",
                            "balance_class": "standard",
                            "implementation": {
                                "status": "reuse",
                                "effect_variant": "GainNamedCard",
                                "runtime_effect_kind": "gain-card",
                            },
                        },
                        {
                            "id": 90,
                            "concept": "Gain a future reward",
                            "balance_class": "unique_effect",
                            "implementation": {"status": "vertical_slice"},
                        },
                    ],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        self.effect_schema = root / "effect-schema.mjs"
        self.effect_schema.write_text("export const schema = [];\n", encoding="utf-8")
        self.source_paths = {
            "cards_source": self.cards_source,
            "cards_compat": self.cards_compat,
            "dreamsigns_source": self.dreamsigns_source,
            "dreamsigns_compat": self.dreamsigns_compat,
            "exploration_source": self.exploration_source,
            "exploration_compat": self.exploration_compat,
            "transfiguration_source": self.transfiguration_source,
            "transfiguration_compat": self.transfiguration_compat,
            "mechanic_ideas": self.mechanic_ideas,
            "exploration_model": self.exploration_model,
            "effect_schema": self.effect_schema,
        }
        self.selection: dict | None = None

    def select(self) -> dict:
        self.selection = create_batch(
            run_dir=self.run_dir,
            batch_size=5,
            seed=None,
            requested_card_ids=[NEW_CARD_ID],
            source_paths=self.source_paths,
            images_dir=self.images,
        )
        manifest = json.loads(Path(self.selection["manifest"]).read_text())
        manifest["cards"][0]["action_ids"] = [ACTION_ONE_ID, ACTION_TWO_ID]
        request_path = self.run_dir / "requests" / f"{NEW_CARD_ID}.json"
        request = json.loads(request_path.read_text())
        request["action_ids"] = [ACTION_ONE_ID, ACTION_TWO_ID]
        request_path.write_text(json.dumps(request, indent=2) + "\n", encoding="utf-8")
        Path(self.selection["manifest"]).write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )
        return self.selection

    def valid_result(self) -> dict:
        notes = {
            "state_transition": "Add the selected card UUID to the deck.",
            "offer_or_selection": "Mint four eligible UUIDs and select one UUID.",
            "persisted_result": "Persist offered and selected card UUIDs.",
            "outcome": "Present the exact gained card.",
        }
        named_notes = {
            "state_transition": "Add the fixed card UUID to the deck.",
            "offer_or_selection": "No offer or selection is required.",
            "persisted_result": "Persist the gained card UUID.",
            "outcome": "Present the exact gained card.",
        }
        return {
            "card_id": NEW_CARD_ID,
            "prose": "A bronze wolf watches embers drift across black grass.",
            "actions": [
                {
                    "action_id": ACTION_ONE_ID,
                    "label": "Follow fading tracks",
                    "mechanic_id": 14,
                    "presentation": {
                        "effect_text": "Draft a Warrior from 4 choices",
                        "followup": {
                            "title": "{action-label}",
                            "subtitle": "Choose one offered card.",
                        },
                    },
                    "effect": {
                        "variant": "DraftCard",
                        "fields": {"predicate": "Warrior", "count": 1, "offer_count": 4},
                        "runtime_effect_kind": "draft-card",
                    },
                    "implementation_notes": notes,
                },
                {
                    "action_id": ACTION_TWO_ID,
                    "label": "Welcome known guide",
                    "mechanic_id": 10,
                    "presentation": {"effect_text": "Gain {fixed_card}", "followup": None},
                    "effect": {
                        "variant": "GainNamedCard",
                        "fields": {"card_id": LIVE_CARD_ID},
                        "runtime_effect_kind": "gain-card",
                    },
                    "implementation_notes": named_notes,
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

    def assemble(self) -> tuple[Path, Path]:
        assert self.selection is not None
        workset = self.run_dir / "encounter-workset.json"
        display = self.run_dir / "display.md"
        assemble(
            manifest_path=Path(self.selection["manifest"]),
            results_dir=self.run_dir / "results",
            workset_output=workset,
            display_output=display,
        )
        return workset, display

    def implemented_toml(self, workset: Path) -> Path:
        document = json.loads(workset.read_text())
        encounter = document["encounters"][0]
        first, second = encounter["actions"]
        live_path = self.root / "implemented.toml"
        live_path.write_text(
            f'''schema-version = 2
effect-kinds = ["draft-card", "gain-card"]

[[encounter]]
card-id = "{LIVE_CARD_ID}"
prose = "Already live."

[[encounter.action]]
id = "{LIVE_ACTION_ID}"
label = "Take first"
effect-text = "Draft a card"
effect-kind = "draft-card"

[[encounter]]
card-id = "{NEW_CARD_ID}"
prose = "{encounter['prose']}"

[[encounter.action]]
id = "{first['action_id']}"
label = "{first['label']}"
effect-text = "{first['presentation']['effect_text']}"
followup-title = "{first['presentation']['followup']['title']}"
followup-subtitle = "{first['presentation']['followup']['subtitle']}"
effect-kind = "draft-card"
predicate = "warrior"
count = 1
offer-count = 4

[[encounter.action]]
id = "{second['action_id']}"
label = "{second['label']}"
effect-text = "{second['presentation']['effect_text']}"
effect-kind = "gain-card"
card-id = "{LIVE_CARD_ID}"
''',
            encoding="utf-8",
        )
        return live_path


class OnePassPipelineTests(unittest.TestCase):
    def test_selector_defaults_to_five_random_cards(self) -> None:
        args = parse_args(["--run-dir", "/tmp/synthetic-exploration-run"])

        self.assertEqual(args.batch_size, 5)
        self.assertIsNone(args.seed)
        self.assertEqual(args.card_id, [])

    def test_selects_only_absent_cards_and_mints_two_action_uuidv4s(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            report = create_batch(
                run_dir=fixture.run_dir,
                batch_size=5,
                seed=None,
                requested_card_ids=[NEW_CARD_ID],
                source_paths=fixture.source_paths,
                images_dir=fixture.images,
            )
            request = json.loads(
                (fixture.run_dir / "requests" / f"{NEW_CARD_ID}.json").read_text()
            )
            self.assertEqual(report["card_ids"], [NEW_CARD_ID])
            self.assertEqual(len(set(request["action_ids"])), 2)
            self.assertTrue(all(uuid.UUID(value).version == 4 for value in request["action_ids"]))
            self.assertEqual(set(request["repository"]), set(SOURCE_KEYS))

    def test_rejects_an_explicit_live_uuid(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            with self.assertRaisesRegex(SelectionError, "already represented"):
                create_batch(
                    run_dir=fixture.run_dir,
                    batch_size=5,
                    seed=None,
                    requested_card_ids=[LIVE_CARD_ID],
                    source_paths=fixture.source_paths,
                    images_dir=fixture.images,
                )

    def test_assembles_a_typed_json_workset(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            fixture.select()
            fixture.write_result()
            workset, display = fixture.assemble()

            document = json.loads(workset.read_text())
            action = document["encounters"][0]["actions"][0]
            self.assertEqual(action["action_id"], ACTION_ONE_ID)
            self.assertEqual(action["implementation_status"], "reuse")
            self.assertEqual(action["expected_live_fields"]["offer-count"], 4)
            self.assertNotIn("template_id", workset.read_text())
            self.assertIn("***Follow fading tracks*** — Draft a Warrior", display.read_text())

    def test_rejects_a_stale_source_before_writing_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            fixture.select()
            fixture.write_result()
            fixture.effect_schema.write_text("changed\n", encoding="utf-8")
            with self.assertRaisesRegex(AssemblyError, "source changed"):
                fixture.assemble()

    def test_rejects_an_action_id_not_minted_for_the_request(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            fixture.select()
            result = fixture.valid_result()
            result["actions"][0]["action_id"] = str(uuid.uuid4())
            fixture.write_result(result)
            with self.assertRaisesRegex(AssemblyError, "pre-minted request UUID"):
                fixture.assemble()

    def test_rejects_the_wrong_variant_for_a_reuse_mechanic(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            fixture.select()
            result = fixture.valid_result()
            result["actions"][0]["effect"] = {
                "variant": "GainNamedCard",
                "fields": {"card_id": LIVE_CARD_ID},
                "runtime_effect_kind": "draft-card",
            }
            fixture.write_result(result)
            with self.assertRaisesRegex(AssemblyError, "must equal DraftCard"):
                fixture.assemble()

    def test_accepts_a_vertical_slice_that_extends_a_current_variant(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            fixture.select()
            result = fixture.valid_result()
            result["actions"][0].update(
                {
                    "mechanic_id": 90,
                    "effect": {
                        "variant": "DraftCard",
                        "fields": {
                            "predicate": "Warrior",
                            "count": 1,
                            "offer_count": 4,
                            "future_reward_count": 2,
                        },
                        "runtime_effect_kind": "draft-card-with-future-reward",
                    },
                }
            )
            fixture.write_result(result)
            workset, _ = fixture.assemble()
            action = json.loads(workset.read_text())["encounters"][0]["actions"][0]
            self.assertEqual(action["implementation_status"], "vertical_slice")
            self.assertNotIn("expected_live_fields", action)

    def test_verifies_runtime_complete_live_actions_and_allows_one_action_elsewhere(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            fixture.select()
            fixture.write_result()
            workset, _ = fixture.assemble()
            report = verify(workset, fixture.implemented_toml(workset))
            self.assertEqual(report["verified_card_ids"], [NEW_CARD_ID])

    def test_rejects_a_changed_lowered_field(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            fixture.select()
            fixture.write_result()
            workset, _ = fixture.assemble()
            live = fixture.implemented_toml(workset)
            live.write_text(live.read_text().replace("offer-count = 4", "offer-count = 3"))
            with self.assertRaisesRegex(VerificationError, "lowered field offer-count"):
                verify(workset, live)

    def test_rejects_more_than_four_live_actions(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            fixture.select()
            fixture.write_result()
            workset, _ = fixture.assemble()
            live = fixture.implemented_toml(workset)
            extra = ""
            for index in range(3):
                extra += f'''\n[[encounter.action]]
id = "{uuid.uuid4()}"
label = "Extra action"
effect-text = "Extra"
effect-kind = "gain-card"
'''
            live.write_text(live.read_text() + extra, encoding="utf-8")
            with self.assertRaisesRegex(VerificationError, "between one and four"):
                verify(workset, live)


class MechanicCatalogTests(unittest.TestCase):
    def test_model_parser_tracks_variant_field_names(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            self.assertEqual(
                action_effect_schema(fixture.exploration_model)["DraftCard"],
                {"predicate", "count", "offer_count"},
            )

    def test_markdown_renderer_matches_catalog(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PipelineFixture(Path(temporary))
            catalog = load_mechanic_catalog(
                fixture.mechanic_ideas, model_path=fixture.exploration_model
            )
            markdown = render_markdown(catalog)
            self.assertIn("| 14 | Draft a {predicate}", markdown)
            self.assertIn("reuse `DraftCard`", markdown)

    def test_checked_in_library_preserves_the_complete_idea_set(self) -> None:
        skill_dir = Path(__file__).resolve().parent.parent
        catalog = load_mechanic_catalog(skill_dir / "references/mechanic-ideas.json")
        ids = {mechanic["id"] for mechanic in catalog["mechanics"]}

        recovered_ids = set(range(1, 85)) - {26, 31}
        self.assertTrue(recovered_ids.issubset(ids))
        self.assertGreaterEqual(len(catalog["mechanics"]), 82)
        self.assertEqual(
            render_markdown(catalog),
            (skill_dir / "references/mechanic-ideas.md").read_text(encoding="utf-8"),
        )


if __name__ == "__main__":
    unittest.main()
