use std::collections::BTreeSet;
use std::fs;
use std::io::Write;
use std::path::Path;

use anyhow::{Context, Result, bail};
use ron::extensions::Extensions;
use ron::ser::PrettyConfig;
use serde::Deserialize;
use serde_json::Value as JsonValue;

use crate::compiler::{EditReport, sha256};
use crate::manifest::Manifest;
use crate::models::cards::{CardDefinition, CardKind, Crop, OrbValue};
use crate::models::compat::CompatDocument;
use crate::models::exploration::{
    ActionDefinition, ActionEffect, DynamicValue, EffectKind, ExplorationCatalog, Predicate,
    TemplateInvocation,
};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct EditRequest {
    dataset: String,
    operations: Vec<EditOperation>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
enum EditOperation {
    SetCardField {
        card_id: String,
        field: String,
        value: JsonValue,
    },
    UpsertFacet {
        facet: Facet,
        name: String,
        color: String,
    },
    DeleteFacet {
        facet: Facet,
        name: String,
    },
    SetEncounterProse {
        card_id: String,
        prose: String,
    },
    ReplaceAction {
        card_id: String,
        slot: usize,
        expected_action_id: String,
        action: JsonValue,
    },
    ReplaceTemplate {
        template_id: i64,
        actions: Vec<TemplateActionEdit>,
    },
    AdoptStagedCompatibility {
        output_sha256: String,
    },
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct TemplateActionEdit {
    card_id: String,
    slot: usize,
    expected_action_id: String,
    action: JsonValue,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Facet {
    Tags,
    Tides,
}

pub fn stage_edit(
    _root: &Path,
    manifest: &Manifest,
    staging_root: &Path,
    body: &str,
) -> Result<EditReport> {
    let request: EditRequest = serde_json::from_str(body)
        .context("INVALID_EDIT: request must match the closed editor operation schema")?;
    manifest.dataset(&request.dataset)?;
    match request.dataset.as_str() {
        "cards" => edit_cards(manifest, staging_root, request.operations),
        "exploration" => edit_exploration(manifest, staging_root, request.operations),
        dataset => edit_compat(manifest, staging_root, dataset, request.operations),
    }
}

fn edit_compat(
    manifest: &Manifest,
    staging_root: &Path,
    dataset_id: &str,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let dataset = manifest.dataset(dataset_id)?;
    if dataset.adapter != "compat_v1"
        || dataset.editor != crate::manifest::EditorCapability::Semantic
    {
        bail!("FIELD_NOT_APPLICABLE: stage-edit is not registered for dataset {dataset_id}");
    }
    if operations.len() != 1 {
        bail!("INVALID_EDIT: compatibility editor saves require one declared operation");
    }
    let expected_hash = match operations.into_iter().next().unwrap() {
        EditOperation::AdoptStagedCompatibility { output_sha256 } => output_sha256,
        _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to {dataset_id}"),
    };
    let output_path = staging_root.join(&dataset.output);
    let output = fs::read(&output_path)?;
    if sha256(&output) != expected_hash {
        bail!("STALE_SOURCE: staged compatibility output changed before adoption");
    }
    let compatibility: toml::Value =
        toml::from_str(std::str::from_utf8(&output)?).with_context(|| {
            format!(
                "COMPATIBILITY_VALIDATION_FAILED: parse staged {}",
                dataset.output
            )
        })?;
    let source_path = staging_root.join(&dataset.source);
    let original: CompatDocument = ron::from_str(&fs::read_to_string(&source_path)?)
        .with_context(|| format!("MALFORMED_SOURCE: staged {} is invalid", dataset.source))?;
    let intended = CompatDocument {
        data: compatibility,
    };
    let changed = intended != original;
    if changed {
        let text = serialize_ron(&intended, false)?;
        verify_round_trip::<CompatDocument>(&text, &intended)?;
        atomic_write(&source_path, text.as_bytes())?;
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: dataset_id.into(),
        source_revision: revision(staging_root, manifest, &[dataset_id])?,
    })
}

fn edit_cards(
    manifest: &Manifest,
    staging_root: &Path,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let cards_dataset = manifest.dataset("cards")?;
    let cards_path = staging_root.join(&cards_dataset.source);
    let original_text = fs::read_to_string(&cards_path)
        .with_context(|| format!("read staged Cards source {}", cards_path.display()))?;
    let original: Vec<CardDefinition> =
        ron::from_str(&original_text).context("MALFORMED_SOURCE: staged Cards RON is invalid")?;
    reject_duplicate_cards(&original)?;
    let mut cards = original.clone();
    let mut tags = read_compat(manifest, staging_root, "card-tags")?;
    let mut tides = read_compat(manifest, staging_root, "card-tides")?;
    let original_tags = tags.clone();
    let original_tides = tides.clone();

    for operation in operations {
        match operation {
            EditOperation::SetCardField {
                card_id,
                field,
                value,
            } => {
                let card = unique_card_mut(&mut cards, &card_id)?;
                set_card_field(card, &field, value)?;
            }
            EditOperation::UpsertFacet { facet, name, color } => {
                validate_facet(&name, &color)?;
                upsert_facet(
                    match facet {
                        Facet::Tags => &mut tags,
                        Facet::Tides => &mut tides,
                    },
                    facet,
                    name,
                    color,
                )?;
            }
            EditOperation::DeleteFacet { facet, name } => {
                delete_facet(
                    match facet {
                        Facet::Tags => &mut tags,
                        Facet::Tides => &mut tides,
                    },
                    facet,
                    &name,
                )?;
                if matches!(facet, Facet::Tags) {
                    for card in &mut cards {
                        card.tags.retain(|tag| tag != &name);
                    }
                }
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to Cards"),
        }
    }
    reject_duplicate_cards(&cards)?;

    let cards_text = serialize_ron(&cards, true)?;
    verify_round_trip::<Vec<CardDefinition>>(&cards_text, &cards)?;
    let tags_text = serialize_ron(&tags, false)?;
    verify_round_trip::<CompatDocument>(&tags_text, &tags)?;
    let tides_text = serialize_ron(&tides, false)?;
    verify_round_trip::<CompatDocument>(&tides_text, &tides)?;
    let changed = cards != original || tags != original_tags || tides != original_tides;
    if changed {
        atomic_write(&cards_path, cards_text.as_bytes())?;
        if tags != original_tags {
            atomic_write(
                &staging_root.join(&manifest.dataset("card-tags")?.source),
                tags_text.as_bytes(),
            )?;
        }
        if tides != original_tides {
            atomic_write(
                &staging_root.join(&manifest.dataset("card-tides")?.source),
                tides_text.as_bytes(),
            )?;
        }
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: "cards".into(),
        source_revision: revision(
            staging_root,
            manifest,
            &["cards", "card-tags", "card-tides"],
        )?,
    })
}

fn edit_exploration(
    manifest: &Manifest,
    staging_root: &Path,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let dataset = manifest.dataset("exploration")?;
    let source_path = staging_root.join(&dataset.source);
    let original_text = fs::read_to_string(&source_path)?;
    let original: ExplorationCatalog = ron::from_str(&original_text)
        .context("MALFORMED_SOURCE: staged Exploration RON is invalid")?;
    reject_duplicate_exploration_ids(&original)?;
    let mut catalog = original.clone();
    for operation in operations {
        match operation {
            EditOperation::SetEncounterProse { card_id, prose } => {
                if prose.trim().is_empty() {
                    bail!("INVALID_EDIT: encounter prose must not be blank");
                }
                unique_encounter_mut(&mut catalog, &card_id)?.prose = prose;
            }
            EditOperation::ReplaceAction {
                card_id,
                slot,
                expected_action_id,
                action,
            } => {
                replace_action(&mut catalog, card_id, slot, expected_action_id, action)?;
            }
            EditOperation::ReplaceTemplate {
                template_id,
                actions,
            } => {
                if template_id < 1 {
                    bail!("INVALID_EDIT: template_id must be positive");
                }
                for edit in actions {
                    replace_action(
                        &mut catalog,
                        edit.card_id,
                        edit.slot,
                        edit.expected_action_id,
                        edit.action,
                    )?;
                }
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to Exploration"),
        }
    }
    reject_duplicate_exploration_ids(&catalog)?;
    let changed = catalog != original;
    if changed {
        let text = serialize_ron(&catalog, true)?;
        verify_round_trip::<ExplorationCatalog>(&text, &catalog)?;
        atomic_write(&source_path, text.as_bytes())?;
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: "exploration".into(),
        source_revision: revision(staging_root, manifest, &["exploration"])?,
    })
}

fn replace_action(
    catalog: &mut ExplorationCatalog,
    card_id: String,
    slot: usize,
    expected_action_id: String,
    action: JsonValue,
) -> Result<()> {
    if slot > 1 {
        bail!("INVALID_EDIT: Exploration action slot must be 0 or 1");
    }
    let replacement = action_from_compat(catalog, action)?;
    if replacement.id != expected_action_id {
        bail!("FIELD_NOT_APPLICABLE: Exploration action IDs cannot be changed");
    }
    let encounter = unique_encounter_mut(catalog, &card_id)?;
    let current = encounter
        .actions
        .get(slot)
        .context("RECORD_NOT_FOUND: Exploration action slot is missing")?;
    if current.id != expected_action_id {
        bail!("RECORD_NOT_FOUND: expected action id does not match the selected slot");
    }
    encounter.actions[slot] = replacement;
    Ok(())
}

fn unique_encounter_mut<'a>(
    catalog: &'a mut ExplorationCatalog,
    card_id: &str,
) -> Result<&'a mut crate::models::exploration::EncounterDefinition> {
    let matches = catalog
        .encounters
        .iter()
        .filter(|encounter| encounter.card_id.eq_ignore_ascii_case(card_id))
        .count();
    if matches == 0 {
        bail!("RECORD_NOT_FOUND: Exploration encounter card UUID {card_id}");
    }
    if matches > 1 {
        bail!("MALFORMED_SOURCE: duplicate Exploration encounter UUID {card_id}");
    }
    Ok(catalog
        .encounters
        .iter_mut()
        .find(|encounter| encounter.card_id.eq_ignore_ascii_case(card_id))
        .unwrap())
}

fn reject_duplicate_exploration_ids(catalog: &ExplorationCatalog) -> Result<()> {
    let mut encounters = BTreeSet::new();
    let mut actions = BTreeSet::new();
    for encounter in &catalog.encounters {
        if !encounters.insert(encounter.card_id.to_ascii_lowercase()) {
            bail!(
                "MALFORMED_SOURCE: duplicate Exploration encounter UUID {}",
                encounter.card_id
            );
        }
        for action in &encounter.actions {
            if !actions.insert(action.id.clone()) {
                bail!(
                    "MALFORMED_SOURCE: duplicate Exploration action id {}",
                    action.id
                );
            }
        }
    }
    Ok(())
}

fn action_from_compat(catalog: &ExplorationCatalog, value: JsonValue) -> Result<ActionDefinition> {
    let object = value
        .as_object()
        .context("INVALID_EDIT: Exploration action must be an object")?;
    let kind_name = required_json_string(object, "effectKind")?;
    let kind = EffectKind::from_compat(&kind_name)
        .with_context(|| format!("INVALID_EDIT: unknown Exploration effect kind {kind_name}"))?;
    validate_action_fields(object, kind)?;
    let definition = catalog
        .effects
        .iter()
        .find(|definition| definition.kind == kind)
        .context("MALFORMED_SOURCE: action effect kind has no definition")?;
    if let Some(requested) = optional_json_string(object, "canonicalMechanicId")? {
        if requested != definition.mechanic.as_compat() {
            bail!(
                "FIELD_NOT_APPLICABLE: canonicalMechanicId is derived from the effect definition"
            );
        }
    }
    if let Some(requested) = optional_json_string(object, "selectionPolicyId")? {
        let default = definition
            .selection_policy
            .as_ref()
            .map(|policy| policy.default.as_compat());
        if Some(requested.as_str()) != default {
            bail!("FIELD_NOT_APPLICABLE: selectionPolicyId is derived from the effect definition");
        }
    }
    let effect = match kind {
        EffectKind::GainOfferedCard => ActionEffect::GainOfferedCard {
            predicate: json_predicate(object, "predicate")?,
            count: optional_positive_int(object, "count")?,
        },
        EffectKind::TransfigureSelected => ActionEffect::TransfigureSelected {
            count: positive_int(object, "count")?,
        },
        EffectKind::PurgeSelected => ActionEffect::PurgeSelected {
            predicate: optional_predicate(object, "predicate")?,
            count: optional_positive_int(object, "count")?,
        },
        EffectKind::GainRandomCards => ActionEffect::GainRandomCards {
            predicate: json_predicate(object, "predicate")?,
            count: positive_int(object, "count")?,
        },
        EffectKind::DraftCard => ActionEffect::DraftCard {
            predicate: json_predicate(object, "predicate")?,
            count: positive_int(object, "count")?,
            offer_count: positive_int(object, "offerCount")?,
        },
        EffectKind::ChangeSubtypeSelected => ActionEffect::ChangeSubtypeSelected {
            predicate: optional_predicate(object, "predicate")?,
            subtype: required_json_string(object, "subtype")?,
        },
        EffectKind::ChangeSubtypeAll => ActionEffect::ChangeSubtypeAll {
            subtype_options: string_array(object, "subtypeOptions")?,
        },
        EffectKind::GainCard => ActionEffect::GainCard {
            card_id: required_json_string(object, "cardId")?,
        },
        EffectKind::GainDreamsign => ActionEffect::GainDreamsign {
            dreamsign_id: required_json_string(object, "dreamsignId")?,
        },
        EffectKind::GainEssencePerCard => ActionEffect::GainEssencePerCard {
            predicate: json_predicate(object, "predicate")?,
            essence_per_card: positive_int(object, "essencePerCard")?,
        },
        EffectKind::ChoosePack => ActionEffect::ChoosePack {
            predicate: json_predicate(object, "predicate")?,
            pack_count: positive_int(object, "packCount")?,
            pack_size: positive_int(object, "packSize")?,
        },
        EffectKind::IncreaseSparkAll => ActionEffect::IncreaseSparkAll {
            spark_bonus: positive_int(object, "sparkBonus")?,
        },
        EffectKind::MakeFastAll => ActionEffect::MakeFastAll,
        EffectKind::ReduceCostAllAndGainNightmares => {
            ActionEffect::ReduceCostAllAndGainNightmares {
                energy_cost_reduction: positive_int(object, "energyCostReduction")?,
                nightmare_count: positive_int(object, "nightmareCount")?,
            }
        }
        EffectKind::PurgeAndCopy => ActionEffect::PurgeAndCopy,
        EffectKind::TransfigureFixedSelected => ActionEffect::TransfigureFixedSelected {
            predicate: optional_predicate(object, "predicate")?,
            transfiguration: required_json_string(object, "transfiguration")?,
        },
        EffectKind::GainRandomDreamsign => ActionEffect::GainRandomDreamsign,
        EffectKind::PurgeDreamsignForEssence => ActionEffect::PurgeDreamsignForEssence {
            essence: positive_int(object, "essence")?,
        },
        EffectKind::CopySelectedCard => ActionEffect::CopySelectedCard {
            predicate: optional_predicate(object, "predicate")?,
            count: positive_int(object, "count")?,
        },
        EffectKind::CopySelectedCards => ActionEffect::CopySelectedCards {
            count: positive_int(object, "count")?,
        },
        EffectKind::CopyOfferedDeckCard => ActionEffect::CopyOfferedDeckCard {
            offer_count: positive_int(object, "offerCount")?,
        },
        EffectKind::NextBattleOpeningHand => ActionEffect::NextBattleOpeningHand {
            count: positive_int(object, "count")?,
        },
        EffectKind::NextBattleStartingEnergy => ActionEffect::NextBattleStartingEnergy {
            count: positive_int(object, "count")?,
        },
        EffectKind::NextBattleSmallerHandAndCostDiscount => {
            ActionEffect::NextBattleSmallerHandAndCostDiscount
        }
        EffectKind::ChooseDreamAvatar => ActionEffect::ChooseDreamAvatar {
            offer_count: positive_int(object, "offerCount")?,
        },
        EffectKind::PurgeDuplicatesAndGrantReclaim => ActionEffect::PurgeDuplicatesAndGrantReclaim,
        EffectKind::TakeCards => ActionEffect::TakeCards {
            predicate: json_predicate(object, "predicate")?,
            offer_count: positive_int(object, "offerCount")?,
        },
        EffectKind::ReplaceSelectedWithCard => ActionEffect::ReplaceSelectedWithCard {
            card_id: required_json_string(object, "cardId")?,
        },
        EffectKind::ReplaceSelected => ActionEffect::ReplaceSelected {
            predicate: json_predicate(object, "predicate")?,
        },
        EffectKind::GainNightmareAndCard => ActionEffect::GainNightmareAndCard {
            card_id: required_json_string(object, "cardId")?,
            nightmare_count: positive_int(object, "nightmareCount")?,
        },
        EffectKind::TransfigureNextDraftOrShop => ActionEffect::TransfigureNextDraftOrShop,
        EffectKind::TransfiguredCardDraft => ActionEffect::TransfiguredCardDraft {
            predicate: json_predicate(object, "predicate")?,
            offer_count: positive_int(object, "offerCount")?,
        },
        EffectKind::PurgeForEssence => ActionEffect::PurgeForEssence {
            essence_per_spark: positive_int(object, "essencePerSpark")?,
        },
        EffectKind::AddSite => ActionEffect::AddSite,
    };
    let variables = dynamic_object(object.get("templateVariables"), "templateVariables")?;
    let selections = dynamic_object(object.get("selection"), "selection")?;
    Ok(ActionDefinition {
        label: required_json_string(object, "label")?,
        id: required_json_string(object, "id")?,
        effect_text: required_json_string(object, "effectText")?,
        effect,
        template: TemplateInvocation {
            id: positive_int(object, "templateId")?,
            variables,
            selections,
        },
    })
}

fn validate_action_fields(
    object: &serde_json::Map<String, JsonValue>,
    kind: EffectKind,
) -> Result<()> {
    let mut allowed = BTreeSet::from([
        "id",
        "label",
        "effectText",
        "renderedEffectText",
        "renderedEffectParts",
        "runtimeCardSelections",
        "templateId",
        "template",
        "templateVariables",
        "selection",
        "effectKind",
        "canonicalMechanicId",
        "selectionPolicyId",
    ]);
    let variant: &[&str] = match kind {
        EffectKind::GainOfferedCard => &["predicate", "count"],
        EffectKind::TransfigureSelected => &["count"],
        EffectKind::PurgeSelected => &["predicate", "count"],
        EffectKind::GainRandomCards => &["predicate", "count"],
        EffectKind::DraftCard => &["predicate", "count", "offerCount"],
        EffectKind::ChangeSubtypeSelected => &["predicate", "subtype"],
        EffectKind::ChangeSubtypeAll => &["subtypeOptions"],
        EffectKind::GainCard => &["cardId"],
        EffectKind::GainDreamsign => &["dreamsignId"],
        EffectKind::GainEssencePerCard => &["predicate", "essencePerCard"],
        EffectKind::ChoosePack => &["predicate", "packCount", "packSize"],
        EffectKind::IncreaseSparkAll => &["sparkBonus"],
        EffectKind::ReduceCostAllAndGainNightmares => &["energyCostReduction", "nightmareCount"],
        EffectKind::TransfigureFixedSelected => &["predicate", "transfiguration"],
        EffectKind::PurgeDreamsignForEssence => &["essence"],
        EffectKind::CopySelectedCard => &["predicate", "count"],
        EffectKind::CopySelectedCards => &["count"],
        EffectKind::CopyOfferedDeckCard => &["offerCount"],
        EffectKind::NextBattleOpeningHand => &["count"],
        EffectKind::NextBattleStartingEnergy => &["count"],
        EffectKind::ChooseDreamAvatar => &["offerCount"],
        EffectKind::TakeCards => &["predicate", "offerCount"],
        EffectKind::ReplaceSelectedWithCard => &["cardId"],
        EffectKind::ReplaceSelected => &["predicate"],
        EffectKind::GainNightmareAndCard => &["cardId", "nightmareCount"],
        EffectKind::TransfiguredCardDraft => &["predicate", "offerCount"],
        EffectKind::PurgeForEssence => &["essencePerSpark"],
        EffectKind::MakeFastAll
        | EffectKind::PurgeAndCopy
        | EffectKind::GainRandomDreamsign
        | EffectKind::NextBattleSmallerHandAndCostDiscount
        | EffectKind::PurgeDuplicatesAndGrantReclaim
        | EffectKind::TransfigureNextDraftOrShop
        | EffectKind::AddSite => &[],
    };
    allowed.extend(variant.iter().copied());
    for field in object.keys() {
        if !allowed.contains(field.as_str()) {
            bail!(
                "INVALID_EDIT: field {field} does not apply to effect kind {}",
                kind.as_compat()
            );
        }
    }
    Ok(())
}

fn required_json_string(object: &serde_json::Map<String, JsonValue>, key: &str) -> Result<String> {
    object
        .get(key)
        .and_then(JsonValue::as_str)
        .map(str::to_owned)
        .with_context(|| format!("INVALID_EDIT: Exploration action requires string field {key}"))
}

fn optional_json_string(
    object: &serde_json::Map<String, JsonValue>,
    key: &str,
) -> Result<Option<String>> {
    match object.get(key) {
        None | Some(JsonValue::Null) => Ok(None),
        Some(value) => value
            .as_str()
            .map(|value| Some(value.to_owned()))
            .with_context(|| format!("INVALID_EDIT: {key} must be a string")),
    }
}

fn positive_int(object: &serde_json::Map<String, JsonValue>, key: &str) -> Result<i64> {
    let value = object
        .get(key)
        .and_then(JsonValue::as_i64)
        .with_context(|| {
            format!("INVALID_EDIT: Exploration action requires integer field {key}")
        })?;
    if value < 1 {
        bail!("INVALID_EDIT: {key} must be positive");
    }
    Ok(value)
}

fn optional_positive_int(
    object: &serde_json::Map<String, JsonValue>,
    key: &str,
) -> Result<Option<i64>> {
    match object.get(key) {
        None | Some(JsonValue::Null) => Ok(None),
        Some(_) => positive_int(object, key).map(Some),
    }
}

fn json_predicate(object: &serde_json::Map<String, JsonValue>, key: &str) -> Result<Predicate> {
    let value = required_json_string(object, key)?;
    Predicate::from_compat(&value)
        .with_context(|| format!("INVALID_EDIT: unknown predicate {value}"))
}

fn optional_predicate(
    object: &serde_json::Map<String, JsonValue>,
    key: &str,
) -> Result<Option<Predicate>> {
    match optional_json_string(object, key)? {
        None => Ok(None),
        Some(value) if value.is_empty() => Ok(None),
        Some(value) => Predicate::from_compat(&value)
            .map(Some)
            .with_context(|| format!("INVALID_EDIT: unknown predicate {value}")),
    }
}

fn string_array(object: &serde_json::Map<String, JsonValue>, key: &str) -> Result<Vec<String>> {
    object
        .get(key)
        .and_then(JsonValue::as_array)
        .with_context(|| format!("INVALID_EDIT: {key} must be an array"))?
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .with_context(|| format!("INVALID_EDIT: every {key} entry must be a string"))
        })
        .collect()
}

fn dynamic_object(
    value: Option<&JsonValue>,
    key: &str,
) -> Result<indexmap::IndexMap<String, DynamicValue>> {
    match value {
        None | Some(JsonValue::Null) => Ok(indexmap::IndexMap::new()),
        Some(JsonValue::Object(object)) => object
            .iter()
            .map(|(name, value)| {
                Ok((
                    name.clone(),
                    dynamic_value_from_json(value)
                        .with_context(|| format!("INVALID_EDIT: invalid {key}.{name}"))?,
                ))
            })
            .collect(),
        Some(_) => bail!("INVALID_EDIT: {key} must be an object"),
    }
}

fn dynamic_value_from_json(value: &JsonValue) -> Result<DynamicValue> {
    match value {
        JsonValue::String(value) => Ok(DynamicValue::String(value.clone())),
        JsonValue::Number(value) => value
            .as_i64()
            .map(DynamicValue::Integer)
            .context("dynamic numbers must be integers"),
        JsonValue::Bool(value) => Ok(DynamicValue::Boolean(*value)),
        JsonValue::Object(value) => Ok(DynamicValue::Object(
            value
                .iter()
                .map(|(key, value)| Ok((key.clone(), dynamic_value_from_json(value)?)))
                .collect::<Result<_>>()?,
        )),
        JsonValue::Array(value) => Ok(DynamicValue::Array(
            value
                .iter()
                .map(dynamic_value_from_json)
                .collect::<Result<_>>()?,
        )),
        JsonValue::Null => bail!("dynamic metadata does not permit null"),
    }
}

fn unique_card_mut<'a>(
    cards: &'a mut [CardDefinition],
    id: &str,
) -> Result<&'a mut CardDefinition> {
    let matches = cards
        .iter()
        .filter(|card| card.id.eq_ignore_ascii_case(id))
        .count();
    if matches == 0 {
        bail!("RECORD_NOT_FOUND: card UUID {id}");
    }
    if matches > 1 {
        bail!("MALFORMED_SOURCE: duplicate card UUID {id}");
    }
    Ok(cards
        .iter_mut()
        .find(|card| card.id.eq_ignore_ascii_case(id))
        .unwrap())
}

fn reject_duplicate_cards(cards: &[CardDefinition]) -> Result<()> {
    let mut ids = BTreeSet::new();
    for card in cards {
        if !ids.insert(card.id.to_ascii_lowercase()) {
            bail!("MALFORMED_SOURCE: duplicate card UUID {}", card.id);
        }
    }
    Ok(())
}

fn set_card_field(card: &mut CardDefinition, field: &str, value: JsonValue) -> Result<()> {
    match field {
        "name" => card.name = json_string(value, field)?,
        "rules" | "rendered-text" => card.rules = json_string(value, field)?,
        "energy_cost" | "energy-cost" => card.energy_cost = parse_orb(value, false)?,
        "card_type" | "card-type" => {
            let card_type = json_string(value, field)?;
            card.kind = match card_type.as_str() {
                "Event" => CardKind::Event,
                "Character" => match &card.kind {
                    CardKind::Character { .. } => card.kind.clone(),
                    CardKind::Event => CardKind::Character {
                        subtype: String::new(),
                        spark: None,
                    },
                },
                _ => bail!("INVALID_EDIT: card_type must be Character or Event"),
            };
        }
        "subtype" => match &mut card.kind {
            CardKind::Character { subtype, .. } => *subtype = json_string(value, field)?,
            CardKind::Event => bail!("FIELD_NOT_APPLICABLE: subtype does not apply to Event cards"),
        },
        "spark" => match &mut card.kind {
            CardKind::Character { spark, .. } => {
                *spark = if value.as_str() == Some("") || value.is_null() {
                    None
                } else {
                    Some(parse_orb(value, true)?)
                };
            }
            CardKind::Event => bail!("FIELD_NOT_APPLICABLE: spark does not apply to Event cards"),
        },
        "tags" => {
            let values = value
                .as_array()
                .context("INVALID_EDIT: tags must be an array")?;
            card.tags = values
                .iter()
                .map(|entry| {
                    entry
                        .as_str()
                        .map(str::to_owned)
                        .context("INVALID_EDIT: every tag must be a string")
                })
                .collect::<Result<Vec<_>>>()?;
        }
        "image_number" | "image-number" => {
            card.art.image = value
                .as_i64()
                .context("INVALID_EDIT: image_number must be an integer")?;
        }
        "art_crop" | "art" => {
            card.art.crop = if value.is_null() {
                None
            } else {
                let object = value
                    .as_object()
                    .context("INVALID_EDIT: art_crop must be an object or null")?;
                Some(Crop {
                    x: json_number(object.get("x"), "art_crop.x")?,
                    y: json_number(object.get("y"), "art_crop.y")?,
                    scale: json_number(object.get("scale"), "art_crop.scale")?,
                })
            };
        }
        "tides" => bail!("FIELD_NOT_APPLICABLE: tides are derived from the tide registry"),
        _ => bail!("INVALID_EDIT: unsupported Cards field {field}"),
    }
    Ok(())
}

fn parse_orb(value: JsonValue, spark: bool) -> Result<OrbValue> {
    if let Some(value) = value.as_i64() {
        if value < 0 {
            bail!("INVALID_EDIT: orb values must be non-negative");
        }
        return Ok(OrbValue::Fixed(value));
    }
    let text = value
        .as_str()
        .context("INVALID_EDIT: orb value must be an integer, X, or n,X")?
        .trim();
    if text.eq_ignore_ascii_case("x") || text == "*" {
        return Ok(OrbValue::Variable);
    }
    if !spark {
        if let Some((fixed, variable)) = text.split_once(',') {
            if variable.trim().eq_ignore_ascii_case("x") {
                let value: i64 = fixed
                    .trim()
                    .parse()
                    .context("INVALID_EDIT: invalid fixed-and-variable cost")?;
                if value >= 0 {
                    return Ok(OrbValue::FixedAndVariable(value));
                }
            }
        }
    }
    let value: i64 = text.parse().context("INVALID_EDIT: invalid orb value")?;
    if value < 0 {
        bail!("INVALID_EDIT: orb values must be non-negative");
    }
    Ok(OrbValue::Fixed(value))
}

fn json_string(value: JsonValue, field: &str) -> Result<String> {
    value
        .as_str()
        .map(str::to_owned)
        .with_context(|| format!("INVALID_EDIT: {field} must be a string"))
}

fn json_number(value: Option<&JsonValue>, field: &str) -> Result<f64> {
    value
        .and_then(JsonValue::as_f64)
        .with_context(|| format!("INVALID_EDIT: {field} must be a number"))
}

fn read_compat(manifest: &Manifest, staging_root: &Path, id: &str) -> Result<CompatDocument> {
    let path = staging_root.join(&manifest.dataset(id)?.source);
    ron::from_str(&fs::read_to_string(&path)?)
        .with_context(|| format!("MALFORMED_SOURCE: {id} RON is invalid"))
}

fn facet_array_mut(document: &mut CompatDocument, facet: Facet) -> Result<&mut Vec<toml::Value>> {
    let key = match facet {
        Facet::Tags => "tags",
        Facet::Tides => "tides",
    };
    document
        .data
        .as_table_mut()
        .and_then(|table| table.get_mut(key))
        .and_then(toml::Value::as_array_mut)
        .with_context(|| format!("MALFORMED_SOURCE: {key} registry must be an array"))
}

fn validate_facet(name: &str, color: &str) -> Result<()> {
    if name.trim().is_empty() {
        bail!("INVALID_EDIT: facet name must not be blank");
    }
    if color.len() != 7
        || !color.starts_with('#')
        || !color[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        bail!("INVALID_EDIT: facet color must be #RRGGBB");
    }
    Ok(())
}

fn upsert_facet(
    document: &mut CompatDocument,
    facet: Facet,
    name: String,
    color: String,
) -> Result<()> {
    let entries = facet_array_mut(document, facet)?;
    let mut found = false;
    for entry in entries.iter_mut() {
        let table = entry
            .as_table_mut()
            .context("MALFORMED_SOURCE: facet entry must be a record")?;
        if table.get("name").and_then(toml::Value::as_str) == Some(name.as_str()) {
            if found {
                bail!("MALFORMED_SOURCE: duplicate facet {name}");
            }
            table.insert("color".into(), color.clone().into());
            found = true;
        }
    }
    if !found {
        entries.push(toml::Value::Table(toml::map::Map::from_iter([
            ("name".into(), name.into()),
            ("color".into(), color.into()),
        ])));
    }
    Ok(())
}

fn delete_facet(document: &mut CompatDocument, facet: Facet, name: &str) -> Result<()> {
    let entries = facet_array_mut(document, facet)?;
    let before = entries.len();
    entries.retain(|entry| {
        entry
            .as_table()
            .and_then(|table| table.get("name"))
            .and_then(toml::Value::as_str)
            != Some(name)
    });
    if entries.len() == before {
        bail!("RECORD_NOT_FOUND: facet {name}");
    }
    Ok(())
}

fn serialize_ron<T: serde::Serialize>(value: &T, implicit_some: bool) -> Result<String> {
    let mut extensions = Extensions::empty();
    if implicit_some {
        extensions |= Extensions::IMPLICIT_SOME;
    }
    let pretty = PrettyConfig::new()
        .depth_limit(128)
        .struct_names(true)
        .separate_tuple_members(true)
        .enumerate_arrays(true)
        .extensions(extensions);
    let mut text = ron::ser::to_string_pretty(value, pretty)?;
    if !text.ends_with('\n') {
        text.push('\n');
    }
    Ok(text)
}

fn verify_round_trip<T>(text: &str, intended: &T) -> Result<()>
where
    T: serde::de::DeserializeOwned + serde::Serialize + PartialEq,
{
    let reparsed: T =
        ron::from_str(text).context("MALFORMED_SOURCE: serialized editor RON did not parse")?;
    if &reparsed != intended {
        bail!("INVALID_EDIT: serialized editor RON changed unrelated typed values");
    }
    Ok(())
}

fn revision(staging_root: &Path, manifest: &Manifest, ids: &[&str]) -> Result<String> {
    let mut bytes = Vec::new();
    for id in ids {
        let dataset = manifest.dataset(id)?;
        bytes.extend_from_slice(dataset.source.as_bytes());
        bytes.push(0);
        bytes.extend_from_slice(&fs::read(staging_root.join(&dataset.source))?);
        bytes.push(0);
    }
    Ok(sha256(bytes))
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().context("staged edit path has no parent")?;
    fs::create_dir_all(parent)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    temporary
        .persist(path)
        .map_err(|error| anyhow::anyhow!("write staged edit: {}", error.error))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Map, json};

    fn catalog() -> ExplorationCatalog {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        ron::from_str(&fs::read_to_string(root.join("data/exploration.ron")).unwrap())
            .unwrap()
    }

    fn action(kind: EffectKind) -> JsonValue {
        let mut value = Map::from_iter([
            ("id".into(), json!("fixture-action")),
            ("label".into(), json!("Choose")),
            ("effectText".into(), json!("Effect")),
            ("templateId".into(), json!(1)),
            ("templateVariables".into(), json!({})),
            ("selection".into(), json!({})),
            ("effectKind".into(), json!(kind.as_compat())),
        ]);
        let fields: &[(&str, JsonValue)] = match kind {
            EffectKind::GainOfferedCard => &[("predicate", json!("character"))],
            EffectKind::TransfigureSelected => &[("count", json!(1))],
            EffectKind::PurgeSelected => &[],
            EffectKind::GainRandomCards => &[("predicate", json!("event")), ("count", json!(1))],
            EffectKind::DraftCard => &[
                ("predicate", json!("character")),
                ("count", json!(1)),
                ("offerCount", json!(2)),
            ],
            EffectKind::ChangeSubtypeSelected => &[("subtype", json!("Guide"))],
            EffectKind::ChangeSubtypeAll => &[("subtypeOptions", json!(["Guide", "Warrior"]))],
            EffectKind::GainCard => &[("cardId", json!("00000000-0000-4000-8000-000000000001"))],
            EffectKind::GainDreamsign => {
                &[("dreamsignId", json!("00000000-0000-4000-8000-000000000002"))]
            }
            EffectKind::GainEssencePerCard => &[
                ("predicate", json!("character")),
                ("essencePerCard", json!(1)),
            ],
            EffectKind::ChoosePack => &[
                ("predicate", json!("character")),
                ("packCount", json!(2)),
                ("packSize", json!(3)),
            ],
            EffectKind::IncreaseSparkAll => &[("sparkBonus", json!(1))],
            EffectKind::ReduceCostAllAndGainNightmares => &[
                ("energyCostReduction", json!(1)),
                ("nightmareCount", json!(1)),
            ],
            EffectKind::TransfigureFixedSelected => &[("transfiguration", json!("DoubledSpark"))],
            EffectKind::PurgeDreamsignForEssence => &[("essence", json!(5))],
            EffectKind::CopySelectedCard => &[("count", json!(1))],
            EffectKind::CopySelectedCards => &[("count", json!(2))],
            EffectKind::CopyOfferedDeckCard => &[("offerCount", json!(3))],
            EffectKind::NextBattleOpeningHand => &[("count", json!(1))],
            EffectKind::NextBattleStartingEnergy => &[("count", json!(1))],
            EffectKind::ChooseDreamAvatar => &[("offerCount", json!(2))],
            EffectKind::TakeCards => &[("predicate", json!("character")), ("offerCount", json!(2))],
            EffectKind::ReplaceSelectedWithCard => {
                &[("cardId", json!("00000000-0000-4000-8000-000000000001"))]
            }
            EffectKind::ReplaceSelected => &[("predicate", json!("event"))],
            EffectKind::GainNightmareAndCard => &[
                ("cardId", json!("00000000-0000-4000-8000-000000000001")),
                ("nightmareCount", json!(1)),
            ],
            EffectKind::TransfiguredCardDraft => {
                &[("predicate", json!("character")), ("offerCount", json!(2))]
            }
            EffectKind::PurgeForEssence => &[("essencePerSpark", json!(2))],
            EffectKind::MakeFastAll
            | EffectKind::PurgeAndCopy
            | EffectKind::GainRandomDreamsign
            | EffectKind::NextBattleSmallerHandAndCostDiscount
            | EffectKind::PurgeDuplicatesAndGrantReclaim
            | EffectKind::TransfigureNextDraftOrShop
            | EffectKind::AddSite => &[],
        };
        value.extend(
            fields
                .iter()
                .map(|(key, value)| ((*key).into(), value.clone())),
        );
        JsonValue::Object(value)
    }

    #[test]
    fn maps_every_exploration_effect_variant_and_rejects_foreign_fields() {
        let catalog = catalog();
        for definition in &catalog.effects {
            action_from_compat(&catalog, action(definition.kind)).unwrap_or_else(|error| {
                panic!("{} did not map: {error:#}", definition.kind.as_compat())
            });
        }
        let mut invalid = action(EffectKind::MakeFastAll);
        invalid
            .as_object_mut()
            .unwrap()
            .insert("count".into(), json!(1));
        assert!(
            action_from_compat(&catalog, invalid)
                .unwrap_err()
                .to_string()
                .contains("does not apply")
        );
    }

    #[test]
    fn rejects_exploration_derived_field_overrides() {
        let catalog = catalog();
        let mut invalid = action(EffectKind::GainDreamsign);
        invalid
            .as_object_mut()
            .unwrap()
            .insert("selectionPolicyId".into(), json!("uniform"));
        assert!(
            action_from_compat(&catalog, invalid)
                .unwrap_err()
                .to_string()
                .contains("FIELD_NOT_APPLICABLE")
        );
    }

    #[test]
    fn card_edit_variants_enforce_applicability() {
        let mut event = CardDefinition {
            name: "Fixture".into(),
            id: "00000000-0000-4000-8000-000000000001".into(),
            rules: String::new(),
            energy_cost: OrbValue::Fixed(1),
            kind: CardKind::Event,
            speed: crate::models::cards::Speed::Normal,
            rarity: None,
            art: crate::models::cards::Art {
                image: 1,
                owned: false,
                crop: None,
            },
            number: 1,
            mtg_origin: String::new(),
            tags: vec![],
        };
        assert!(
            set_card_field(&mut event, "subtype", json!("Guide"))
                .unwrap_err()
                .to_string()
                .contains("FIELD_NOT_APPLICABLE")
        );
        set_card_field(&mut event, "card_type", json!("Character")).unwrap();
        set_card_field(&mut event, "spark", json!("2")).unwrap();
        set_card_field(&mut event, "energy_cost", json!("3,X")).unwrap();
        assert!(matches!(event.energy_cost, OrbValue::FixedAndVariable(3)));
        assert!(
            set_card_field(&mut event, "tides", json!([]))
                .unwrap_err()
                .to_string()
                .contains("FIELD_NOT_APPLICABLE")
        );
    }
}
