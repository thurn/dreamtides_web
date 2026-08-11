use std::collections::BTreeSet;
use std::fs;
use std::io::Write;
use std::ops::Range;
use std::path::Path;

use anyhow::{Context, Result, bail};
use ron::extensions::Extensions;
use ron::ser::PrettyConfig;
use serde::Deserialize;
use serde_json::Value as JsonValue;

use crate::compiler::{EditReport, sha256};
use crate::manifest::Manifest;
use crate::models::affiliations::{self, AffiliationCatalog, CanonicalUuid};
use crate::models::cards::{CardDefinition, CardKind, Crop, OrbValue};
use crate::models::compat::CompatDocument;
use crate::models::dream_avatar_tide_pools::{
    self, DreamAvatarId as TidePoolDreamAvatarId, DreamAvatarPool, DreamAvatarTidePoolsCatalog,
};
use crate::models::dream_avatars::{self, AvatarDefinition, DreamAvatarId};
use crate::models::dream_guides::{self, GuideDefinition, GuideId};
use crate::models::dreamscapes::{
    self, AffiliationId, DreamAvatarId as DreamscapeAvatarId, DreamscapeDefinition, DreamscapeId,
    DreamscapeKind,
};
use crate::models::dreamsigns::{
    self, DreamsignDefinition, DreamsignId, DreamsignMetadataCatalog, DreamsignTag,
    DreamsignTagCatalog,
};
use crate::models::dreamwell::{
    self, ArtCrop, DeckTier, DreamwellCardDefinition, DreamwellCatalog,
};
use crate::models::exploration::{
    ActionDefinition, ActionEffect, ActionId, ActionPresentation, CardTypeTarget, DeckTarget,
    EffectKind, ExplorationCatalog, FixedSiteType, Followup, Predicate,
};
use crate::models::figments::{
    ArtCrop as FigmentArtCrop, CharacterType as FigmentCharacterType, FigmentBehavior,
    FigmentDefinition,
};
use crate::models::glossary::{self, GlossaryDefinition, GlossaryId, TermPresentation};
use crate::models::internal_card_metadata::{
    self, CardMetadataCatalog, CardMetadataDefinition, FacetDefinition,
};
use crate::models::resonance::Resonance;
use crate::models::tides::{self, TideDefinition, TideId, TidesCatalog};
use crate::models::tutorial::{self, TutorialActionDefinition, TutorialCatalog};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct EditRequest {
    dataset: String,
    operations: Vec<EditOperation>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
enum EditOperation {
    SetAffiliationCatalogField {
        field: String,
        value: JsonValue,
    },
    SetAffiliationField {
        affiliation_id: String,
        field: String,
        value: JsonValue,
    },
    ReplaceAffiliationSignatureCards {
        affiliation_id: String,
        card_ids: Vec<String>,
    },
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
    SetDreamAvatarField {
        avatar_id: String,
        field: String,
        value: JsonValue,
    },
    SetTideField {
        tide_id: String,
        field: String,
        value: JsonValue,
    },
    SetDreamAvatarTidePool {
        dream_avatar_id: String,
        starter: Option<String>,
        facets: Vec<String>,
        neutral: Vec<String>,
    },
    SetDreamsignField {
        dreamsign_id: String,
        field: String,
        value: JsonValue,
    },
    ReplaceDreamsignTags {
        tags: Vec<DreamsignTag>,
    },
    SwapDreamGuideHomes {
        first_guide_id: String,
        second_guide_id: String,
    },
    SwapDreamGuideSpecialties {
        first_guide_id: String,
        second_guide_id: String,
    },
    SetDreamscapeField {
        dreamscape_id: String,
        field: String,
        value: JsonValue,
    },
    SetDreamscapeOpponents {
        dreamscape_id: String,
        opponent_ids: Vec<String>,
    },
    SetDreamwellField {
        dreamwell_id: String,
        field: String,
        value: JsonValue,
    },
    SetFigmentField {
        figment_id: String,
        field: String,
        value: JsonValue,
    },
    SetGlossaryField {
        glossary_id: String,
        field: String,
        value: JsonValue,
    },
    ReplaceTutorialActions {
        actions: JsonValue,
    },
    ReplaceAction {
        card_id: String,
        slot: usize,
        expected_action_id: String,
        action: JsonValue,
    },
    AdoptStagedCompatibility {
        output_sha256: String,
    },
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
        "affiliations" => edit_affiliations(manifest, staging_root, request.operations),
        "cards" => edit_cards(manifest, staging_root, request.operations),
        "dream-avatars" => edit_dream_avatars(manifest, staging_root, request.operations),
        "dream-guides" => edit_dream_guides(manifest, staging_root, request.operations),
        "dreamscapes" => edit_dreamscapes(manifest, staging_root, request.operations),
        "dreamsigns" => edit_dreamsigns(manifest, staging_root, request.operations),
        "dreamwell" => edit_dreamwell(manifest, staging_root, request.operations),
        "exploration" => edit_exploration(manifest, staging_root, request.operations),
        "figments" => edit_figments(manifest, staging_root, request.operations),
        "glossary" => edit_glossary(manifest, staging_root, request.operations),
        "tutorial" => edit_tutorial(manifest, staging_root, request.operations),
        "tides" => edit_tides(manifest, staging_root, request.operations),
        "dream-avatar-tide-pools" => {
            edit_dream_avatar_tide_pools(manifest, staging_root, request.operations)
        }
        dataset => edit_compat(manifest, staging_root, dataset, request.operations),
    }
}

fn edit_tides(
    manifest: &Manifest,
    staging_root: &Path,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let dataset = manifest.dataset("tides")?;
    if dataset.adapter != "tides_v1"
        || dataset.editor != crate::manifest::EditorCapability::Semantic
    {
        bail!("FIELD_NOT_APPLICABLE: stage-edit is not registered for tides");
    }
    let source_path = staging_root.join(&dataset.source);
    let original_text = fs::read_to_string(&source_path)
        .with_context(|| format!("read staged tides source {}", source_path.display()))?;
    let original: TidesCatalog =
        ron::from_str(&original_text).context("MALFORMED_SOURCE: staged tides RON is invalid")?;
    tides::validate(&original).context("MALFORMED_SOURCE: staged tides catalog is invalid")?;
    let mut catalog = original.clone();
    let mut source = original_text;

    for operation in operations {
        match operation {
            EditOperation::SetTideField {
                tide_id,
                field,
                value,
            } => {
                let index = unique_tide_index(&catalog, &tide_id)?;
                set_tide_field(&mut catalog[index], &field, value)?;
                source = patch_tide_field(&source, &catalog[index], &field)?;
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to tides"),
        }
        tides::validate(&catalog)
            .context("INVALID_EDIT: tide edit violates the catalog contract")?;
    }

    verify_round_trip::<TidesCatalog>(&source, &catalog)?;
    let changed = catalog != original;
    if changed {
        atomic_write(&source_path, source.as_bytes())?;
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: "tides".into(),
        source_revision: revision(staging_root, manifest, &["tides"])?,
    })
}

fn edit_dream_avatar_tide_pools(
    manifest: &Manifest,
    staging_root: &Path,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let dataset = manifest.dataset("dream-avatar-tide-pools")?;
    if dataset.adapter != "dream_avatar_tide_pools_v1"
        || dataset.editor != crate::manifest::EditorCapability::Semantic
    {
        bail!("FIELD_NOT_APPLICABLE: stage-edit is not registered for Dream Avatar tide pools");
    }
    let tides_dataset = manifest.dataset("tides")?;
    let tides: TidesCatalog = ron::from_str(&fs::read_to_string(
        staging_root.join(&tides_dataset.source),
    )?)
    .context("MALFORMED_SOURCE: staged tides RON is invalid")?;
    let tide_kinds =
        tides::tide_kinds(&tides).context("MALFORMED_SOURCE: staged tides catalog is invalid")?;
    let source_path = staging_root.join(&dataset.source);
    let original_text = fs::read_to_string(&source_path).with_context(|| {
        format!(
            "read staged Dream Avatar tide-pool source {}",
            source_path.display()
        )
    })?;
    let original: DreamAvatarTidePoolsCatalog = ron::from_str(&original_text)
        .context("MALFORMED_SOURCE: staged Dream Avatar tide-pool RON is invalid")?;
    dream_avatar_tide_pools::validate(&original, &tide_kinds)
        .context("MALFORMED_SOURCE: staged Dream Avatar tide-pool catalog is invalid")?;
    let mut catalog = original.clone();
    let mut source = original_text;

    for operation in operations {
        match operation {
            EditOperation::SetDreamAvatarTidePool {
                dream_avatar_id,
                starter,
                facets,
                neutral,
            } => {
                let index = unique_tide_pool_index(&catalog, &dream_avatar_id)?;
                let replacement = DreamAvatarPool {
                    dream_avatar_id: TidePoolDreamAvatarId::parse(&dream_avatar_id).map_err(
                        |error| anyhow::anyhow!("INVALID_EDIT: Dream Avatar identity: {error}"),
                    )?,
                    starter: parse_optional_tide_id(starter.as_deref())?,
                    facets: parse_tide_ids(&facets)?,
                    neutral: parse_tide_ids(&neutral)?,
                };
                source = patch_tide_pool(&source, &catalog[index], &replacement)?;
                catalog[index] = replacement;
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to Dream Avatar tide pools"),
        }
        dream_avatar_tide_pools::validate(&catalog, &tide_kinds)
            .context("INVALID_EDIT: tide-pool edit violates the catalog contract")?;
    }

    verify_round_trip::<DreamAvatarTidePoolsCatalog>(&source, &catalog)?;
    let changed = catalog != original;
    if changed {
        atomic_write(&source_path, source.as_bytes())?;
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: "dream-avatar-tide-pools".into(),
        source_revision: revision(staging_root, manifest, &["dream-avatar-tide-pools"])?,
    })
}

fn unique_tide_index(catalog: &TidesCatalog, id: &str) -> Result<usize> {
    let requested = TideId::parse(id)
        .map_err(|error| anyhow::anyhow!("INVALID_EDIT: Tide identity {id}: {error}"))?;
    let matches = catalog
        .iter()
        .enumerate()
        .filter(|(_, tide)| tide.id == requested)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [] => bail!("RECORD_NOT_FOUND: Tide identity {id}"),
        [index] => Ok(*index),
        _ => bail!("MALFORMED_SOURCE: duplicate Tide identity {id}"),
    }
}

fn unique_tide_pool_index(catalog: &DreamAvatarTidePoolsCatalog, id: &str) -> Result<usize> {
    let requested = TidePoolDreamAvatarId::parse(id).map_err(|error| {
        anyhow::anyhow!("INVALID_EDIT: Tide-pool Dream Avatar identity {id}: {error}")
    })?;
    let matches = catalog
        .iter()
        .enumerate()
        .filter(|(_, pool)| pool.dream_avatar_id == requested)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [] => bail!("RECORD_NOT_FOUND: Tide-pool Dream Avatar identity {id}"),
        [index] => Ok(*index),
        _ => bail!("MALFORMED_SOURCE: duplicate Tide-pool Dream Avatar identity {id}"),
    }
}

fn set_tide_field(tide: &mut TideDefinition, field: &str, value: JsonValue) -> Result<()> {
    match field {
        "display_name" | "displayName" => tide.display_name = json_string(value, field)?,
        "display_description" | "displayDescription" => {
            tide.display_description = json_string(value, field)?
        }
        "resonance" => {
            tide.resonance = match json_string(value, field)?.as_str() {
                "ember" => Resonance::Ember,
                "valor" => Resonance::Valor,
                "vision" => Resonance::Vision,
                "wild" => Resonance::Wild,
                "shadow" => Resonance::Shadow,
                other => bail!("INVALID_EDIT: unsupported tide resonance {other}"),
            }
        }
        _ => bail!("INVALID_EDIT: unsupported tide field {field}"),
    }
    Ok(())
}

fn patch_tide_field(source: &str, tide: &TideDefinition, field: &str) -> Result<String> {
    let source_field = match field {
        "display_name" | "displayName" => "display_name",
        "display_description" | "displayDescription" => "display_description",
        "resonance" => "resonance",
        _ => bail!("INVALID_EDIT: unsupported tide field {field}"),
    };
    let record =
        typed_record_range_at_indent(source, "TideDefinition", "id", &tide.id.to_string(), 2)?;
    let replacement = match source_field {
        "display_name" => ron::to_string(&tide.display_name)?,
        "display_description" => ron::to_string(&tide.display_description)?,
        "resonance" => ron::to_string(&tide.resonance)?,
        _ => unreachable!(),
    };
    patch_field_value(source, record, source_field, &replacement)
}

fn parse_optional_tide_id(value: Option<&str>) -> Result<Option<TideId>> {
    value
        .map(|id| {
            TideId::parse(id)
                .map_err(|error| anyhow::anyhow!("INVALID_EDIT: Tide identity {id}: {error}"))
        })
        .transpose()
}

fn parse_tide_ids(values: &[String]) -> Result<Vec<TideId>> {
    values
        .iter()
        .map(|id| {
            TideId::parse(id)
                .map_err(|error| anyhow::anyhow!("INVALID_EDIT: Tide identity {id}: {error}"))
        })
        .collect()
}

fn patch_tide_pool(
    source: &str,
    before: &DreamAvatarPool,
    after: &DreamAvatarPool,
) -> Result<String> {
    let mut patched = source.to_owned();
    for (field, replacement) in [
        (
            "starter",
            (before.starter != after.starter)
                .then(|| render_ron_value(&after.starter, true))
                .transpose()?,
        ),
        (
            "facets",
            (before.facets != after.facets)
                .then(|| ron::to_string(&after.facets))
                .transpose()?,
        ),
        (
            "neutral",
            (before.neutral != after.neutral)
                .then(|| ron::to_string(&after.neutral))
                .transpose()?,
        ),
    ] {
        let Some(replacement) = replacement else {
            continue;
        };
        let record = typed_record_range_at_indent(
            &patched,
            "DreamAvatarPool",
            "dream_avatar_id",
            &after.dream_avatar_id.to_string(),
            2,
        )?;
        patched = patch_field_value(&patched, record, field, &replacement)?;
    }
    Ok(patched)
}

fn edit_tutorial(
    manifest: &Manifest,
    staging_root: &Path,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let dataset = manifest.dataset("tutorial")?;
    if dataset.adapter != "tutorial_v1"
        || dataset.editor != crate::manifest::EditorCapability::Semantic
    {
        bail!("FIELD_NOT_APPLICABLE: stage-edit is not registered for Tutorial");
    }
    let source_path = staging_root.join(&dataset.source);
    let original_text = fs::read_to_string(&source_path)
        .with_context(|| format!("read staged Tutorial source {}", source_path.display()))?;
    let original: TutorialCatalog = ron::from_str(&original_text)
        .context("MALFORMED_SOURCE: staged Tutorial RON is invalid")?;
    tutorial::validate(&original)
        .context("MALFORMED_SOURCE: staged Tutorial catalog is invalid")?;
    let mut catalog = original.clone();
    let mut source_text = original_text;

    for operation in operations {
        match operation {
            EditOperation::ReplaceTutorialActions { actions } => {
                let mut replacement = tutorial::actions_from_compatibility_json(actions)
                    .context("INVALID_EDIT: Tutorial actions are invalid")?;
                reject_duplicate_tutorial_actions(&replacement)?;
                tutorial::preserve_default_bubble_width_omissions(
                    &catalog.scripted_tutorial_sequence,
                    &mut replacement,
                    catalog.default_maximum_width_pixels,
                );
                source_text = patch_tutorial_actions(
                    &source_text,
                    &catalog.scripted_tutorial_sequence,
                    &replacement,
                )?;
                catalog.scripted_tutorial_sequence = replacement;
                tutorial::validate(&catalog)
                    .context("INVALID_EDIT: Tutorial edit violates the catalog contract")?;
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to Tutorial"),
        }
    }

    verify_round_trip::<TutorialCatalog>(&source_text, &catalog)?;
    let changed = catalog != original;
    if changed {
        atomic_write(&source_path, source_text.as_bytes())?;
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: "tutorial".into(),
        source_revision: revision(staging_root, manifest, &["tutorial"])?,
    })
}

fn reject_duplicate_tutorial_actions(actions: &[TutorialActionDefinition]) -> Result<()> {
    let mut ids = BTreeSet::new();
    for action in actions {
        if !ids.insert(action.id.to_string()) {
            bail!("INVALID_EDIT: duplicate Tutorial action UUID {}", action.id);
        }
    }
    Ok(())
}

fn patch_tutorial_actions(
    source: &str,
    before: &[TutorialActionDefinition],
    after: &[TutorialActionDefinition],
) -> Result<String> {
    let same_structure = before.len() == after.len()
        && before
            .iter()
            .zip(after)
            .all(|(left, right)| left.id == right.id);
    if !same_structure {
        let catalog = tutorial_catalog_range(source)?;
        let actions = top_level_field_value_range(source, catalog, "scripted_tutorial_sequence")?
            .context(
            "MALFORMED_SOURCE: Tutorial catalog is missing scripted_tutorial_sequence",
        )?;
        return replace_source_ranges(source, vec![(actions, render_ron_value(after, true)?)]);
    }

    let mut patched = source.to_owned();
    for (old, new) in before.iter().zip(after) {
        if old == new {
            continue;
        }
        let record = tutorial_action_record_range(&patched, &new.id.to_string())?;
        if old.wait_seconds != new.wait_seconds {
            let wait = top_level_field_value_range(&patched, record.clone(), "wait_seconds")?
                .context("MALFORMED_SOURCE: Tutorial action is missing wait_seconds")?;
            patched =
                replace_source_ranges(&patched, vec![(wait, ron::to_string(&new.wait_seconds)?)])?;
        }
        if old.behavior != new.behavior {
            let record = tutorial_action_record_range(&patched, &new.id.to_string())?;
            let behavior = top_level_field_value_range(&patched, record, "behavior")?
                .context("MALFORMED_SOURCE: Tutorial action is missing behavior")?;
            patched = replace_source_ranges(
                &patched,
                vec![(behavior, render_ron_value(&new.behavior, true)?)],
            )?;
        }
    }
    Ok(patched)
}

fn tutorial_catalog_range(source: &str) -> Result<Range<usize>> {
    let marker = "TutorialCatalog(";
    let start = source
        .find(marker)
        .context("MALFORMED_SOURCE: Tutorial catalog boundary is missing")?;
    let opening = start + marker.len() - 1;
    Ok(start..matching_delimiter(source, opening)? + 1)
}

fn tutorial_action_record_range(source: &str, id: &str) -> Result<Range<usize>> {
    typed_record_range_at_indent(source, "TutorialActionDefinition", "id", id, 4)
}

fn render_ron_value<T: serde::Serialize + ?Sized>(
    value: &T,
    implicit_some: bool,
) -> Result<String> {
    let serialized = serialize_ron(value, implicit_some)?;
    Ok(serialized
        .strip_prefix("#![enable(implicit_some)]\n")
        .unwrap_or(&serialized)
        .trim_end_matches('\n')
        .to_owned())
}

fn edit_affiliations(
    manifest: &Manifest,
    staging_root: &Path,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let dataset = manifest.dataset("affiliations")?;
    if dataset.adapter != "affiliations_v1"
        || dataset.editor != crate::manifest::EditorCapability::Semantic
    {
        bail!("FIELD_NOT_APPLICABLE: stage-edit is not registered for affiliations");
    }
    let source_path = staging_root.join(&dataset.source);
    let original_text = fs::read_to_string(&source_path)
        .with_context(|| format!("read staged affiliation source {}", source_path.display()))?;
    let original: AffiliationCatalog = ron::from_str(&original_text)
        .context("MALFORMED_SOURCE: staged affiliation RON is invalid")?;
    affiliations::validate(&original)
        .context("MALFORMED_SOURCE: staged affiliation catalog is invalid")?;
    let cards_dataset = manifest.dataset("cards")?;
    let cards_text = fs::read_to_string(staging_root.join(&cards_dataset.source))?;
    let cards: Vec<CardDefinition> =
        ron::from_str(&cards_text).context("MALFORMED_SOURCE: staged card RON is invalid")?;
    let card_ids = cards
        .iter()
        .map(|card| card.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut catalog = original.clone();
    let mut source = original_text;

    for operation in operations {
        match operation {
            EditOperation::SetAffiliationCatalogField { field, value } => {
                let number = value.as_f64().with_context(|| {
                    format!("INVALID_EDIT: affiliation catalog field {field} must be a number")
                })?;
                match field.as_str() {
                    "default_random_draw_max_multiplier" => {
                        catalog.default_random_draw_max_multiplier = number
                    }
                    "default_opponent_deck_max_multiplier" => {
                        catalog.default_opponent_deck_max_multiplier = number
                    }
                    _ => bail!("INVALID_EDIT: unsupported affiliation catalog field {field}"),
                }
                source = patch_affiliation_catalog_field(&source, &catalog, &field)?;
            }
            EditOperation::SetAffiliationField {
                affiliation_id,
                field,
                value,
            } => {
                let index = unique_affiliation_index(&catalog, &affiliation_id)?;
                let text = json_string(value, &field)?;
                if text.trim().is_empty() {
                    bail!("INVALID_EDIT: affiliation {field} must not be blank");
                }
                match field.as_str() {
                    "name" => catalog.affiliations[index].name = text,
                    "atlas_card_theme" => catalog.affiliations[index].atlas_card_theme = text,
                    _ => bail!("INVALID_EDIT: unsupported affiliation field {field}"),
                }
                source = patch_affiliation_field(&source, &catalog.affiliations[index], &field)?;
            }
            EditOperation::ReplaceAffiliationSignatureCards {
                affiliation_id,
                card_ids: requested,
            } => {
                let index = unique_affiliation_index(&catalog, &affiliation_id)?;
                let parsed = requested
                    .iter()
                    .map(|id| {
                        if !card_ids.contains(id.as_str()) {
                            bail!("RECORD_NOT_FOUND: signature card UUID {id}");
                        }
                        CanonicalUuid::parse(id).map_err(|error| {
                            anyhow::anyhow!("INVALID_EDIT: signature card identity {id}: {error}")
                        })
                    })
                    .collect::<Result<Vec<_>>>()?;
                catalog.affiliations[index].signature_card_ids = parsed;
                source = patch_affiliation_field(
                    &source,
                    &catalog.affiliations[index],
                    "signature_card_ids",
                )?;
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to affiliations"),
        }
    }

    affiliations::validate(&catalog)
        .context("INVALID_EDIT: affiliation edit violates the catalog contract")?;
    verify_round_trip::<AffiliationCatalog>(&source, &catalog)?;
    let changed = catalog != original;
    if changed {
        atomic_write(&source_path, source.as_bytes())?;
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: "affiliations".into(),
        source_revision: revision(staging_root, manifest, &["affiliations"])?,
    })
}

fn unique_affiliation_index(catalog: &AffiliationCatalog, id: &str) -> Result<usize> {
    let requested = CanonicalUuid::parse(id)
        .map_err(|error| anyhow::anyhow!("INVALID_EDIT: affiliation identity {id}: {error}"))?;
    let matches = catalog
        .affiliations
        .iter()
        .enumerate()
        .filter(|(_, affiliation)| affiliation.id == requested)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [] => bail!("RECORD_NOT_FOUND: affiliation identity {id}"),
        [index] => Ok(*index),
        _ => bail!("MALFORMED_SOURCE: duplicate affiliation identity {id}"),
    }
}

fn affiliation_catalog_range(source: &str) -> Result<Range<usize>> {
    let matches = named_struct_ranges(source, "AffiliationCatalog")?;
    match matches.as_slice() {
        [] => bail!("MALFORMED_SOURCE: missing AffiliationCatalog boundary"),
        [range] => Ok(range.clone()),
        _ => bail!("MALFORMED_SOURCE: duplicate AffiliationCatalog boundary"),
    }
}

fn patch_affiliation_catalog_field(
    source: &str,
    catalog: &AffiliationCatalog,
    field: &str,
) -> Result<String> {
    let replacement = match field {
        "default_random_draw_max_multiplier" => {
            ron::to_string(&catalog.default_random_draw_max_multiplier)?
        }
        "default_opponent_deck_max_multiplier" => {
            ron::to_string(&catalog.default_opponent_deck_max_multiplier)?
        }
        _ => bail!("INVALID_EDIT: unsupported affiliation catalog field {field}"),
    };
    patch_field_value(
        source,
        affiliation_catalog_range(source)?,
        field,
        &replacement,
    )
}

fn patch_affiliation_field(
    source: &str,
    affiliation: &crate::models::affiliations::AffiliationDefinition,
    field: &str,
) -> Result<String> {
    let record = affiliation_record_range(source, &affiliation.id.to_string())?;
    let replacement = match field {
        "name" => ron::to_string(&affiliation.name)?,
        "atlas_card_theme" => ron::to_string(&affiliation.atlas_card_theme)?,
        "signature_card_ids" => ron::to_string(
            &affiliation
                .signature_card_ids
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>(),
        )?,
        _ => bail!("INVALID_EDIT: unsupported affiliation field {field}"),
    };
    patch_field_value(source, record, field, &replacement)
}

fn affiliation_record_range(source: &str, id: &str) -> Result<Range<usize>> {
    let mut matches = Vec::new();
    for record in named_struct_ranges(source, "AffiliationDefinition")? {
        let identity = top_level_field_value_range(source, record.clone(), "id")?
            .context("MALFORMED_SOURCE: affiliation record is missing id")?;
        let parsed: String = ron::from_str(&source[identity])
            .context("MALFORMED_SOURCE: affiliation id is not a string")?;
        if parsed == id {
            matches.push(record);
        }
    }
    match matches.as_slice() {
        [] => bail!("RECORD_NOT_FOUND: AffiliationDefinition identity {id}"),
        [range] => Ok(range.clone()),
        _ => bail!("MALFORMED_SOURCE: duplicate AffiliationDefinition identity {id}"),
    }
}

fn named_struct_ranges(source: &str, name: &str) -> Result<Vec<Range<usize>>> {
    let bytes = source.as_bytes();
    let mut cursor = 0;
    let mut ranges = Vec::new();
    while cursor < bytes.len() {
        if let Some(next) = skip_ron_literal_or_comment(bytes, cursor)? {
            cursor = next;
            continue;
        }
        if bytes[cursor].is_ascii_alphabetic() || bytes[cursor] == b'_' {
            let start = cursor;
            cursor += 1;
            while cursor < bytes.len()
                && (bytes[cursor].is_ascii_alphanumeric() || bytes[cursor] == b'_')
            {
                cursor += 1;
            }
            if &source[start..cursor] != name {
                continue;
            }
            while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
                cursor += 1;
            }
            if bytes.get(cursor) == Some(&b'(') {
                let end = matching_delimiter(source, cursor)? + 1;
                ranges.push(start..end);
                cursor = end;
            }
            continue;
        }
        cursor += 1;
    }
    Ok(ranges)
}

fn patch_field_value(
    source: &str,
    record: Range<usize>,
    field: &str,
    replacement: &str,
) -> Result<String> {
    let range = top_level_field_value_range(source, record, field)?
        .with_context(|| format!("MALFORMED_SOURCE: missing field {field}"))?;
    Ok(format!(
        "{}{}{}",
        &source[..range.start],
        replacement,
        &source[range.end..]
    ))
}

fn edit_dreamscapes(
    manifest: &Manifest,
    staging_root: &Path,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let dataset = manifest.dataset("dreamscapes")?;
    if dataset.adapter != "dreamscapes_v1"
        || dataset.editor != crate::manifest::EditorCapability::Semantic
    {
        bail!("FIELD_NOT_APPLICABLE: stage-edit is not registered for dreamscapes");
    }
    let source_path = staging_root.join(&dataset.source);
    let original_text = fs::read_to_string(&source_path)
        .with_context(|| format!("read staged Dreamscape source {}", source_path.display()))?;
    let original: Vec<DreamscapeDefinition> = ron::from_str(&original_text)
        .context("MALFORMED_SOURCE: staged Dreamscape RON is invalid")?;
    dreamscapes::validate(&original)
        .context("MALFORMED_SOURCE: staged Dreamscape catalog is invalid")?;
    let mut dreamscapes = original.clone();
    let mut source_text = original_text;

    for operation in operations {
        match operation {
            EditOperation::SetDreamscapeField {
                dreamscape_id,
                field,
                value,
            } => {
                let index = unique_dreamscape_index(&dreamscapes, &dreamscape_id)?;
                set_dreamscape_field(&mut dreamscapes[index], &field, value)?;
                source_text =
                    patch_dreamscape_source_field(&source_text, &dreamscapes[index], &field)?;
            }
            EditOperation::SetDreamscapeOpponents {
                dreamscape_id,
                opponent_ids,
            } => {
                let index = unique_dreamscape_index(&dreamscapes, &dreamscape_id)?;
                set_dreamscape_opponents(&mut dreamscapes[index], opponent_ids)?;
                source_text = patch_dreamscape_source_field(
                    &source_text,
                    &dreamscapes[index],
                    "opponent_dream_avatar_ids",
                )?;
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to Dreamscapes"),
        }
    }

    dreamscapes::validate(&dreamscapes)
        .context("INVALID_EDIT: Dreamscape edit violates the catalog contract")?;
    verify_round_trip::<Vec<DreamscapeDefinition>>(&source_text, &dreamscapes)?;
    let changed = dreamscapes != original;
    if changed {
        atomic_write(&source_path, source_text.as_bytes())?;
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: "dreamscapes".into(),
        source_revision: revision(staging_root, manifest, &["dreamscapes"])?,
    })
}

fn unique_dreamscape_index(dreamscapes: &[DreamscapeDefinition], id: &str) -> Result<usize> {
    let literal = ron::to_string(id)?;
    let requested = match ron::from_str::<DreamscapeId>(&literal) {
        Ok(id) => id,
        Err(_) => dreamscapes::canonical_id(id).context(
            "INVALID_EDIT: Dreamscape identity must be a canonical UUIDv4 or registered compatibility key",
        )?,
    };
    let matches = dreamscapes
        .iter()
        .enumerate()
        .filter(|(_, dreamscape)| dreamscape.id == requested)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [] => bail!("RECORD_NOT_FOUND: Dreamscape identity {id}"),
        [index] => Ok(*index),
        _ => bail!("MALFORMED_SOURCE: duplicate Dreamscape identity {id}"),
    }
}

fn set_dreamscape_field(
    dreamscape: &mut DreamscapeDefinition,
    field: &str,
    value: JsonValue,
) -> Result<()> {
    match field {
        "name" => {
            let name = json_string(value, field)?;
            if name.trim().is_empty() {
                bail!("INVALID_EDIT: Dreamscape name must not be blank");
            }
            dreamscape.name = name;
        }
        "affiliation-id" | "affiliation_id" => {
            let value = json_string(value, field)?;
            let affiliation_id: AffiliationId = ron::from_str(&ron::to_string(&value)?)
                .context("INVALID_EDIT: affiliation-id must be a canonical UUIDv4")?;
            match &mut dreamscape.kind {
                DreamscapeKind::Standard {
                    affiliation_id: current,
                    ..
                } => {
                    *current = affiliation_id;
                }
                _ => bail!(
                    "FIELD_NOT_APPLICABLE: affiliation-id applies only to Standard Dreamscapes"
                ),
            }
        }
        _ => bail!("INVALID_EDIT: unsupported Dreamscape field {field}"),
    }
    Ok(())
}

fn set_dreamscape_opponents(
    dreamscape: &mut DreamscapeDefinition,
    opponent_ids: Vec<String>,
) -> Result<()> {
    let opponent_ids = opponent_ids
        .into_iter()
        .map(|id| {
            ron::from_str::<DreamscapeAvatarId>(&ron::to_string(&id)?)
                .context("INVALID_EDIT: opponent identity must be a canonical UUIDv4")
        })
        .collect::<Result<Vec<_>>>()?;
    match &mut dreamscape.kind {
        DreamscapeKind::Standard {
            opponent_dream_avatar_ids,
            ..
        } => *opponent_dream_avatar_ids = opponent_ids,
        _ => bail!("FIELD_NOT_APPLICABLE: opponent assignments apply only to Standard Dreamscapes"),
    }
    Ok(())
}

fn patch_dreamscape_source_field(
    source: &str,
    dreamscape: &DreamscapeDefinition,
    field: &str,
) -> Result<String> {
    let record = typed_record_range(
        source,
        "DreamscapeDefinition",
        "id",
        &dreamscape.id.to_string(),
    )?;
    let (source_field, replacement, nested) = match field {
        "name" => ("name", ron::to_string(&dreamscape.name)?, false),
        "affiliation-id" | "affiliation_id" => match &dreamscape.kind {
            DreamscapeKind::Standard { affiliation_id, .. } => (
                "affiliation_id",
                ron::to_string(&affiliation_id.to_string())?,
                true,
            ),
            _ => bail!("FIELD_NOT_APPLICABLE: affiliation-id applies only to Standard Dreamscapes"),
        },
        "opponent_dream_avatar_ids" => match &dreamscape.kind {
            DreamscapeKind::Standard {
                opponent_dream_avatar_ids,
                ..
            } => (
                "opponent_dream_avatar_ids",
                ron::to_string(
                    &opponent_dream_avatar_ids
                        .iter()
                        .map(ToString::to_string)
                        .collect::<Vec<_>>(),
                )?,
                true,
            ),
            _ => bail!("FIELD_NOT_APPLICABLE: opponents apply only to Standard Dreamscapes"),
        },
        _ => bail!("INVALID_EDIT: unsupported Dreamscape source field {field}"),
    };
    let range = if nested {
        let kind = top_level_field_value_range(source, record, "kind")?
            .context("MALFORMED_SOURCE: Dreamscape is missing kind")?;
        top_level_field_value_range(source, kind, source_field)?.with_context(|| {
            format!("MALFORMED_SOURCE: Dreamscape kind is missing {source_field}")
        })?
    } else {
        top_level_field_value_range(source, record, source_field)?
            .with_context(|| format!("MALFORMED_SOURCE: Dreamscape is missing {source_field}"))?
    };
    replace_source_ranges(source, vec![(range, replacement)])
}

fn edit_dreamwell(
    manifest: &Manifest,
    staging_root: &Path,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let dataset = manifest.dataset("dreamwell")?;
    if dataset.adapter != "dreamwell_v2"
        || dataset.editor != crate::manifest::EditorCapability::Semantic
    {
        bail!("FIELD_NOT_APPLICABLE: stage-edit is not registered for dreamwell");
    }
    let source_path = staging_root.join(&dataset.source);
    let original_text = fs::read_to_string(&source_path)
        .with_context(|| format!("read staged Dreamwell source {}", source_path.display()))?;
    let original: DreamwellCatalog = ron::from_str(&original_text)
        .context("MALFORMED_SOURCE: staged Dreamwell RON is invalid")?;
    dreamwell::validate(&original)
        .context("MALFORMED_SOURCE: staged Dreamwell catalog is invalid")?;
    let mut catalog = original.clone();
    let mut source_text = original_text;

    for operation in operations {
        match operation {
            EditOperation::SetDreamwellField {
                dreamwell_id,
                field,
                value,
            } => {
                let index = unique_dreamwell_index(&catalog.cards, &dreamwell_id)?;
                set_dreamwell_field(&mut catalog.cards[index], &field, value)?;
                source_text =
                    patch_dreamwell_source_field(&source_text, &catalog.cards[index], &field)?;
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to Dreamwell"),
        }
    }

    dreamwell::validate(&catalog)
        .context("INVALID_EDIT: Dreamwell edit violates the catalog contract")?;
    verify_round_trip::<DreamwellCatalog>(&source_text, &catalog)?;
    let changed = catalog != original;
    if changed {
        atomic_write(&source_path, source_text.as_bytes())?;
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: "dreamwell".into(),
        source_revision: revision(staging_root, manifest, &["dreamwell"])?,
    })
}

fn unique_dreamwell_index(cards: &[DreamwellCardDefinition], id: &str) -> Result<usize> {
    let matches = cards
        .iter()
        .enumerate()
        .filter(|(_, card)| card.id.to_string() == id)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [] => bail!("RECORD_NOT_FOUND: Dreamwell card UUID {id}"),
        [index] => Ok(*index),
        _ => bail!("MALFORMED_SOURCE: duplicate Dreamwell card UUID {id}"),
    }
}

fn set_dreamwell_field(
    card: &mut DreamwellCardDefinition,
    field: &str,
    value: JsonValue,
) -> Result<()> {
    match field {
        "name" => {
            let name = json_string(value, field)?;
            if name.trim().is_empty() {
                bail!("INVALID_EDIT: Dreamwell card name must not be blank");
            }
            card.name = name;
        }
        "rendered-text" | "ability_text" => {
            let text = json_string(value, field)?;
            card.ability_text = text.split("\n\n").map(str::to_owned).collect();
        }
        "energy-added" | "energy_added" => card.energy_added = json_u32(value, field)?,
        "order" | "deck_tier" => {
            card.deck_tier = match json_u32(value, field)? {
                0 => DeckTier::Starting,
                1 => DeckTier::One,
                2 => DeckTier::Two,
                3 => DeckTier::Three,
                4 => DeckTier::Four,
                _ => bail!("INVALID_EDIT: Dreamwell order must be in [0, 4]"),
            };
        }
        "image-number" | "image_number" => card.art.image = json_u32(value, field)?,
        "art" => {
            let object = value
                .as_object()
                .context("INVALID_EDIT: art must be an object")?;
            let crop = ArtCrop {
                x: json_number(object.get("x"), "art.x")?,
                y: json_number(object.get("y"), "art.y")?,
                scale: json_number(object.get("scale"), "art.scale")?,
            };
            if !crop.x.is_finite()
                || !crop.y.is_finite()
                || !crop.scale.is_finite()
                || crop.scale <= 0.0
            {
                bail!(
                    "INVALID_EDIT: Dreamwell art crop must contain finite offsets and a positive scale"
                );
            }
            card.art.crop = Some(crop);
        }
        _ => bail!("INVALID_EDIT: unsupported Dreamwell field {field}"),
    }
    Ok(())
}

fn patch_dreamwell_source_field(
    source: &str,
    card: &DreamwellCardDefinition,
    field: &str,
) -> Result<String> {
    let source_field = match field {
        "name" => "name",
        "rendered-text" | "ability_text" => "ability_text",
        "energy-added" | "energy_added" => "energy_added",
        "order" | "deck_tier" => "deck_tier",
        "image-number" | "image_number" | "art" => "art",
        _ => bail!("INVALID_EDIT: unsupported Dreamwell field {field}"),
    };
    let record = typed_record_range_at_indent(
        source,
        "DreamwellCardDefinition",
        "id",
        &card.id.to_string(),
        4,
    )?;
    let range = top_level_field_value_range(source, record.clone(), source_field)?
        .with_context(|| format!("MALFORMED_SOURCE: Dreamwell card is missing {source_field}"))?;
    if matches!(field, "image-number" | "image_number") {
        let image = top_level_field_value_range(source, range, "image")?
            .context("MALFORMED_SOURCE: Dreamwell art is missing image")?;
        return replace_source_ranges(source, vec![(image, card.art.image.to_string())]);
    }
    if field == "art" {
        let replacement = render_dreamwell_crop(
            card.art
                .crop
                .as_ref()
                .context("INVALID_EDIT: Dreamwell crop must be present")?,
        )?;
        if let Some(crop) = top_level_field_value_range(source, range.clone(), "crop")? {
            return replace_source_ranges(source, vec![(crop, replacement)]);
        }
        let closing = range.end - 1;
        let art_source = &source[range.clone()];
        let (insertion_at, insertion) = if art_source.contains('\n') {
            let closing_line = source[..closing]
                .rfind('\n')
                .map(|offset| offset + 1)
                .context("MALFORMED_SOURCE: multiline Dreamwell art has no closing line")?;
            let closing_indent = &source[closing_line..closing];
            (
                closing_line,
                format!("{}  crop: {},\n", closing_indent, replacement),
            )
        } else {
            (closing, format!(", crop: {replacement}"))
        };
        return replace_source_ranges(source, vec![(insertion_at..insertion_at, insertion)]);
    }
    let replacement = match source_field {
        "name" => ron::to_string(&card.name)?,
        "ability_text" => {
            let clauses = card
                .ability_text
                .iter()
                .map(ron::to_string)
                .collect::<Result<Vec<_>, _>>()?;
            format!("[{}]", clauses.join(", "))
        }
        "energy_added" => card.energy_added.to_string(),
        "deck_tier" => match card.deck_tier {
            DeckTier::Starting => "Starting".into(),
            DeckTier::One => "One".into(),
            DeckTier::Two => "Two".into(),
            DeckTier::Three => "Three".into(),
            DeckTier::Four => "Four".into(),
        },
        "art" => unreachable!(),
        _ => unreachable!(),
    };
    replace_source_ranges(source, vec![(range, replacement)])
}

fn render_dreamwell_crop(crop: &ArtCrop) -> Result<String> {
    Ok(format!(
        "(x: {}, y: {}, scale: {})",
        ron::to_string(&crop.x)?,
        ron::to_string(&crop.y)?,
        ron::to_string(&crop.scale)?
    ))
}

fn edit_dreamsigns(
    manifest: &Manifest,
    staging_root: &Path,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let dataset = manifest.dataset("dreamsigns")?;
    if dataset.adapter != "dreamsigns_v1"
        || dataset.editor != crate::manifest::EditorCapability::Semantic
    {
        bail!("FIELD_NOT_APPLICABLE: stage-edit is not registered for dreamsigns");
    }
    let source_path = staging_root.join(&dataset.source);
    let metadata_dataset = manifest.dataset("internal-dreamsign-metadata")?;
    let metadata_path = staging_root.join(&metadata_dataset.source);
    let tags_dataset = manifest.dataset("dreamsign-tags")?;
    let tags_path = staging_root.join(&tags_dataset.source);

    let original_source_text = fs::read_to_string(&source_path)?;
    let original_metadata_text = fs::read_to_string(&metadata_path)?;
    let original_tags_text = fs::read_to_string(&tags_path)?;
    let original: Vec<DreamsignDefinition> = ron::from_str(&original_source_text)
        .context("MALFORMED_SOURCE: staged Dreamsign RON is invalid")?;
    let original_metadata: DreamsignMetadataCatalog = ron::from_str(&original_metadata_text)
        .context("MALFORMED_SOURCE: staged internal Dreamsign metadata RON is invalid")?;
    let original_tags: DreamsignTagCatalog = ron::from_str(&original_tags_text)
        .context("MALFORMED_SOURCE: staged Dreamsign tag registry RON is invalid")?;
    dreamsigns::validate_definitions(&original)?;
    dreamsigns::validate_metadata(&original_metadata)?;
    dreamsigns::validate_tags(&original_tags)?;

    let mut definitions = original.clone();
    let mut metadata = original_metadata.clone();
    let mut tags = original_tags.clone();
    let mut source_text = original_source_text;
    let mut metadata_text = original_metadata_text;
    let mut tags_text = original_tags_text;

    for operation in operations {
        match operation {
            EditOperation::SetDreamsignField {
                dreamsign_id,
                field,
                value,
            } => {
                let index = unique_dreamsign_index(&definitions, &dreamsign_id)?;
                match field.as_str() {
                    "name" | "rendered-text" | "ability_text" => {
                        let before = definitions[index].clone();
                        set_dreamsign_definition_field(&mut definitions[index], &field, value)?;
                        dreamsigns::validate_definitions(&definitions).context(
                            "INVALID_EDIT: Dreamsign edit violates the catalog contract",
                        )?;
                        if definitions[index] != before {
                            source_text = patch_dreamsign_definition_field(
                                &source_text,
                                &definitions[index],
                                &field,
                            )?;
                        }
                    }
                    "tags" => {
                        let values: Vec<String> = serde_json::from_value(value)
                            .context("INVALID_EDIT: Dreamsign tags must be an array of strings")?;
                        let known = tags
                            .tags
                            .iter()
                            .map(|tag| tag.name.as_str())
                            .collect::<BTreeSet<_>>();
                        if values.iter().any(|value| !known.contains(value.as_str())) {
                            bail!("INVALID_EDIT: Dreamsign tags must use the canonical registry");
                        }
                        let id = definitions[index].id;
                        let replacement = {
                            let entry = metadata
                                .dreamsigns
                                .get_mut(&id)
                                .context("MALFORMED_SOURCE: Dreamsign metadata entry is missing")?;
                            if entry.tags == values {
                                None
                            } else {
                                entry.tags = values;
                                Some(entry.tags.clone())
                            }
                        };
                        if let Some(replacement) = replacement {
                            dreamsigns::validate_metadata(&metadata)?;
                            metadata_text =
                                patch_dreamsign_metadata_tags(&metadata_text, id, &replacement)?;
                        }
                    }
                    _ => bail!("INVALID_EDIT: unsupported Dreamsign field {field}"),
                }
            }
            EditOperation::ReplaceDreamsignTags { tags: replacement } => {
                let replacement = DreamsignTagCatalog { tags: replacement };
                dreamsigns::validate_tags(&replacement)
                    .context("INVALID_EDIT: Dreamsign tag registry is invalid")?;
                let known = replacement
                    .tags
                    .iter()
                    .map(|tag| tag.name.as_str())
                    .collect::<BTreeSet<_>>();
                for (id, entry) in &mut metadata.dreamsigns {
                    let retained = entry
                        .tags
                        .iter()
                        .filter(|tag| known.contains(tag.as_str()))
                        .cloned()
                        .collect::<Vec<_>>();
                    if retained != entry.tags {
                        entry.tags = retained;
                        metadata_text =
                            patch_dreamsign_metadata_tags(&metadata_text, *id, &entry.tags)?;
                    }
                }
                if replacement != tags {
                    tags = replacement;
                    tags_text = patch_dreamsign_tag_catalog(&tags_text, &tags)?;
                }
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to Dreamsigns"),
        }
    }

    dreamsigns::validate_definitions(&definitions)?;
    dreamsigns::validate_metadata(&metadata)?;
    dreamsigns::validate_tags(&tags)?;
    verify_round_trip::<Vec<DreamsignDefinition>>(&source_text, &definitions)?;
    verify_round_trip::<DreamsignMetadataCatalog>(&metadata_text, &metadata)?;
    verify_round_trip::<DreamsignTagCatalog>(&tags_text, &tags)?;
    let changed = definitions != original || metadata != original_metadata || tags != original_tags;
    if definitions != original {
        atomic_write(&source_path, source_text.as_bytes())?;
    }
    if metadata != original_metadata {
        atomic_write(&metadata_path, metadata_text.as_bytes())?;
    }
    if tags != original_tags {
        atomic_write(&tags_path, tags_text.as_bytes())?;
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: "dreamsigns".into(),
        source_revision: revision(
            staging_root,
            manifest,
            &[
                "dreamsigns",
                "internal-dreamsign-metadata",
                "dreamsign-tags",
            ],
        )?,
    })
}

fn unique_dreamsign_index(definitions: &[DreamsignDefinition], id: &str) -> Result<usize> {
    let literal = ron::to_string(id)?;
    let requested: DreamsignId = ron::from_str(&literal)
        .context("INVALID_EDIT: Dreamsign identity must be a canonical UUIDv4")?;
    definitions
        .iter()
        .position(|definition| definition.id == requested)
        .with_context(|| format!("RECORD_NOT_FOUND: Dreamsign UUID {id}"))
}

fn set_dreamsign_definition_field(
    definition: &mut DreamsignDefinition,
    field: &str,
    value: JsonValue,
) -> Result<()> {
    match field {
        "name" => {
            let value = json_string(value, field)?.trim().to_owned();
            if value.is_empty() {
                bail!("INVALID_EDIT: Dreamsign name cannot be blank");
            }
            definition.name = value;
        }
        "rendered-text" | "ability_text" => {
            let value = json_string(value, field)?;
            let paragraphs = value.split("\n\n").map(str::to_owned).collect::<Vec<_>>();
            if paragraphs.is_empty()
                || paragraphs
                    .iter()
                    .any(|paragraph| paragraph.trim().is_empty())
            {
                bail!("INVALID_EDIT: Dreamsign ability text must contain non-empty paragraphs");
            }
            definition.ability_text = paragraphs;
        }
        _ => bail!("INVALID_EDIT: unsupported Dreamsign field {field}"),
    }
    Ok(())
}

fn patch_dreamsign_definition_field(
    source: &str,
    definition: &DreamsignDefinition,
    field: &str,
) -> Result<String> {
    let source_field = match field {
        "name" => "name",
        "rendered-text" | "ability_text" => "ability_text",
        _ => bail!("INVALID_EDIT: unsupported Dreamsign field {field}"),
    };
    let record = typed_record_range(
        source,
        "DreamsignDefinition",
        "id",
        &definition.id.to_string(),
    )?;
    let range = top_level_field_value_range(source, record, source_field)?
        .with_context(|| format!("MALFORMED_SOURCE: Dreamsign is missing {source_field}"))?;
    let replacement = match source_field {
        "name" => ron::to_string(&definition.name)?,
        "ability_text" => ron::to_string(&definition.ability_text)?,
        _ => unreachable!(),
    };
    replace_source_ranges(source, vec![(range, replacement)])
}

fn dreamsign_metadata_record_range(source: &str, id: DreamsignId) -> Result<Range<usize>> {
    let marker = format!("\n    {}: ", ron::to_string(&id.to_string())?);
    let matches = source.match_indices(&marker).collect::<Vec<_>>();
    if matches.is_empty() {
        bail!("RECORD_NOT_FOUND: internal Dreamsign metadata UUID {id}");
    }
    if matches.len() > 1 {
        bail!("MALFORMED_SOURCE: duplicate internal Dreamsign metadata UUID {id}");
    }
    let value_start = matches[0].0 + marker.len();
    let opening = source[value_start..]
        .find('(')
        .map(|offset| value_start + offset)
        .context("MALFORMED_SOURCE: Dreamsign metadata entry is not a record")?;
    let closing = matching_delimiter(source, opening)?;
    Ok(opening..closing + 1)
}

fn patch_dreamsign_metadata_tags(source: &str, id: DreamsignId, tags: &[String]) -> Result<String> {
    let record = dreamsign_metadata_record_range(source, id)?;
    let range = top_level_field_value_range(source, record.clone(), "tags")?
        .context("MALFORMED_SOURCE: Dreamsign metadata entry is missing tags")?;
    replace_source_ranges(source, vec![(range, ron::to_string(tags)?)])
}

fn patch_dreamsign_tag_catalog(source: &str, catalog: &DreamsignTagCatalog) -> Result<String> {
    let start = source
        .find("\n(\n")
        .map(|offset| offset + 1)
        .context("MALFORMED_SOURCE: Dreamsign tag registry has no root record")?;
    let record = start..matching_delimiter(source, start)? + 1;
    let range = top_level_field_value_range(source, record, "tags")?
        .context("MALFORMED_SOURCE: Dreamsign tag registry is missing tags")?;
    replace_source_ranges(source, vec![(range, ron::to_string(&catalog.tags)?)])
}

fn edit_dream_guides(
    manifest: &Manifest,
    staging_root: &Path,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let dataset = manifest.dataset("dream-guides")?;
    if dataset.adapter != "dream_guides_v1"
        || dataset.editor != crate::manifest::EditorCapability::Semantic
    {
        bail!("FIELD_NOT_APPLICABLE: stage-edit is not registered for dream-guides");
    }
    let source_path = staging_root.join(&dataset.source);
    let original_text = fs::read_to_string(&source_path)
        .with_context(|| format!("read staged Dream guide source {}", source_path.display()))?;
    let original: Vec<GuideDefinition> = ron::from_str(&original_text)
        .context("MALFORMED_SOURCE: staged Dream guide RON is invalid")?;
    dream_guides::validate(&original)
        .context("MALFORMED_SOURCE: staged Dream guide catalog is invalid")?;
    let mut guides = original.clone();
    let mut source_text = original_text;

    for operation in operations {
        let (first_id, second_id, field) = match operation {
            EditOperation::SwapDreamGuideHomes {
                first_guide_id,
                second_guide_id,
            } => (first_guide_id, second_guide_id, "home_dreamscape_id"),
            EditOperation::SwapDreamGuideSpecialties {
                first_guide_id,
                second_guide_id,
            } => (first_guide_id, second_guide_id, "specialty"),
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to Dream guides"),
        };
        let first = unique_dream_guide_index(&guides, &first_id)?;
        let second = unique_dream_guide_index(&guides, &second_id)?;
        if first == second {
            continue;
        }
        source_text =
            swap_dream_guide_source_field(&source_text, &mut guides, first, second, field)?;
        dream_guides::validate(&guides)
            .context("INVALID_EDIT: Dream guide swap violates the catalog contract")?;
    }

    verify_round_trip::<Vec<GuideDefinition>>(&source_text, &guides)?;
    let changed = guides != original;
    if changed {
        atomic_write(&source_path, source_text.as_bytes())?;
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: "dream-guides".into(),
        source_revision: revision(staging_root, manifest, &["dream-guides"])?,
    })
}

fn unique_dream_guide_index(guides: &[GuideDefinition], id: &str) -> Result<usize> {
    let literal = ron::to_string(id)?;
    let requested = match ron::from_str::<GuideId>(&literal) {
        Ok(id) => id,
        Err(_) => dream_guides::canonical_guide_id(id).context(
            "INVALID_EDIT: Dream guide identity must be a canonical UUIDv4 or registered compatibility key",
        )?,
    };
    let matches = guides
        .iter()
        .enumerate()
        .filter(|(_, guide)| guide.id == requested)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    if matches.is_empty() {
        bail!("RECORD_NOT_FOUND: Dream guide identity {id}");
    }
    if matches.len() > 1 {
        bail!("MALFORMED_SOURCE: duplicate Dream guide identity {id}");
    }
    Ok(matches[0])
}

fn swap_dream_guide_source_field(
    source: &str,
    guides: &mut [GuideDefinition],
    first: usize,
    second: usize,
    field: &str,
) -> Result<String> {
    let first_record = typed_record_range(
        source,
        "GuideDefinition",
        "id",
        &guides[first].id.to_string(),
    )?;
    let second_record = typed_record_range(
        source,
        "GuideDefinition",
        "id",
        &guides[second].id.to_string(),
    )?;
    let first_range = top_level_field_value_range(source, first_record, field)?
        .with_context(|| format!("MALFORMED_SOURCE: Dream guide is missing {field}"))?;
    let second_range = top_level_field_value_range(source, second_record, field)?
        .with_context(|| format!("MALFORMED_SOURCE: Dream guide is missing {field}"))?;
    let first_source = source[first_range.clone()].to_owned();
    let second_source = source[second_range.clone()].to_owned();

    match field {
        "home_dreamscape_id" => {
            let value = guides[first].home_dreamscape_id;
            guides[first].home_dreamscape_id = guides[second].home_dreamscape_id;
            guides[second].home_dreamscape_id = value;
        }
        "specialty" => {
            let value = guides[first].specialty.clone();
            guides[first].specialty = guides[second].specialty.clone();
            guides[second].specialty = value;
        }
        _ => bail!("INVALID_EDIT: unsupported Dream guide source field {field}"),
    }

    replace_source_ranges(
        source,
        vec![(first_range, second_source), (second_range, first_source)],
    )
}

fn replace_source_ranges(
    source: &str,
    mut replacements: Vec<(Range<usize>, String)>,
) -> Result<String> {
    replacements.sort_by_key(|(range, _)| std::cmp::Reverse(range.start));
    let mut result = source.to_owned();
    let mut previous_start = source.len();
    for (range, replacement) in replacements {
        if range.end > previous_start || range.start > range.end || range.end > source.len() {
            bail!("MALFORMED_SOURCE: overlapping or invalid RON source replacement");
        }
        result.replace_range(range.clone(), &replacement);
        previous_start = range.start;
    }
    Ok(result)
}

fn edit_figments(
    manifest: &Manifest,
    staging_root: &Path,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let dataset = manifest.dataset("figments")?;
    if dataset.adapter != "figments_v1"
        || dataset.editor != crate::manifest::EditorCapability::Semantic
    {
        bail!("FIELD_NOT_APPLICABLE: stage-edit is not registered for Figments");
    }
    let source_path = staging_root.join(&dataset.source);
    let original_text = fs::read_to_string(&source_path)
        .with_context(|| format!("read staged Figment source {}", source_path.display()))?;
    let original: Vec<FigmentDefinition> =
        ron::from_str(&original_text).context("MALFORMED_SOURCE: staged Figment RON is invalid")?;
    crate::models::figments::lower(original.clone())
        .context("MALFORMED_SOURCE: staged Figment catalog is invalid")?;
    let mut figments = original.clone();
    let mut source_text = original_text;

    for operation in operations {
        match operation {
            EditOperation::SetFigmentField {
                figment_id,
                field,
                value,
            } => {
                let index = unique_figment_index(&figments, &figment_id)?;
                set_figment_field(&mut figments[index], &field, value)?;
                source_text = patch_figment_source_field(&source_text, &figments[index], &field)?;
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to Figments"),
        }
    }

    crate::models::figments::lower(figments.clone())
        .context("INVALID_EDIT: Figment edit violates the catalog contract")?;
    verify_round_trip::<Vec<FigmentDefinition>>(&source_text, &figments)?;
    let changed = figments != original;
    if changed {
        atomic_write(&source_path, source_text.as_bytes())?;
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: "figments".into(),
        source_revision: revision(staging_root, manifest, &["figments"])?,
    })
}

fn unique_figment_index(figments: &[FigmentDefinition], id: &str) -> Result<usize> {
    let matches = figments
        .iter()
        .enumerate()
        .filter(|(_, figment)| figment.id.to_string() == id)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [] => bail!("RECORD_NOT_FOUND: Figment UUID {id}"),
        [index] => Ok(*index),
        _ => bail!("MALFORMED_SOURCE: duplicate Figment UUID {id}"),
    }
}

fn set_figment_field(figment: &mut FigmentDefinition, field: &str, value: JsonValue) -> Result<()> {
    match field {
        "name" => figment.name = json_string(value, field)?,
        "subtype" => {
            figment.character_type = match json_string(value, field)?.as_str() {
                "Warrior" => FigmentCharacterType::Warrior,
                "Shadow" => FigmentCharacterType::Shadow,
                "Spirit Animal" => FigmentCharacterType::SpiritAnimal,
                "Monstrosity" => FigmentCharacterType::Monstrosity,
                "Survivor" => FigmentCharacterType::Survivor,
                "Wraith" => FigmentCharacterType::Wraith,
                "Ethereal" => FigmentCharacterType::Ethereal,
                "Ember" => FigmentCharacterType::Ember,
                "Outsider" => FigmentCharacterType::Outsider,
                _ => bail!("INVALID_EDIT: subtype must be a canonical Figment character type"),
            };
        }
        "spark" => figment.base_spark = figment_json_u32(&value, "spark")?,
        "rendered-text" => {
            figment.behavior = match json_string(value, field)?.as_str() {
                "" => FigmentBehavior::Vanilla,
                "Vengeful" => FigmentBehavior::Vengeful,
                "Awakened" => FigmentBehavior::Awakened,
                "This character has +1✦ for each other warrior you control." => {
                    FigmentBehavior::Legionnaire
                }
                _ => bail!("INVALID_EDIT: rendered-text must match a canonical Figment behavior"),
            };
        }
        "image-number" => figment.image_number = figment_json_u32(&value, "image-number")?,
        "art" => {
            let object = value
                .as_object()
                .context("INVALID_EDIT: art must be an object")?;
            figment.art = Some(FigmentArtCrop {
                x: json_number(object.get("x"), "art.x")?,
                y: json_number(object.get("y"), "art.y")?,
                scale: json_number(object.get("scale"), "art.scale")?,
            });
        }
        _ => bail!("INVALID_EDIT: unsupported Figment field {field}"),
    }
    Ok(())
}

fn figment_json_u32(value: &JsonValue, field: &str) -> Result<u32> {
    let value = value
        .as_u64()
        .with_context(|| format!("INVALID_EDIT: {field} must be a non-negative integer"))?;
    u32::try_from(value).with_context(|| format!("INVALID_EDIT: {field} exceeds u32"))
}

fn patch_figment_source_field(
    source: &str,
    figment: &FigmentDefinition,
    field: &str,
) -> Result<String> {
    let source_field = match field {
        "name" => "name",
        "subtype" => "character_type",
        "spark" => "base_spark",
        "rendered-text" => "behavior",
        "image-number" => "image_number",
        "art" => "art",
        _ => bail!("INVALID_EDIT: unsupported Figment field {field}"),
    };
    let record = typed_record_range(source, "FigmentDefinition", "id", &figment.id.to_string())?;
    let replacement = render_figment_source_field(figment, source_field)?;
    if let Some(value) = top_level_field_value_range(source, record.clone(), source_field)? {
        return Ok(format!(
            "{}{}{}",
            &source[..value.start],
            replacement,
            &source[value.end..]
        ));
    }
    if source_field == "art" {
        let image = top_level_field_value_range(source, record.clone(), "image_number")?
            .context("MALFORMED_SOURCE: Figment is missing image_number")?;
        let comma_offset = source[image.end..record.end]
            .find(',')
            .context("MALFORMED_SOURCE: image_number is missing its trailing comma")?;
        let insertion = image.end + comma_offset + 1;
        return Ok(format!(
            "{}\n    art: {},{}",
            &source[..insertion],
            replacement,
            &source[insertion..]
        ));
    }
    bail!("MALFORMED_SOURCE: Figment is missing field {source_field}")
}

fn render_figment_source_field(figment: &FigmentDefinition, field: &str) -> Result<String> {
    match field {
        "name" => Ok(ron::to_string(&figment.name)?),
        "character_type" => Ok(ron::to_string(&figment.character_type)?),
        "base_spark" => Ok(figment.base_spark.to_string()),
        "behavior" => Ok(ron::to_string(&figment.behavior)?),
        "image_number" => Ok(figment.image_number.to_string()),
        "art" => {
            let art = figment.art.context("art must be present when rendering")?;
            Ok(format!(
                "(x: {}, y: {}, scale: {})",
                ron::to_string(&art.x)?,
                ron::to_string(&art.y)?,
                ron::to_string(&art.scale)?,
            ))
        }
        _ => bail!("INVALID_EDIT: unsupported Figment source field {field}"),
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

fn edit_glossary(
    manifest: &Manifest,
    staging_root: &Path,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let dataset = manifest.dataset("glossary")?;
    if dataset.adapter != "glossary_v1" {
        bail!("FIELD_NOT_APPLICABLE: Glossary editor requires glossary_v1");
    }
    let source_path = staging_root.join(&dataset.source);
    let original_text = fs::read_to_string(&source_path)
        .with_context(|| format!("read staged Glossary source {}", source_path.display()))?;
    let original: Vec<GlossaryDefinition> = ron::from_str(&original_text)
        .context("MALFORMED_SOURCE: staged Glossary RON is invalid")?;
    glossary::lower(original.clone())
        .context("MALFORMED_SOURCE: staged Glossary catalog is invalid")?;
    let mut definitions = original.clone();
    let mut source_text = original_text;

    for operation in operations {
        match operation {
            EditOperation::SetGlossaryField {
                glossary_id,
                field,
                value,
            } => {
                let index = unique_glossary_index(&definitions, &glossary_id)?;
                let before = definitions[index].clone();
                set_glossary_field(&mut definitions[index], &field, value)?;
                glossary::lower(definitions.clone())
                    .context("INVALID_EDIT: Glossary edit violates the catalog contract")?;
                if definitions[index] != before {
                    source_text =
                        patch_glossary_source_field(&source_text, &definitions[index], &field)?;
                }
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to Glossary"),
        }
    }

    verify_round_trip::<Vec<GlossaryDefinition>>(&source_text, &definitions)?;
    let changed = definitions != original;
    if changed {
        atomic_write(&source_path, source_text.as_bytes())?;
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: "glossary".into(),
        source_revision: revision(staging_root, manifest, &["glossary"])?,
    })
}

fn unique_glossary_index(definitions: &[GlossaryDefinition], id: &str) -> Result<usize> {
    let requested = GlossaryId::parse(id).map_err(|error| {
        anyhow::anyhow!("INVALID_EDIT: Glossary route identity must be a canonical UUIDv4: {error}")
    })?;
    let matches = definitions
        .iter()
        .enumerate()
        .filter(|(_, definition)| definition.id == requested)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    if matches.is_empty() {
        bail!("RECORD_NOT_FOUND: Glossary UUID {id}");
    }
    if matches.len() > 1 {
        bail!("MALFORMED_SOURCE: duplicate Glossary UUID {id}");
    }
    Ok(matches[0])
}

fn set_glossary_field(
    definition: &mut GlossaryDefinition,
    field: &str,
    value: JsonValue,
) -> Result<()> {
    match field {
        "term" => {
            let value = json_string(value, field)?.trim().to_owned();
            if value.is_empty() {
                bail!("INVALID_EDIT: Glossary term cannot be blank");
            }
            definition.term = value;
        }
        "definition" => {
            let value = json_string(value, field)?.trim().to_owned();
            if value.is_empty() {
                bail!("INVALID_EDIT: Glossary definition cannot be blank");
            }
            definition.definition = value;
        }
        "priority" => {
            definition.priority = value
                .as_i64()
                .with_context(|| "INVALID_EDIT: Glossary priority must be an integer")?;
        }
        "variants" => {
            let values = value
                .as_array()
                .with_context(|| "INVALID_EDIT: Glossary variants must be an array")?;
            let mut variants = Vec::with_capacity(values.len());
            for value in values {
                let variant = value
                    .as_str()
                    .with_context(|| "INVALID_EDIT: every Glossary variant must be a string")?
                    .trim()
                    .to_owned();
                if !variant.is_empty() {
                    variants.push(variant);
                }
            }
            definition.variants = variants;
        }
        "term-presentation" | "term_presentation" | "termPresentation" => {
            definition.term_presentation = if value.is_null() {
                None
            } else {
                Some(match json_string(value, field)?.as_str() {
                    "symbolOnly" | "symbol-only" => TermPresentation::SymbolOnly,
                    "definitionOnly" | "definition-only" => TermPresentation::DefinitionOnly,
                    other => bail!("INVALID_EDIT: unsupported Glossary term presentation {other}"),
                })
            };
        }
        _ => bail!("INVALID_EDIT: unsupported Glossary field {field}"),
    }
    Ok(())
}

fn patch_glossary_source_field(
    source: &str,
    definition: &GlossaryDefinition,
    field: &str,
) -> Result<String> {
    let source_field = match field {
        "term" => "term",
        "definition" => "definition",
        "priority" => "priority",
        "variants" => "variants",
        "term-presentation" | "term_presentation" | "termPresentation" => "term_presentation",
        _ => bail!("INVALID_EDIT: unsupported Glossary field {field}"),
    };
    let record = typed_record_range(
        source,
        "GlossaryDefinition",
        "id",
        &definition.id.to_string(),
    )?;
    if let Some(value) = top_level_field_value_range(source, record.clone(), source_field)? {
        if source_field == "term_presentation" && definition.term_presentation.is_none() {
            let line_start = source[..value.start]
                .rfind('\n')
                .context("MALFORMED_SOURCE: term_presentation must occupy its own line")?
                + 1;
            let line_end = value.end
                + source[value.end..]
                    .find('\n')
                    .context("MALFORMED_SOURCE: term_presentation line is unterminated")?
                + 1;
            return Ok(format!("{}{}", &source[..line_start], &source[line_end..]));
        }
        let replacement = render_glossary_source_field(definition, source_field)?;
        return Ok(format!(
            "{}{}{}",
            &source[..value.start],
            replacement,
            &source[value.end..]
        ));
    }
    if source_field == "term_presentation" {
        let Some(_) = definition.term_presentation else {
            return Ok(source.to_owned());
        };
        let definition_value =
            top_level_field_value_range(source, record.clone(), "definition")?
                .context("MALFORMED_SOURCE: Glossary record is missing definition")?;
        let comma_offset = source[definition_value.end..record.end]
            .find(',')
            .context("MALFORMED_SOURCE: Glossary definition is missing its trailing comma")?;
        let insertion = definition_value.end + comma_offset + 1;
        let replacement = render_glossary_source_field(definition, source_field)?;
        return Ok(format!(
            "{}\n    term_presentation: {},{}",
            &source[..insertion],
            replacement,
            &source[insertion..]
        ));
    }
    bail!(
        "MALFORMED_SOURCE: missing field {source_field} on Glossary {}",
        definition.id
    )
}

fn render_glossary_source_field(definition: &GlossaryDefinition, field: &str) -> Result<String> {
    match field {
        "term" => Ok(ron::to_string(&definition.term)?),
        "definition" => Ok(ron::to_string(&definition.definition)?),
        "priority" => Ok(definition.priority.to_string()),
        "variants" => Ok(ron::to_string(&definition.variants)?),
        "term_presentation" => Ok(
            match definition
                .term_presentation
                .context("term_presentation must be present when rendering")?
            {
                TermPresentation::SymbolOnly => "SymbolOnly".into(),
                TermPresentation::DefinitionOnly => "DefinitionOnly".into(),
            },
        ),
        _ => bail!("INVALID_EDIT: unsupported Glossary source field {field}"),
    }
}

fn edit_cards(
    manifest: &Manifest,
    staging_root: &Path,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let cards_dataset = manifest.dataset("cards")?;
    if cards_dataset.adapter != "cards_v2"
        || cards_dataset.editor != crate::manifest::EditorCapability::Semantic
    {
        bail!("FIELD_NOT_APPLICABLE: stage-edit is not registered for Cards");
    }
    let cards_path = staging_root.join(&cards_dataset.source);
    let original_text = fs::read_to_string(&cards_path)
        .with_context(|| format!("read staged Cards source {}", cards_path.display()))?;
    let original: Vec<CardDefinition> =
        ron::from_str(&original_text).context("MALFORMED_SOURCE: staged Cards RON is invalid")?;
    reject_duplicate_cards(&original)?;
    let mut cards = original.clone();
    let mut cards_text = original_text;
    let metadata_dataset = manifest.dataset("internal-card-metadata")?;
    if metadata_dataset.adapter != "internal_card_metadata_v1"
        || metadata_dataset.editor != crate::manifest::EditorCapability::Semantic
    {
        bail!("FIELD_NOT_APPLICABLE: canonical internal card metadata is not editable");
    }
    let metadata_path = staging_root.join(&metadata_dataset.source);
    let original_metadata_text = fs::read_to_string(&metadata_path).with_context(|| {
        format!(
            "read staged card metadata source {}",
            metadata_path.display()
        )
    })?;
    let mut metadata: CardMetadataCatalog = ron::from_str(&original_metadata_text)
        .context("MALFORMED_SOURCE: staged internal card metadata RON is invalid")?;
    internal_card_metadata::validate(&metadata)
        .context("MALFORMED_SOURCE: staged internal card metadata catalog is invalid")?;
    let original_metadata = metadata.clone();
    let mut metadata_text = original_metadata_text;

    for operation in operations {
        match operation {
            EditOperation::SetCardField {
                card_id,
                field,
                value,
            } => {
                let index = unique_card_index(&cards, &card_id)?;
                if field == "tags" {
                    let metadata_index = unique_card_metadata_index(&metadata, &card_id)?;
                    let before = metadata.cards[metadata_index].clone();
                    set_card_metadata_tags(&mut metadata.cards[metadata_index], value)?;
                    if metadata.cards[metadata_index] != before {
                        metadata_text = patch_card_metadata_tags(
                            &metadata_text,
                            &metadata.cards[metadata_index],
                        )?;
                    }
                } else {
                    let before = cards[index].clone();
                    set_card_field(&mut cards[index], &field, value)?;
                    if cards[index] != before {
                        cards_text = patch_card_source_field(&cards_text, &cards[index], &field)?;
                    }
                }
            }
            EditOperation::UpsertFacet { facet, name, color } => {
                validate_facet(&name, &color)?;
                let existed = upsert_facet(&mut metadata, facet, name.clone(), color)?;
                let updated = facet_entries(&metadata, facet)
                    .iter()
                    .find(|entry| entry.name == name)
                    .context("updated facet is missing from internal card metadata")?;
                metadata_text = patch_card_metadata_facet(&metadata_text, facet, updated, existed)?;
            }
            EditOperation::DeleteFacet { facet, name } => {
                delete_facet(&mut metadata, facet, &name)?;
                metadata_text = delete_card_metadata_facet(&metadata_text, facet, &name)?;
                if matches!(facet, Facet::Tags) {
                    for card_id in remove_tag_from_card_metadata(&mut metadata, &name)? {
                        let index = unique_card_metadata_index(&metadata, &card_id.to_string())?;
                        metadata_text =
                            patch_card_metadata_tags(&metadata_text, &metadata.cards[index])?;
                    }
                }
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to Cards"),
        }
    }
    reject_duplicate_cards(&cards)?;
    internal_card_metadata::validate(&metadata)
        .context("INVALID_EDIT: internal card metadata edit violates the catalog contract")?;

    verify_round_trip::<Vec<CardDefinition>>(&cards_text, &cards)?;
    verify_round_trip::<CardMetadataCatalog>(&metadata_text, &metadata)?;
    let changed = cards != original || metadata != original_metadata;
    if changed {
        if cards != original {
            atomic_write(&cards_path, cards_text.as_bytes())?;
        }
        if metadata != original_metadata {
            atomic_write(&metadata_path, metadata_text.as_bytes())?;
        }
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: "cards".into(),
        source_revision: revision(staging_root, manifest, &["cards", "internal-card-metadata"])?,
    })
}

fn edit_dream_avatars(
    manifest: &Manifest,
    staging_root: &Path,
    operations: Vec<EditOperation>,
) -> Result<EditReport> {
    let dataset = manifest.dataset("dream-avatars")?;
    let source_path = staging_root.join(&dataset.source);
    let original_text = fs::read_to_string(&source_path)
        .with_context(|| format!("read staged DreamAvatar source {}", source_path.display()))?;
    let original: Vec<AvatarDefinition> = ron::from_str(&original_text)
        .context("MALFORMED_SOURCE: staged DreamAvatar RON is invalid")?;
    dream_avatars::validate(&original)
        .context("MALFORMED_SOURCE: staged DreamAvatar catalog is invalid")?;
    let mut avatars = original.clone();
    let mut source_text = original_text;

    for operation in operations {
        match operation {
            EditOperation::SetDreamAvatarField {
                avatar_id,
                field,
                value,
            } => {
                let index = unique_dream_avatar_index(&avatars, &avatar_id)?;
                let before = avatars[index].clone();
                set_dream_avatar_field(&mut avatars[index], &field, value)?;
                dream_avatars::validate(&avatars)
                    .context("INVALID_EDIT: DreamAvatar edit violates the catalog contract")?;
                if avatars[index] != before {
                    source_text =
                        patch_dream_avatar_source_field(&source_text, &avatars[index], &field)?;
                }
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to DreamAvatars"),
        }
    }

    verify_round_trip::<Vec<AvatarDefinition>>(&source_text, &avatars)?;
    let changed = avatars != original;
    if changed {
        atomic_write(&source_path, source_text.as_bytes())?;
    }
    Ok(EditReport {
        ok: true,
        changed,
        dataset_id: "dream-avatars".into(),
        source_revision: revision(staging_root, manifest, &["dream-avatars"])?,
    })
}

fn unique_dream_avatar_index(avatars: &[AvatarDefinition], id: &str) -> Result<usize> {
    let id_literal = ron::to_string(id)?;
    let requested: DreamAvatarId = ron::from_str(&id_literal)
        .context("INVALID_EDIT: DreamAvatar route identity must be a canonical UUIDv4")?;
    let matches = avatars
        .iter()
        .enumerate()
        .filter(|(_, avatar)| avatar.id == requested)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    if matches.is_empty() {
        bail!("RECORD_NOT_FOUND: DreamAvatar UUID {id}");
    }
    if matches.len() > 1 {
        bail!("MALFORMED_SOURCE: duplicate DreamAvatar UUID {id}");
    }
    Ok(matches[0])
}

fn set_dream_avatar_field(
    avatar: &mut AvatarDefinition,
    field: &str,
    value: JsonValue,
) -> Result<()> {
    match field {
        "name" => {
            let value = json_string(value, field)?.trim().to_owned();
            if value.is_empty() {
                bail!("INVALID_EDIT: DreamAvatar name cannot be blank");
            }
            avatar.name = value;
        }
        "title" => {
            let value = json_string(value, field)?.trim().to_owned();
            if value.is_empty() {
                bail!("INVALID_EDIT: DreamAvatar title cannot be blank");
            }
            avatar.title = value;
        }
        "rendered-text" | "ability_text" => {
            let value = json_string(value, field)?;
            let paragraphs = value.split("\n\n").map(str::to_owned).collect::<Vec<_>>();
            if paragraphs.is_empty()
                || paragraphs
                    .iter()
                    .any(|paragraph| paragraph.trim().is_empty())
            {
                bail!("INVALID_EDIT: DreamAvatar ability text must contain non-empty paragraphs");
            }
            avatar.ability_text = paragraphs;
        }
        "image-number" | "image_number" => {
            let image = json_u32(value, field)?;
            if !(1..=9_999).contains(&image) {
                bail!("INVALID_EDIT: DreamAvatar image number must be in [1, 9999]");
            }
            avatar.portrait.image = image;
        }
        "starting-essence" | "starting_essence" => {
            avatar.starting_essence = Some(json_u32(value, field)?);
        }
        _ => bail!("INVALID_EDIT: unsupported DreamAvatar field {field}"),
    }
    Ok(())
}

fn json_u32(value: JsonValue, field: &str) -> Result<u32> {
    if let Some(value) = value.as_u64() {
        return u32::try_from(value)
            .with_context(|| format!("INVALID_EDIT: {field} is outside the supported range"));
    }
    let text = value
        .as_str()
        .with_context(|| format!("INVALID_EDIT: {field} must be a non-negative integer"))?;
    text.parse::<u32>()
        .with_context(|| format!("INVALID_EDIT: {field} must be a non-negative integer"))
}

fn patch_dream_avatar_source_field(
    source: &str,
    avatar: &AvatarDefinition,
    field: &str,
) -> Result<String> {
    let source_field = match field {
        "name" => "name",
        "title" => "title",
        "rendered-text" | "ability_text" => "ability_text",
        "image-number" | "image_number" => "portrait.image",
        "starting-essence" | "starting_essence" => "starting_essence",
        _ => bail!("INVALID_EDIT: unsupported DreamAvatar field {field}"),
    };
    let record = typed_record_range(source, "AvatarDefinition", "id", &avatar.id.to_string())?;
    let value = if source_field == "portrait.image" {
        let portrait = top_level_field_value_range(source, record.clone(), "portrait")?
            .context("MALFORMED_SOURCE: DreamAvatar record is missing portrait")?;
        top_level_field_value_range(source, portrait, "image")?
    } else {
        top_level_field_value_range(source, record.clone(), source_field)?
    };
    if let Some(value) = value {
        let replacement = render_dream_avatar_source_field(avatar, source_field)?;
        return Ok(format!(
            "{}{}{}",
            &source[..value.start],
            replacement,
            &source[value.end..]
        ));
    }
    if source_field == "starting_essence" {
        let portrait = top_level_field_value_range(source, record.clone(), "portrait")?
            .context("MALFORMED_SOURCE: DreamAvatar record is missing portrait")?;
        let comma_offset = source[portrait.end..record.end]
            .find(',')
            .context("MALFORMED_SOURCE: portrait field is missing its trailing comma")?;
        let insertion = portrait.end + comma_offset + 1;
        let replacement = render_dream_avatar_source_field(avatar, source_field)?;
        return Ok(format!(
            "{}\n    starting_essence: {},{}",
            &source[..insertion],
            replacement,
            &source[insertion..]
        ));
    }
    bail!(
        "MALFORMED_SOURCE: missing field {source_field} on DreamAvatar {}",
        avatar.id
    )
}

fn render_dream_avatar_source_field(avatar: &AvatarDefinition, field: &str) -> Result<String> {
    match field {
        "name" => Ok(ron::to_string(&avatar.name)?),
        "title" => Ok(ron::to_string(&avatar.title)?),
        "ability_text" => Ok(ron::to_string(&avatar.ability_text)?),
        "portrait.image" => Ok(avatar.portrait.image.to_string()),
        "starting_essence" => Ok(avatar
            .starting_essence
            .context("starting_essence must be present when rendering")?
            .to_string()),
        _ => bail!("INVALID_EDIT: unsupported DreamAvatar source field {field}"),
    }
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
    let dreamsigns_dataset = manifest.dataset("dreamsigns")?;
    let dreamsigns_text = fs::read_to_string(staging_root.join(&dreamsigns_dataset.source))?;
    let dreamsigns: Vec<DreamsignDefinition> = ron::from_str(&dreamsigns_text)
        .context("MALFORMED_SOURCE: staged Dreamsign RON is invalid")?;
    dreamsigns::validate_definitions(&dreamsigns)
        .context("MALFORMED_SOURCE: staged Dreamsign catalog is invalid")?;
    let dreamsign_ids = dreamsigns
        .into_iter()
        .map(|dreamsign| dreamsign.id)
        .collect::<BTreeSet<_>>();
    validate_exploration_dreamsign_references(&original, &dreamsign_ids)
        .context("MALFORMED_SOURCE: staged Exploration references are invalid")?;
    let mut catalog = original.clone();
    let mut source_text = original_text.clone();
    for operation in operations {
        match operation {
            EditOperation::SetEncounterProse { card_id, prose } => {
                if prose.trim().is_empty() {
                    bail!("INVALID_EDIT: encounter prose must not be blank");
                }
                unique_encounter_mut(&mut catalog, &card_id)?.prose = prose.clone();
                source_text = patch_exploration_prose(&source_text, &card_id, &prose)?;
            }
            EditOperation::ReplaceAction {
                card_id,
                slot,
                expected_action_id,
                action,
            } => {
                let replacement =
                    replace_action(&mut catalog, card_id, slot, expected_action_id, action)?;
                source_text = patch_exploration_action(&source_text, &replacement)?;
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to Exploration"),
        }
    }
    reject_duplicate_exploration_ids(&catalog)?;
    validate_exploration_dreamsign_references(&catalog, &dreamsign_ids)
        .context("INVALID_EDIT: Exploration edit has invalid references")?;
    let changed = catalog != original;
    if changed {
        verify_round_trip::<ExplorationCatalog>(&source_text, &catalog)?;
        atomic_write(&source_path, source_text.as_bytes())?;
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
) -> Result<ActionDefinition> {
    let replacement = action_from_compat(action)?;
    if replacement.id.to_string() != expected_action_id {
        bail!("FIELD_NOT_APPLICABLE: Exploration action IDs cannot be changed");
    }
    let encounter = unique_encounter_mut(catalog, &card_id)?;
    let current = encounter
        .actions
        .get(slot)
        .context("RECORD_NOT_FOUND: Exploration action slot is missing")?;
    if current.id.to_string() != expected_action_id {
        bail!("RECORD_NOT_FOUND: expected action id does not match the selected slot");
    }
    encounter.actions[slot] = replacement.clone();
    Ok(replacement)
}

fn patch_exploration_prose(source: &str, card_id: &str, prose: &str) -> Result<String> {
    let record =
        typed_record_range_at_indent(source, "EncounterDefinition", "card_id", card_id, 2)?;
    let value = top_level_field_value_range(source, record, "prose")?
        .context("MALFORMED_SOURCE: Exploration encounter has no prose field")?;
    Ok(format!(
        "{}{}{}",
        &source[..value.start],
        ron::to_string(prose)?,
        &source[value.end..],
    ))
}

fn patch_exploration_action(source: &str, action: &ActionDefinition) -> Result<String> {
    let action_id = action.id.to_string();
    let record = typed_record_range_at_indent(source, "ActionDefinition", "id", &action_id, 6)?;
    let existing_source = format!("#![enable(implicit_some)]\n{}", &source[record.clone()]);
    let existing: ActionDefinition = ron::from_str(&existing_source)
        .context("MALFORMED_SOURCE: Exploration action record is invalid")?;
    let mut patched = source.to_owned();

    if existing.label != action.label {
        patched = patch_exploration_action_field(
            &patched,
            &action_id,
            "label",
            &ron::to_string(&action.label)?,
        )?;
    }
    if existing.presentation.effect_text != action.presentation.effect_text
        && existing.presentation.followup == action.presentation.followup
    {
        let action_record =
            typed_record_range_at_indent(&patched, "ActionDefinition", "id", &action_id, 6)?;
        let presentation = top_level_field_value_range(&patched, action_record, "presentation")?
            .context("MALFORMED_SOURCE: Exploration action has no presentation field")?;
        let effect_text = top_level_field_value_range(&patched, presentation, "effect_text")?
            .context("MALFORMED_SOURCE: Exploration presentation has no effect_text field")?;
        patched = format!(
            "{}{}{}",
            &patched[..effect_text.start],
            ron::to_string(&action.presentation.effect_text)?,
            &patched[effect_text.end..],
        );
    } else if existing.presentation != action.presentation {
        patched = patch_exploration_action_field(
            &patched,
            &action_id,
            "presentation",
            &render_ron_value(&action.presentation, true)?,
        )?;
    }
    if existing.effect != action.effect {
        patched = patch_exploration_action_field(
            &patched,
            &action_id,
            "effect",
            &render_ron_value(&action.effect, true)?,
        )?;
    }
    Ok(patched)
}

fn patch_exploration_action_field(
    source: &str,
    action_id: &str,
    field: &str,
    replacement: &str,
) -> Result<String> {
    let record = typed_record_range_at_indent(source, "ActionDefinition", "id", action_id, 6)?;
    let value = top_level_field_value_range(source, record, field)?
        .with_context(|| format!("MALFORMED_SOURCE: Exploration action has no {field} field"))?;
    Ok(format!(
        "{}{}{}",
        &source[..value.start],
        replacement,
        &source[value.end..],
    ))
}

fn unique_encounter_mut<'a>(
    catalog: &'a mut ExplorationCatalog,
    card_id: &str,
) -> Result<&'a mut crate::models::exploration::EncounterDefinition> {
    let matches = catalog
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
        .iter_mut()
        .find(|encounter| encounter.card_id.eq_ignore_ascii_case(card_id))
        .unwrap())
}

fn reject_duplicate_exploration_ids(catalog: &ExplorationCatalog) -> Result<()> {
    let mut encounters = BTreeSet::new();
    let mut actions = BTreeSet::new();
    for encounter in catalog {
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

fn validate_exploration_dreamsign_references(
    catalog: &ExplorationCatalog,
    known_dreamsign_ids: &BTreeSet<DreamsignId>,
) -> Result<()> {
    for encounter in catalog {
        for action in &encounter.actions {
            let dreamsign_id = match &action.effect {
                ActionEffect::GainDreamsign { dreamsign_id }
                | ActionEffect::GainNightmareAndDreamsign { dreamsign_id, .. } => dreamsign_id,
                _ => continue,
            };
            let parsed = parse_dreamsign_reference(dreamsign_id)?;
            if !known_dreamsign_ids.contains(&parsed) {
                bail!(
                    "RECORD_NOT_FOUND: Exploration action {} references unknown Dreamsign UUID {}",
                    action.id,
                    dreamsign_id
                );
            }
        }
    }
    Ok(())
}

fn parse_dreamsign_reference(value: &str) -> Result<DreamsignId> {
    let literal = ron::to_string(value)?;
    ron::from_str(&literal).with_context(|| {
        format!("INVALID_EDIT: Dreamsign reference {value} must be a canonical UUIDv4")
    })
}

fn action_from_compat(value: JsonValue) -> Result<ActionDefinition> {
    let object = value
        .as_object()
        .context("INVALID_EDIT: Exploration action must be an object")?;
    let kind_name = required_json_string(object, "effectKind")?;
    let kind = EffectKind::from_compat(&kind_name)
        .with_context(|| format!("INVALID_EDIT: unknown Exploration effect kind {kind_name}"))?;
    validate_action_fields(object, kind)?;
    if let Some(requested) = optional_json_string(object, "canonicalMechanicId")? {
        if requested != kind.mechanic().as_compat() {
            bail!("FIELD_NOT_APPLICABLE: canonicalMechanicId is derived from the typed effect");
        }
    }
    if let Some(requested) = optional_json_string(object, "selectionPolicyId")? {
        let default = kind
            .default_selection_policy()
            .map(|policy| policy.as_compat());
        if Some(requested.as_str()) != default {
            bail!("FIELD_NOT_APPLICABLE: selectionPolicyId is derived from the typed effect");
        }
    }
    let effect = match kind {
        EffectKind::GainOfferedCard => ActionEffect::GainGeneratedCard {
            predicate: json_predicate(object, "predicate")?,
            count: optional_positive_int(object, "count")?,
        },
        EffectKind::TransfigureSelected => ActionEffect::TransfigureSelected {
            predicate: optional_predicate(object, "predicate")?,
            count: positive_int(object, "count")?,
        },
        EffectKind::TransfigureRandomCards => ActionEffect::TransfigureRandomCards {
            predicate: json_predicate(object, "predicate")?,
            count: positive_int(object, "count")?,
        },
        EffectKind::TransfigureFixedRandomCards => ActionEffect::TransfigureFixedRandomCards {
            predicate: json_predicate(object, "predicate")?,
            count: positive_int(object, "count")?,
            transfiguration: required_json_string(object, "transfiguration")?,
        },
        EffectKind::PurgeSelected => ActionEffect::PurgeSelected {
            predicate: optional_predicate(object, "predicate")?,
            count: optional_positive_int(object, "count")?,
        },
        EffectKind::PurgeStarterCard => ActionEffect::PurgeStarterCard,
        EffectKind::PurgeRandomStarterCard => ActionEffect::PurgeRandomStarterCard,
        EffectKind::PurgeRandomStarterAndGainCard => ActionEffect::PurgeRandomStarterAndGainCard {
            predicate: json_predicate(object, "predicate")?,
        },
        EffectKind::ReplaceAllStarterCards => ActionEffect::ReplaceAllStarterCards {
            predicate: json_predicate(object, "predicate")?,
        },
        EffectKind::TransfigureRandomStarterCards => ActionEffect::TransfigureRandomStarterCards {
            count: positive_int(object, "count")?,
        },
        EffectKind::TransfigureAllStarterCards => ActionEffect::TransfigureAllStarterCards,
        EffectKind::TransfigureAllCards => ActionEffect::TransfigureAllCards,
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
            target: json_deck_target(object)?,
        },
        EffectKind::ChangeCardTypeSelected => ActionEffect::ChangeCardTypeSelected {
            card_type: json_card_type_target(object)?,
            target: json_deck_target(object)?,
        },
        EffectKind::ChangeRandomCardType => ActionEffect::ChangeRandomCardType {
            count: positive_int(object, "count")?,
            card_type: json_card_type_target(object)?,
        },
        EffectKind::ChangeSubtypeAll => ActionEffect::ChangeSubtypeAll {
            subtype_options: string_array(object, "subtypeOptions")?,
        },
        EffectKind::GainCard => ActionEffect::GainNamedCard {
            card_id: required_json_string(object, "cardId")?,
        },
        EffectKind::GainDreamsign => ActionEffect::GainDreamsign {
            dreamsign_id: required_dreamsign_reference(object, "dreamsignId")?,
        },
        EffectKind::GainNightmareAndDreamsign => ActionEffect::GainNightmareAndDreamsign {
            dreamsign_id: required_dreamsign_reference(object, "dreamsignId")?,
            nightmare_count: positive_int(object, "nightmareCount")?,
        },
        EffectKind::GainNightmareAndOfferedDreamsign => {
            ActionEffect::GainNightmareAndOfferedDreamsign {
                offer_count: positive_int(object, "offerCount")?,
                nightmare_count: positive_int(object, "nightmareCount")?,
            }
        }
        EffectKind::GainEssencePerCard => ActionEffect::GainEssencePerCard {
            predicate: json_predicate(object, "predicate")?,
            essence_per_card: positive_int(object, "essencePerCard")?,
        },
        EffectKind::GainEssence => ActionEffect::GainEssence {
            essence: positive_int(object, "essence")?,
        },
        EffectKind::GainRandomEssence => {
            let minimum_essence = positive_int(object, "minimumEssence")?;
            let maximum_essence = positive_int(object, "maximumEssence")?;
            if minimum_essence > maximum_essence {
                bail!("INVALID_EDIT: minimumEssence must not exceed maximumEssence");
            }
            ActionEffect::GainRandomEssence {
                minimum_essence,
                maximum_essence,
            }
        }
        EffectKind::DoubleEssence => ActionEffect::DoubleEssence,
        EffectKind::ChoosePack => ActionEffect::ChoosePack {
            predicate: json_predicate(object, "predicate")?,
            pack_count: positive_int(object, "packCount")?,
            pack_size: positive_int(object, "packSize")?,
        },
        EffectKind::IncreaseSparkAll => ActionEffect::IncreaseSparkAll {
            spark_bonus: positive_int(object, "sparkBonus")?,
        },
        EffectKind::PurgeRandomSubtypeAndIncreaseSpark => {
            ActionEffect::PurgeRandomSubtypeAndIncreaseSpark {
                subtype: required_json_string(object, "subtype")?,
                spark_bonus: positive_int(object, "sparkBonus")?,
            }
        }
        EffectKind::MakeFastAll => ActionEffect::MakeFastAll,
        EffectKind::MakePredicateFastAndGainNightmares => {
            ActionEffect::MakePredicateFastAndGainNightmares {
                predicate: json_predicate(object, "predicate")?,
                nightmare_count: positive_int(object, "nightmareCount")?,
            }
        }
        EffectKind::ReduceCostAllAndGainNightmares => {
            ActionEffect::ReduceCostAllAndGainNightmares {
                energy_cost_reduction: positive_int(object, "energyCostReduction")?,
                nightmare_count: positive_int(object, "nightmareCount")?,
            }
        }
        EffectKind::PurgeAndCopy => ActionEffect::PurgeAndCopy,
        EffectKind::PurgeOneTransfigureAndCopyOthers => {
            let offer_count = positive_int(object, "offerCount")?;
            if offer_count != 4 {
                bail!("INVALID_EDIT: offerCount must be exactly 4");
            }
            ActionEffect::PurgeOneTransfigureAndCopyOthers {
                offer_count,
                transfiguration: required_json_string(object, "transfiguration")?,
            }
        }
        EffectKind::TransfigureFixedSelected => ActionEffect::TransfigureFixedSelected {
            predicate: optional_predicate(object, "predicate")?,
            transfiguration: required_json_string(object, "transfiguration")?,
            target: json_deck_target(object)?,
            count: optional_positive_int(object, "count")?,
        },
        EffectKind::TransfigureAllForEssence => ActionEffect::TransfigureAllForEssence {
            essence: positive_int(object, "essence")?,
            predicate: json_predicate(object, "predicate")?,
            transfiguration: required_json_string(object, "transfiguration")?,
        },
        EffectKind::PurgeDisclosedAndTransfigureSameType => {
            ActionEffect::PurgeDisclosedAndTransfigureSameType {
                transfiguration: required_json_string(object, "transfiguration")?,
            }
        }
        EffectKind::GainRandomDreamsign => ActionEffect::GainRandomDreamsign,
        EffectKind::PurgeDreamsignForEssence => ActionEffect::PurgeDreamsignForEssence {
            essence: positive_int(object, "essence")?,
        },
        EffectKind::GainOfferedDreamsign => ActionEffect::GainOfferedDreamsign {
            offer_count: positive_int(object, "offerCount")?,
        },
        EffectKind::ReplaceSelectedDreamsignWithOffered => {
            ActionEffect::ReplaceSelectedDreamsignWithOffered {
                offer_count: positive_int(object, "offerCount")?,
            }
        }
        EffectKind::ReplaceAllDreamsignsRandom => ActionEffect::ReplaceAllDreamsignsRandom,
        EffectKind::PurgeSelectedDreamsignAndGainRandom => {
            ActionEffect::PurgeSelectedDreamsignAndGainRandom {
                count: positive_int(object, "count")?,
            }
        }
        EffectKind::CopySelectedCard => ActionEffect::CopySelectedCard {
            predicate: optional_predicate(object, "predicate")?,
            count: positive_int(object, "count")?,
            target: json_deck_target(object)?,
        },
        EffectKind::CopySelectedCards => ActionEffect::CopySelectedCards {
            count: positive_int(object, "count")?,
        },
        EffectKind::CopyRandomCards => ActionEffect::CopyRandomCards {
            predicate: json_predicate(object, "predicate")?,
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
        EffectKind::TakeTransfiguredCardsAndGainNightmares => {
            let offer_count = positive_int(object, "offerCount")?;
            if offer_count != 4 {
                bail!("INVALID_EDIT: offerCount must be exactly 4");
            }
            ActionEffect::TakeTransfiguredCardsAndGainNightmares {
                predicate: json_predicate(object, "predicate")?,
                offer_count,
                transfiguration: required_json_string(object, "transfiguration")?,
                nightmare_count: positive_int(object, "nightmareCount")?,
            }
        }
        EffectKind::ReplaceSelectedWithCard => ActionEffect::ReplaceSelectedWithCard {
            card_id: required_json_string(object, "cardId")?,
        },
        EffectKind::ReplaceRandomWithCard => ActionEffect::ReplaceRandomWithCard {
            predicate: json_predicate(object, "predicate")?,
            card_id: required_json_string(object, "cardId")?,
        },
        EffectKind::ReplaceSelected => ActionEffect::ReplaceSelected {
            predicate: json_predicate(object, "predicate")?,
            count: optional_positive_int(object, "count")?,
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
        EffectKind::AddFixedSite => ActionEffect::AddFixedSite {
            site_type: json_fixed_site_type(object)?,
        },
        EffectKind::ChooseSiteType => ActionEffect::ChooseSiteType {
            offer_count: positive_int(object, "offerCount")?,
        },
        EffectKind::AddSite => ActionEffect::AddSite,
        EffectKind::FreeNextShop => ActionEffect::FreeNextShop,
        EffectKind::LoseHalfEssenceAndFreePurchases => {
            ActionEffect::LoseHalfEssenceAndFreePurchases {
                count: positive_int(object, "count")?,
            }
        }
    };
    if matches!(
        &effect,
        ActionEffect::TransfigureSelected {
            predicate: None,
            count,
        } if *count > 1
    ) {
        bail!("INVALID_EDIT: transfigure-selected requires predicate when count exceeds one");
    }
    if matches!(
        &effect,
        ActionEffect::TransfigureFixedSelected {
            predicate,
            target,
            count: Some(count),
            ..
        } if *count > 1 && (predicate.is_none() || *target != DeckTarget::Chosen)
    ) {
        bail!(
            "INVALID_EDIT: transfigure-fixed-selected with count greater than one requires a chosen target and predicate"
        );
    }
    let followup_title = optional_json_string(object, "followupTitle")?;
    let followup_subtitle = optional_json_string(object, "followupSubtitle")?;
    if followup_title.is_some() != followup_subtitle.is_some() {
        bail!("INVALID_EDIT: followupTitle and followupSubtitle must be provided together");
    }
    Ok(ActionDefinition {
        label: required_json_string(object, "label")?,
        id: ActionId::parse(&required_json_string(object, "id")?)
            .map_err(|error| anyhow::anyhow!("INVALID_EDIT: {error}"))?,
        presentation: ActionPresentation {
            effect_text: required_json_string(object, "effectText")?,
            followup: followup_title
                .zip(followup_subtitle)
                .map(|(title, subtitle)| Followup { title, subtitle }),
        },
        effect,
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
        "followupTitle",
        "followupSubtitle",
        "renderedEffectText",
        "renderedEffectParts",
        "runtimeCardSelections",
        "effectKind",
        "canonicalMechanicId",
        "selectionPolicyId",
    ]);
    let variant: &[&str] = match kind {
        EffectKind::GainOfferedCard => &["predicate", "count"],
        EffectKind::TransfigureSelected => &["predicate", "count"],
        EffectKind::TransfigureRandomCards => &["predicate", "count"],
        EffectKind::TransfigureFixedRandomCards => &["predicate", "count", "transfiguration"],
        EffectKind::PurgeSelected => &["predicate", "count"],
        EffectKind::TransfigureRandomStarterCards => &["count"],
        EffectKind::PurgeRandomStarterAndGainCard | EffectKind::ReplaceAllStarterCards => {
            &["predicate"]
        }
        EffectKind::GainRandomCards => &["predicate", "count"],
        EffectKind::DraftCard => &["predicate", "count", "offerCount"],
        EffectKind::ChangeSubtypeSelected => &["predicate", "subtype", "deckTarget"],
        EffectKind::ChangeCardTypeSelected => &["cardType", "deckTarget"],
        EffectKind::ChangeRandomCardType => &["count", "cardType"],
        EffectKind::ChangeSubtypeAll => &["subtypeOptions"],
        EffectKind::GainCard => &["cardId"],
        EffectKind::GainDreamsign => &["dreamsignId"],
        EffectKind::GainNightmareAndDreamsign => &["dreamsignId", "nightmareCount"],
        EffectKind::GainNightmareAndOfferedDreamsign => &["offerCount", "nightmareCount"],
        EffectKind::GainEssencePerCard => &["predicate", "essencePerCard"],
        EffectKind::GainEssence => &["essence"],
        EffectKind::GainRandomEssence => &["minimumEssence", "maximumEssence"],
        EffectKind::ChoosePack => &["predicate", "packCount", "packSize"],
        EffectKind::IncreaseSparkAll => &["sparkBonus"],
        EffectKind::PurgeRandomSubtypeAndIncreaseSpark => &["subtype", "sparkBonus"],
        EffectKind::ReduceCostAllAndGainNightmares => &["energyCostReduction", "nightmareCount"],
        EffectKind::TransfigureFixedSelected => {
            &["predicate", "count", "transfiguration", "deckTarget"]
        }
        EffectKind::TransfigureAllForEssence => &["essence", "predicate", "transfiguration"],
        EffectKind::PurgeDisclosedAndTransfigureSameType => &["transfiguration"],
        EffectKind::PurgeDreamsignForEssence => &["essence"],
        EffectKind::GainOfferedDreamsign | EffectKind::ReplaceSelectedDreamsignWithOffered => {
            &["offerCount"]
        }
        EffectKind::PurgeSelectedDreamsignAndGainRandom => &["count"],
        EffectKind::CopySelectedCard => &["predicate", "count", "deckTarget"],
        EffectKind::CopySelectedCards => &["count"],
        EffectKind::CopyRandomCards => &["predicate", "count"],
        EffectKind::CopyOfferedDeckCard => &["offerCount"],
        EffectKind::NextBattleOpeningHand => &["count"],
        EffectKind::NextBattleStartingEnergy => &["count"],
        EffectKind::ChooseDreamAvatar => &["offerCount"],
        EffectKind::TakeCards => &["predicate", "offerCount"],
        EffectKind::TakeTransfiguredCardsAndGainNightmares => &[
            "predicate",
            "offerCount",
            "transfiguration",
            "nightmareCount",
        ],
        EffectKind::ReplaceSelectedWithCard => &["cardId"],
        EffectKind::ReplaceRandomWithCard => &["predicate", "cardId"],
        EffectKind::ReplaceSelected => &["predicate", "count"],
        EffectKind::GainNightmareAndCard => &["cardId", "nightmareCount"],
        EffectKind::TransfiguredCardDraft => &["predicate", "offerCount"],
        EffectKind::PurgeForEssence => &["essencePerSpark"],
        EffectKind::AddFixedSite => &["siteType"],
        EffectKind::ChooseSiteType => &["offerCount"],
        EffectKind::LoseHalfEssenceAndFreePurchases => &["count"],
        EffectKind::MakePredicateFastAndGainNightmares => &["predicate", "nightmareCount"],
        EffectKind::PurgeOneTransfigureAndCopyOthers => &["offerCount", "transfiguration"],
        EffectKind::MakeFastAll
        | EffectKind::DoubleEssence
        | EffectKind::PurgeAndCopy
        | EffectKind::PurgeStarterCard
        | EffectKind::PurgeRandomStarterCard
        | EffectKind::TransfigureAllStarterCards
        | EffectKind::TransfigureAllCards
        | EffectKind::GainRandomDreamsign
        | EffectKind::ReplaceAllDreamsignsRandom
        | EffectKind::NextBattleSmallerHandAndCostDiscount
        | EffectKind::PurgeDuplicatesAndGrantReclaim
        | EffectKind::TransfigureNextDraftOrShop
        | EffectKind::AddSite
        | EffectKind::FreeNextShop => &[],
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

fn required_dreamsign_reference(
    object: &serde_json::Map<String, JsonValue>,
    key: &str,
) -> Result<String> {
    let value = required_json_string(object, key)?;
    parse_dreamsign_reference(&value)?;
    Ok(value)
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

fn json_deck_target(object: &serde_json::Map<String, JsonValue>) -> Result<DeckTarget> {
    let value = required_json_string(object, "deckTarget")?;
    DeckTarget::from_compat(&value)
        .with_context(|| format!("INVALID_EDIT: unknown deck target {value}"))
}

fn json_card_type_target(object: &serde_json::Map<String, JsonValue>) -> Result<CardTypeTarget> {
    let value = required_json_string(object, "cardType")?;
    CardTypeTarget::from_compat(&value)
        .with_context(|| format!("INVALID_EDIT: unknown card type {value}"))
}

fn json_fixed_site_type(object: &serde_json::Map<String, JsonValue>) -> Result<FixedSiteType> {
    let value = required_json_string(object, "siteType")?;
    FixedSiteType::from_compat(&value)
        .with_context(|| format!("INVALID_EDIT: unknown fixed site type {value}"))
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

fn unique_card_index(cards: &[CardDefinition], id: &str) -> Result<usize> {
    let matches = cards
        .iter()
        .enumerate()
        .filter(|(_, card)| card.id.eq_ignore_ascii_case(id))
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    if matches.is_empty() {
        bail!("RECORD_NOT_FOUND: card UUID {id}");
    }
    if matches.len() > 1 {
        bail!("MALFORMED_SOURCE: duplicate card UUID {id}");
    }
    Ok(matches[0])
}

fn patch_card_source_field(source: &str, card: &CardDefinition, field: &str) -> Result<String> {
    let source_field = match field {
        "name" => "name",
        "ability_text" | "rules" | "rendered-text" => "ability_text",
        "amplified_text" | "amplified-text" => "amplified_text",
        "energy_cost" | "energy-cost" => "energy_cost",
        "card_type" | "card-type" | "subtype" | "spark" => "kind",
        "image_number" | "image-number" | "art_crop" | "art" => "art",
        _ => bail!("INVALID_EDIT: unsupported Cards field {field}"),
    };
    let record = card_record_range(source, &card.id)?;
    if let Some(value) = top_level_field_value_range(source, record.clone(), source_field)? {
        if source_field == "amplified_text" && card.amplified_text.is_none() {
            let line_start = source[..value.start]
                .rfind('\n')
                .context("MALFORMED_SOURCE: amplified_text must occupy its own line")?
                + 1;
            let line_end = value.end
                + source[value.end..]
                    .find('\n')
                    .context("MALFORMED_SOURCE: amplified_text line is unterminated")?
                + 1;
            return Ok(format!("{}{}", &source[..line_start], &source[line_end..]));
        }
        let replacement = render_card_source_field(card, source_field)?;
        return Ok(format!(
            "{}{}{}",
            &source[..value.start],
            replacement,
            &source[value.end..]
        ));
    }
    if source_field == "amplified_text" {
        let Some(_) = card.amplified_text else {
            return Ok(source.to_owned());
        };
        let replacement = render_card_source_field(card, source_field)?;
        let ability = top_level_field_value_range(source, record.clone(), "ability_text")?
            .with_context(|| format!("missing ability_text on card {}", card.id))?;
        let comma_offset = source[ability.end..record.end]
            .find(',')
            .context("MALFORMED_SOURCE: ability_text field is missing its trailing comma")?;
        let insertion = ability.end + comma_offset + 1;
        return Ok(format!(
            "{}\n    amplified_text: {},{}",
            &source[..insertion],
            replacement,
            &source[insertion..]
        ));
    }
    bail!(
        "MALFORMED_SOURCE: missing field {source_field} on card {}",
        card.id
    )
}

fn render_card_source_field(card: &CardDefinition, field: &str) -> Result<String> {
    match field {
        "name" => Ok(ron::to_string(&card.name)?),
        "ability_text" => {
            let clauses = card
                .ability_text
                .iter()
                .map(ron::to_string)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", clauses.join(", ")))
        }
        "amplified_text" => {
            let clauses = card
                .amplified_text
                .as_ref()
                .context("amplified_text must be present when rendering")?
                .iter()
                .map(ron::to_string)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", clauses.join(", ")))
        }
        "energy_cost" => Ok(render_orb(&card.energy_cost)),
        "kind" => match &card.kind {
            CardKind::Event => Ok("Event".into()),
            CardKind::Character { subtype, spark } => {
                let subtype = ron::to_string(subtype)?;
                Ok(match spark {
                    Some(spark) => format!(
                        "Character(subtype: {subtype}, spark: {})",
                        render_orb(spark)
                    ),
                    None => format!("Character(subtype: {subtype})"),
                })
            }
        },
        "art" => {
            let mut fields = vec![format!("image: {}", card.art.image)];
            if card.art.owned {
                fields.push("owned: true".into());
            }
            if let Some(crop) = &card.art.crop {
                fields.push(format!(
                    "crop: (x: {}, y: {}, scale: {})",
                    ron::to_string(&crop.x)?,
                    ron::to_string(&crop.y)?,
                    ron::to_string(&crop.scale)?
                ));
            }
            Ok(format!("({})", fields.join(", ")))
        }
        _ => bail!("INVALID_EDIT: unsupported Cards source field {field}"),
    }
}

fn render_orb(value: &OrbValue) -> String {
    match value {
        OrbValue::Fixed(value) => format!("Fixed({value})"),
        OrbValue::Variable => "Variable".into(),
        OrbValue::FixedAndVariable(value) => format!("FixedAndVariable({value})"),
    }
}

fn card_record_range(source: &str, id: &str) -> Result<Range<usize>> {
    typed_record_range(source, "CardDefinition", "id", id)
}

fn typed_record_range(
    source: &str,
    record_type: &str,
    identity_field: &str,
    identity: &str,
) -> Result<Range<usize>> {
    typed_record_range_at_indent(source, record_type, identity_field, identity, 2)
}

fn typed_record_range_at_indent(
    source: &str,
    record_type: &str,
    identity_field: &str,
    identity: &str,
    record_indent: usize,
) -> Result<Range<usize>> {
    let identity_literal = ron::to_string(identity)?;
    let marker = format!(
        "\n{}{identity_field}: {identity_literal},",
        " ".repeat(record_indent + 2)
    );
    let matches = source
        .match_indices(&marker)
        .map(|(offset, _)| offset)
        .collect::<Vec<_>>();
    if matches.is_empty() {
        bail!("RECORD_NOT_FOUND: {record_type} identity {identity}");
    }
    if matches.len() > 1 {
        bail!("MALFORMED_SOURCE: duplicate {record_type} identity {identity}");
    }
    let record_marker = format!("\n{}{record_type}(", " ".repeat(record_indent));
    let start = source[..matches[0]]
        .rfind(&record_marker)
        .map(|offset| offset + 1)
        .with_context(|| format!("MALFORMED_SOURCE: record has no {record_type} boundary"))?;
    let opening = source[start..]
        .find('(')
        .map(|offset| start + offset)
        .context("MALFORMED_SOURCE: record has no opening delimiter")?;
    let closing = matching_delimiter(source, opening)?;
    Ok(start..closing + 1)
}

fn top_level_field_value_range(
    source: &str,
    record: Range<usize>,
    field: &str,
) -> Result<Option<Range<usize>>> {
    let bytes = source.as_bytes();
    let opening = source[record.clone()]
        .find(['(', '[', '{'])
        .map(|offset| record.start + offset)
        .context("MALFORMED_SOURCE: RON record has no opening delimiter")?;
    let mut stack = vec![bytes[opening]];
    let mut cursor = opening + 1;
    let mut found = None;
    while cursor < record.end {
        if let Some(next) = skip_ron_literal_or_comment(bytes, cursor)? {
            cursor = next;
            continue;
        }
        if stack.len() == 1 && (bytes[cursor].is_ascii_alphabetic() || bytes[cursor] == b'_') {
            let name_start = cursor;
            cursor += 1;
            while cursor < record.end
                && (bytes[cursor].is_ascii_alphanumeric() || bytes[cursor] == b'_')
            {
                cursor += 1;
            }
            let mut colon = cursor;
            while colon < record.end && bytes[colon].is_ascii_whitespace() {
                colon += 1;
            }
            if bytes.get(colon) == Some(&b':') && &source[name_start..cursor] == field {
                let mut value_start = colon + 1;
                while value_start < record.end && bytes[value_start].is_ascii_whitespace() {
                    value_start += 1;
                }
                let value_end = top_level_value_end(source, value_start, record.end)?;
                if found.replace(value_start..value_end).is_some() {
                    bail!("MALFORMED_SOURCE: duplicate field {field} in RON record");
                }
            }
            continue;
        }
        match bytes[cursor] {
            b'(' | b'[' | b'{' => stack.push(bytes[cursor]),
            b')' | b']' | b'}' => {
                let expected = matching_open(bytes[cursor]);
                if stack.pop() != Some(expected) {
                    bail!("MALFORMED_SOURCE: mismatched delimiter in RON record");
                }
            }
            _ => {}
        }
        cursor += 1;
    }
    Ok(found)
}

fn top_level_value_end(source: &str, start: usize, limit: usize) -> Result<usize> {
    let bytes = source.as_bytes();
    let mut stack = Vec::new();
    let mut cursor = start;
    while cursor < limit {
        if let Some(next) = skip_ron_literal_or_comment(bytes, cursor)? {
            cursor = next;
            continue;
        }
        match bytes[cursor] {
            b'(' | b'[' | b'{' => stack.push(bytes[cursor]),
            b')' | b']' | b'}' => {
                let expected = matching_open(bytes[cursor]);
                if stack.pop() != Some(expected) {
                    bail!("MALFORMED_SOURCE: mismatched delimiter in RON field");
                }
            }
            b',' if stack.is_empty() => {
                let mut end = cursor;
                while end > start && bytes[end - 1].is_ascii_whitespace() {
                    end -= 1;
                }
                return Ok(end);
            }
            _ => {}
        }
        cursor += 1;
    }
    bail!("MALFORMED_SOURCE: RON field has no terminating comma")
}

fn matching_delimiter(source: &str, opening: usize) -> Result<usize> {
    let bytes = source.as_bytes();
    let mut stack = vec![bytes[opening]];
    let mut cursor = opening + 1;
    while cursor < bytes.len() {
        if let Some(next) = skip_ron_literal_or_comment(bytes, cursor)? {
            cursor = next;
            continue;
        }
        match bytes[cursor] {
            b'(' | b'[' | b'{' => stack.push(bytes[cursor]),
            b')' | b']' | b'}' => {
                let expected = matching_open(bytes[cursor]);
                if stack.pop() != Some(expected) {
                    bail!("MALFORMED_SOURCE: mismatched delimiter in RON source");
                }
                if stack.is_empty() {
                    return Ok(cursor);
                }
            }
            _ => {}
        }
        cursor += 1;
    }
    bail!("MALFORMED_SOURCE: unterminated typed RON record")
}

fn matching_open(closing: u8) -> u8 {
    match closing {
        b')' => b'(',
        b']' => b'[',
        b'}' => b'{',
        _ => unreachable!("only closing delimiters are matched"),
    }
}

fn skip_ron_literal_or_comment(bytes: &[u8], start: usize) -> Result<Option<usize>> {
    if bytes.get(start..start + 2) == Some(b"//") {
        let end = bytes[start + 2..]
            .iter()
            .position(|byte| *byte == b'\n')
            .map_or(bytes.len(), |offset| start + 2 + offset + 1);
        return Ok(Some(end));
    }
    if bytes.get(start..start + 2) == Some(b"/*") {
        let mut depth = 1;
        let mut cursor = start + 2;
        while cursor < bytes.len() && depth > 0 {
            if bytes.get(cursor..cursor + 2) == Some(b"/*") {
                depth += 1;
                cursor += 2;
            } else if bytes.get(cursor..cursor + 2) == Some(b"*/") {
                depth -= 1;
                cursor += 2;
            } else {
                cursor += 1;
            }
        }
        if depth != 0 {
            bail!("MALFORMED_SOURCE: unterminated block comment in Cards RON");
        }
        return Ok(Some(cursor));
    }

    let (quote, raw_prefix) = if matches!(bytes.get(start), Some(b'\"' | b'\'')) {
        (Some(start), None)
    } else if bytes.get(start) == Some(&b'b') && matches!(bytes.get(start + 1), Some(b'\"' | b'\''))
    {
        (Some(start + 1), None)
    } else if bytes.get(start) == Some(&b'r') {
        (None, Some(start + 1))
    } else if bytes.get(start..start + 2) == Some(b"br") {
        (None, Some(start + 2))
    } else {
        (None, None)
    };
    if let Some(quote) = quote {
        let delimiter = bytes[quote];
        let mut cursor = quote + 1;
        while cursor < bytes.len() {
            if bytes[cursor] == b'\\' {
                cursor += 2;
            } else if bytes[cursor] == delimiter {
                return Ok(Some(cursor + 1));
            } else {
                cursor += 1;
            }
        }
        bail!("MALFORMED_SOURCE: unterminated quoted literal in Cards RON");
    }
    if let Some(mut cursor) = raw_prefix {
        let hash_start = cursor;
        while bytes.get(cursor) == Some(&b'#') {
            cursor += 1;
        }
        if bytes.get(cursor) != Some(&b'\"') {
            return Ok(None);
        }
        let hash_count = cursor - hash_start;
        cursor += 1;
        while cursor < bytes.len() {
            if bytes[cursor] == b'\"'
                && bytes.get(cursor + 1..cursor + 1 + hash_count)
                    == Some(&bytes[hash_start..hash_start + hash_count])
            {
                return Ok(Some(cursor + 1 + hash_count));
            }
            cursor += 1;
        }
        bail!("MALFORMED_SOURCE: unterminated raw string in Cards RON");
    }
    Ok(None)
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
        "ability_text" | "rules" | "rendered-text" => {
            let rendered_text = json_string(value, field)?;
            card.ability_text = if rendered_text.is_empty() {
                Vec::new()
            } else {
                rendered_text.split("\n\n").map(str::to_owned).collect()
            };
        }
        "amplified_text" | "amplified-text" => {
            let rendered_text = json_string(value, field)?;
            card.amplified_text = if rendered_text.is_empty() {
                None
            } else {
                Some(rendered_text.split("\n\n").map(str::to_owned).collect())
            };
        }
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
        "tags" => bail!("FIELD_NOT_APPLICABLE: tags are stored in internal card metadata"),
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

fn facet_entries(document: &CardMetadataCatalog, facet: Facet) -> &[FacetDefinition] {
    match facet {
        Facet::Tags => &document.tag_facets,
        Facet::Tides => &document.tide_facets,
    }
}

fn facet_entries_mut(
    document: &mut CardMetadataCatalog,
    facet: Facet,
) -> &mut Vec<FacetDefinition> {
    match facet {
        Facet::Tags => &mut document.tag_facets,
        Facet::Tides => &mut document.tide_facets,
    }
}

fn facet_source_field(facet: Facet) -> &'static str {
    match facet {
        Facet::Tags => "tag_facets",
        Facet::Tides => "tide_facets",
    }
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
    document: &mut CardMetadataCatalog,
    facet: Facet,
    name: String,
    color: String,
) -> Result<bool> {
    let entries = facet_entries_mut(document, facet);
    let mut found = false;
    for entry in entries.iter_mut() {
        if entry.name == name {
            if found {
                bail!("MALFORMED_SOURCE: duplicate facet {name}");
            }
            entry.color.clone_from(&color);
            found = true;
        }
    }
    if !found {
        entries.push(FacetDefinition { name, color });
    }
    Ok(found)
}

fn delete_facet(document: &mut CardMetadataCatalog, facet: Facet, name: &str) -> Result<()> {
    let entries = facet_entries_mut(document, facet);
    let before = entries.len();
    entries.retain(|entry| entry.name != name);
    if entries.len() == before {
        bail!("RECORD_NOT_FOUND: facet {name}");
    }
    Ok(())
}

fn unique_card_metadata_index(document: &CardMetadataCatalog, card_id: &str) -> Result<usize> {
    let requested = crate::models::cards::CardId::parse(card_id).map_err(|error| {
        anyhow::anyhow!("INVALID_EDIT: card metadata identity {card_id}: {error}")
    })?;
    let matches = document
        .cards
        .iter()
        .enumerate()
        .filter(|(_, entry)| entry.id == requested)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [] => bail!("RECORD_NOT_FOUND: internal metadata for card UUID {card_id}"),
        [index] => Ok(*index),
        _ => bail!("MALFORMED_SOURCE: duplicate internal metadata for card UUID {card_id}"),
    }
}

fn set_card_metadata_tags(definition: &mut CardMetadataDefinition, value: JsonValue) -> Result<()> {
    let values = value
        .as_array()
        .context("INVALID_EDIT: tags must be an array")?;
    let tags = values
        .iter()
        .map(|entry| {
            entry
                .as_str()
                .map(str::to_owned)
                .context("INVALID_EDIT: every tag must be a string")
        })
        .collect::<Result<Vec<_>>>()?;
    definition.tags = tags;
    Ok(())
}

fn remove_tag_from_card_metadata(
    document: &mut CardMetadataCatalog,
    name: &str,
) -> Result<Vec<crate::models::cards::CardId>> {
    let mut changed = Vec::new();
    for entry in &mut document.cards {
        let before = entry.tags.len();
        entry.tags.retain(|tag| tag != name);
        if entry.tags.len() != before {
            changed.push(entry.id);
        }
    }
    Ok(changed)
}

fn card_metadata_record_range(source: &str, card_id: &str) -> Result<Range<usize>> {
    typed_record_range_at_indent(source, "CardMetadataDefinition", "id", card_id, 4)
}

fn patch_card_metadata_tags(source: &str, definition: &CardMetadataDefinition) -> Result<String> {
    let record = card_metadata_record_range(source, &definition.id.to_string())?;
    if let Some(value) = top_level_field_value_range(source, record.clone(), "tags")? {
        if definition.tags.is_empty() {
            let line_start = source[..value.start]
                .rfind('\n')
                .context("MALFORMED_SOURCE: card metadata tags must occupy their own line")?
                + 1;
            let line_end = value.end
                + source[value.end..]
                    .find('\n')
                    .context("MALFORMED_SOURCE: card metadata tags line is unterminated")?
                + 1;
            return Ok(format!("{}{}", &source[..line_start], &source[line_end..]));
        }
        return replace_source_ranges(source, vec![(value, ron::to_string(&definition.tags)?)]);
    }
    if definition.tags.is_empty() {
        return Ok(source.to_owned());
    }
    let origin = top_level_field_value_range(source, record.clone(), "mtg_origin")?
        .context("MALFORMED_SOURCE: card metadata record is missing mtg_origin")?;
    let comma_offset = source[origin.end..record.end]
        .find(',')
        .context("MALFORMED_SOURCE: mtg_origin is missing its trailing comma")?;
    let insertion = origin.end + comma_offset + 1;
    Ok(format!(
        "{}\n      tags: {},{}",
        &source[..insertion],
        ron::to_string(&definition.tags)?,
        &source[insertion..]
    ))
}

fn card_metadata_catalog_range(source: &str) -> Result<Range<usize>> {
    let marker = "CardMetadataCatalog(";
    let matches = source
        .match_indices(marker)
        .map(|(offset, _)| offset)
        .collect::<Vec<_>>();
    if matches.len() != 1 {
        bail!("MALFORMED_SOURCE: internal card metadata must contain one catalog");
    }
    let opening = matches[0] + marker.len() - 1;
    Ok(matches[0]..matching_delimiter(source, opening)? + 1)
}

fn facet_record_range(source: &str, facet: Facet, name: &str) -> Result<Range<usize>> {
    let catalog = card_metadata_catalog_range(source)?;
    let registry = top_level_field_value_range(source, catalog, facet_source_field(facet))?
        .with_context(|| {
            format!(
                "MALFORMED_SOURCE: internal card metadata is missing {}",
                facet_source_field(facet)
            )
        })?;
    let marker = "FacetDefinition(";
    let mut matches = Vec::new();
    for (relative_start, _) in source[registry.clone()].match_indices(marker) {
        let start = registry.start + relative_start;
        let opening = start + marker.len() - 1;
        let record = start..matching_delimiter(source, opening)? + 1;
        let Some(value) = top_level_field_value_range(source, record.clone(), "name")? else {
            continue;
        };
        if ron::from_str::<String>(&source[value])? == name {
            matches.push(record);
        }
    }
    match matches.as_slice() {
        [] => bail!("RECORD_NOT_FOUND: facet {name}"),
        [record] => Ok(record.clone()),
        _ => bail!("MALFORMED_SOURCE: duplicate facet {name}"),
    }
}

fn patch_card_metadata_facet(
    source: &str,
    facet: Facet,
    definition: &FacetDefinition,
    existed: bool,
) -> Result<String> {
    let rendered = format!(
        "FacetDefinition(name: {}, color: {})",
        ron::to_string(&definition.name)?,
        ron::to_string(&definition.color)?,
    );
    if existed {
        let record = facet_record_range(source, facet, &definition.name)?;
        return replace_source_ranges(source, vec![(record, rendered)]);
    }
    let catalog = card_metadata_catalog_range(source)?;
    let array = top_level_field_value_range(source, catalog, facet_source_field(facet))?
        .with_context(|| {
            format!(
                "MALFORMED_SOURCE: internal card metadata is missing {}",
                facet_source_field(facet)
            )
        })?;
    let closing = array.end - 1;
    if source.as_bytes().get(closing) != Some(&b']') {
        bail!("MALFORMED_SOURCE: facet registry must be an array");
    }
    let body_is_empty = source[array.start + 1..closing].trim().is_empty();
    let closing_line_start = source[..closing].rfind('\n').map_or(0, |offset| offset + 1);
    let closes_on_own_line = source[closing_line_start..closing].trim().is_empty();
    let (insertion, replacement) = if body_is_empty {
        (closing, format!("\n    {rendered},\n  "))
    } else if closes_on_own_line {
        (closing_line_start, format!("    {rendered},\n"))
    } else {
        (closing, format!(", {rendered}"))
    };
    replace_source_ranges(source, vec![(insertion..insertion, replacement)])
}

fn delete_card_metadata_facet(source: &str, facet: Facet, name: &str) -> Result<String> {
    let record = facet_record_range(source, facet, name)?;
    let line_start = source[..record.start]
        .rfind('\n')
        .map_or(0, |offset| offset + 1);
    let comma = source[record.end..]
        .find(',')
        .map(|offset| record.end + offset)
        .context("MALFORMED_SOURCE: facet record is missing its trailing comma")?;
    let line_end = source[comma..]
        .find('\n')
        .map(|offset| comma + offset + 1)
        .unwrap_or(source.len());
    replace_source_ranges(source, vec![(line_start..line_end, String::new())])
}

fn serialize_ron<T: serde::Serialize + ?Sized>(value: &T, implicit_some: bool) -> Result<String> {
    let mut extensions = Extensions::empty();
    if implicit_some {
        extensions |= Extensions::IMPLICIT_SOME;
    }
    let pretty = PrettyConfig::new()
        .depth_limit(128)
        .struct_names(true)
        .separate_tuple_members(true)
        .enumerate_arrays(false)
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

    const CARD_ID: &str = "a424b91a-8c3c-4f96-8ac9-8bbbbbbd28b5";
    const AVATAR_ID: &str = "00000000-0000-4000-8000-000000000011";
    const GLOSSARY_ID: &str = "00000000-0000-4000-8000-000000000021";
    const TIDE_ID: &str = "00000000-0000-4000-8000-000000000041";

    const TIDES_SOURCE: &str = r###"// Stable tides guidance.

#![enable(implicit_some)]

[
  // Edited tide comment.
  TideDefinition(
    id: "00000000-0000-4000-8000-000000000041",
    display_name: r#"Raw Tide"#,
    display_description: "First description",
    resonance: Shadow,
    kind: Signature,
    cards: {"00000000-0000-4000-8000-000000000051": 2},
  ),

  /* Unrelated tide comment. */
  TideDefinition(
    id: "00000000-0000-4000-8000-000000000042",
    display_name: "Facet Tide",
    display_description: "Second description",
    resonance: Wild,
    kind: Facet,
    cards: {"00000000-0000-4000-8000-000000000052": 1},
  ),

  TideDefinition(
    id: "00000000-0000-4000-8000-000000000043",
    display_name: "Neutral Tide",
    display_description: "Third description",
    resonance: Vision,
    kind: Neutral,
    cards: {"00000000-0000-4000-8000-000000000053": 1},
  ),
]
"###;

    const TIDE_POOLS_SOURCE: &str = r###"// Stable Dream Avatar tide-pool guidance.

#![enable(implicit_some)]

[
  DreamAvatarPool(
    dream_avatar_id: "00000000-0000-4000-8000-000000000061",
    starter: "00000000-0000-4000-8000-000000000041",
    facets: ["00000000-0000-4000-8000-000000000042"],
    neutral: ["00000000-0000-4000-8000-000000000043"],
  ),
]
"###;

    const EXPLORATION_SOURCE: &str = r###"// Stable Exploration guidance.
#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "00000000-0000-4000-8000-000000000031",
    prose: "First scene",
    actions: [
      // Edited action comment.
      ActionDefinition(
        label: "First",
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation: ActionPresentation(effect_text: "First effect", followup: None),
        effect: MakeFastAll,
      ),
      ActionDefinition(
        label: "Second",
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        presentation: ActionPresentation(effect_text: "Second effect", followup: None),
        effect: AddSite,
      ),
    ],
  ),
  /* Unrelated encounter comment. */
  EncounterDefinition(
    card_id: "00000000-0000-4000-8000-000000000032",
    prose: "Unrelated scene",
    actions: [
      ActionDefinition(
        label: "Third",
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        presentation: ActionPresentation(effect_text: "Third effect", followup: None),
        effect: MakeFastAll,
      ),
      ActionDefinition(
        label: "Fourth",
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        presentation: ActionPresentation(effect_text: "Fourth effect", followup: None),
        effect: AddSite,
      ),
    ],
  ),
]
"###;

    const CARD_SOURCE: &str = r##"// Stable catalog guidance.
#![enable(implicit_some)]
[
  CardDefinition(
    name: "Lone Arrival",
    id: "a424b91a-8c3c-4f96-8ac9-8bbbbbbd28b5",
    ability_text: ["Offering", "    tags: [\"inside rules\"],\n▸Materialized: Dissolve an enemy."],
    energy_cost: Fixed(5),
    kind: Character(subtype: "Visitor", spark: Fixed(3)),
    art: (image: 2033720048, crop: (x: 0.0, y: 0.595, scale: 1.17)),
  ),
  CardDefinition(
    name: "Unrelated Card",
    id: "00000000-0000-4000-8000-000000000002",
    ability_text: ["Draw a card."],
    energy_cost: Variable,
    kind: Event,
    art: (image: 2),
  ),
]
"##;

    const CARD_METADATA_SOURCE: &str = r###"// Stable metadata guidance.

#![enable(implicit_some)]
CardMetadataCatalog(
  cards: [
    // Edited record comment.
    CardMetadataDefinition(
      id: "a424b91a-8c3c-4f96-8ac9-8bbbbbbd28b5",
      number: 142,
      mtg_origin: r#"Solitude"#,
      tags: ["Art Rework"],
    ),

    /* Unrelated record comment. */
    CardMetadataDefinition(
      id: "00000000-0000-4000-8000-000000000002",
      number: 2,
      mtg_origin: "Fixture",
    ),
  ],
  tag_facets: [
    FacetDefinition(name: "Art Rework", color: "#b91c1c"),
    // Preserve the unrelated facet comment.
    FacetDefinition(name: "Art OK", color: "#15803d"),
  ],
  tide_facets: [FacetDefinition(name: "Spark", color: "#2563eb")],
)
"###;

    const DREAM_AVATAR_SOURCE: &str = r###"// Stable catalog guidance.

#![enable(implicit_some)]
[
  // Edited record comment.
  AvatarDefinition(
    name: r#"Raw Name"#,
    id: "00000000-0000-4000-8000-000000000011",
    ability_text: ["First paragraph", "Second paragraph"],
    title: "First Title",
    portrait: (image: 7, focus: (x: 0.25, y: 0.75)),
    signature_card_ids: ["00000000-0000-4000-8000-000000000101"],
  ),

  /* Unrelated record comment. */
  AvatarDefinition(
    name: "Unrelated Avatar",
    id: "00000000-0000-4000-8000-000000000012",
    ability_text: ["Unrelated ability."],
    title: "Unrelated Title",
    portrait: (image: 8, focus: (x: 0.5, y: 0.5)),
  ),
]
"###;

    const GLOSSARY_SOURCE: &str = r###"// Stable Glossary guidance.
#![enable(implicit_some)]
[
  // Edited record comment.
  GlossaryDefinition(
    id: "00000000-0000-4000-8000-000000000021",
    category: Keywords,
    term: r#"Echo"#,
    definition: "Create an echo.",
    priority: 17,
    matches_term_in_rules_text: true,
    variants: ["echoes"],
    rules_symbol: RulesSymbol(
      token: spark,
      glyph: Spark,
      accessible_label: "spark",
      semantic_color_role: Spark,
    ),
    projections: [
      GlossaryProjection(
        pattern: r#"\becho\s+(\d+)\b"#,
        term: "{term} {1}",
        definition: "Create {1} echoes.",
      ),
    ],
  ),
  /* Unrelated record comment. */
  GlossaryDefinition(
    id: "00000000-0000-4000-8000-000000000022",
    category: Actions,
    term: "Moon",
    definition: "Unrelated definition.",
    priority: -3,
    variants: [],
    term_presentation: SymbolOnly,
    rules_symbol: RulesSymbol(token: lunar, glyph: Exhaust, accessible_label: "lunar"),
  ),
  GlossaryDefinition(
    id: "00000000-0000-4000-8000-000000000023",
    category: Resources,
    term: "Essence",
    definition: "Currency.",
    priority: 0,
    rules_symbol: RulesSymbol(token: essence, glyph: Essence, accessible_label: "essence"),
  ),
  GlossaryDefinition(
    id: "00000000-0000-4000-8000-000000000024",
    category: Resources,
    term: "Points",
    definition: "Score.",
    priority: 0,
    rules_symbol: RulesSymbol(token: points, glyph: Points, accessible_label: "points"),
  ),
  GlossaryDefinition(
    id: "00000000-0000-4000-8000-000000000025",
    category: Resources,
    term: "Memory",
    definition: "Stored counters.",
    priority: 0,
    rules_symbol: RulesSymbol(token: store, glyph: Memory, accessible_label: "memory"),
  ),
  GlossaryDefinition(
    id: "00000000-0000-4000-8000-000000000026",
    category: Resources,
    term: "Energy",
    definition: "Play resource.",
    priority: 0,
    rules_symbol: RulesSymbol(token: energy, glyph: Energy, accessible_label: "energy"),
  ),
]
"###;

    const DREAM_GUIDE_EDITOR_SOURCE: &str = r###"// Stable Dream guide guidance.

#![enable(implicit_some)]
[
  // First guide comment.
  GuideDefinition(
    id: "00000000-0000-4000-8000-000000000001",
    name: r#"Raw Guide"#,
    home_dreamscape_id: "00000000-0000-4000-8000-000000000101",
    portrait_source: "one.png",
    site_dialogue: [r#"Raw dialogue"#],
    specialty: Shop(description: "Shop copy"),
  ),
  GuideDefinition(
    id: "00000000-0000-4000-8000-000000000002",
    name: "Nested Guide",
    home_dreamscape_id: "00000000-0000-4000-8000-000000000102",
    portrait_source: "two.png",
    site_dialogue: ["Nested dialogue"],
    specialty: RandomSite(
      description: "Random copy",
      dialogue: ["Random line"],
    ),
  ),
  /* Unrelated guide comment. */
  GuideDefinition(
    id: "00000000-0000-4000-8000-000000000003",
    name: "Unrelated Guide",
    home_dreamscape_id: "00000000-0000-4000-8000-000000000103",
    portrait_source: "three.png",
    site_dialogue: ["Unrelated dialogue"],
    specialty: Gamble(
      description: "Gamble copy",
      dialogue: GambleDialogue(
        three_gate: ["Three Gate"],
        ladder_climb: ["Win {win-essence}"],
        starway_stairs: ["Stairs"],
        four_suit_reprise: ["Reprise"],
        blackjack: ["Blackjack"],
      ),
    ),
  ),
]
"###;

    const DREAMSCAPE_EDITOR_SOURCE: &str = r###"// Stable catalog guidance.

#![enable(implicit_some)]
[
  DreamscapeDefinition(
    id: "0217b10e-bf48-4e27-95f0-846fd802b730",
    name: r#"Raw Starter"#,
    art: (
      scene: (key: "firstlight_meadow", source: "firstlight_meadow.png"),
      atlas_node: (key: "firstlight_meadow", source: "firstlight_meadow_icon.png"),
    ),
    kind: Starter(signature_site: Draft, fixed_sites: [Draft, Battle]),
  ),
  // Editable nested fields.
  DreamscapeDefinition(
    id: "08e11635-9f04-48fd-a9c8-5a9f68c80958",
    name: "Region",
    art: (
      scene: (key: "tumbleleaf_village", source: "tumbleleaf_village.png"),
      atlas_node: (key: "tumbleleaf_village", source: "tumbleleaf_village_icon.png"),
    ),
    kind: Standard(
      affiliation_id: "4b715cd0-8b41-4b82-9cef-c47b15e8992b",
      opponent_dream_avatar_ids: [
        "94e7c651-25e9-4a62-9de4-eaf5ba20542c",
        "3ebaba62-9000-429d-b203-2a5a9724389a",
        "2c53b1b9-9291-4bba-8d3a-f40b545c8f3c",
      ],
    ),
  ),
  /* Unrelated record comment. */
  DreamscapeDefinition(
    id: "f31e1199-70bc-4110-85f9-505afebb02c4",
    name: "Final Dream",
    art: (
      scene: (key: "limbo", source: "limbo.png"),
      atlas_node: (key: "limbo", source: "limbo_icon.png"),
    ),
    kind: Boss,
  ),
]
"###;

    const DREAMWELL_EDITOR_SOURCE: &str = r###"// Stable Dreamwell guidance.

#![enable(implicit_some)]
DreamwellCatalog(
  // Unrelated construction rules must survive card edits byte-for-byte.
  rules: DreamwellRules(
    opening_orders: [0],
    recurring_orders: [1, 2, 3, 4],
    cards_per_recurring_order: 5,
    minimum_constructed_length: 62,
  ),
  cards: [
    // Edited record comment.
    DreamwellCardDefinition(
      name: r#"Raw Horizon"#,
      id: "00000000-0000-4000-8000-000000000021",
      ability_text: ["First paragraph", "Second paragraph"],
      energy_added: 2,
      deck_tier: Starting,
      art: (
        image: 7,
        // Preserve nested art provenance guidance.
        owned: true,
      ),
    ),

    /* Unrelated record comment. */
    DreamwellCardDefinition(
      name: "Unrelated Dreamwell",
      id: "00000000-0000-4000-8000-000000000022",
      ability_text: ["Unrelated ability."],
      energy_added: 1,
      deck_tier: Two,
      art: (image: 8, crop: (x: 0.25, y: -0.5, scale: 1.5)),
    ),
  ],
)
"###;

    #[test]
    fn dreamwell_scalar_edit_is_operation_sized_and_preserves_source() {
        let mut catalog: DreamwellCatalog = ron::from_str(DREAMWELL_EDITOR_SOURCE).unwrap();
        set_dreamwell_field(&mut catalog.cards[0], "energy-added", json!(3)).unwrap();
        let patched = patch_dreamwell_source_field(
            DREAMWELL_EDITOR_SOURCE,
            &catalog.cards[0],
            "energy-added",
        )
        .unwrap();

        assert_eq!(
            DREAMWELL_EDITOR_SOURCE
                .lines()
                .zip(patched.lines())
                .filter(|(before, after)| before != after)
                .count(),
            1
        );
        assert!(patched.contains("/* Unrelated record comment. */"));
        assert!(patched.contains("minimum_constructed_length: 62"));
        assert_eq!(
            ron::from_str::<DreamwellCatalog>(&patched).unwrap(),
            catalog
        );
    }

    #[test]
    fn dreamwell_editor_maps_every_supported_field_to_typed_ron() {
        let cases = [
            ("name", json!("New Horizon")),
            ("rendered-text", json!("First\n\nSecond")),
            ("energy-added", json!(4)),
            ("order", json!(4)),
            ("image-number", json!(99)),
            ("art", json!({ "x": 0.5, "y": -0.25, "scale": 1.75 })),
        ];
        for (field, value) in cases {
            let mut catalog: DreamwellCatalog = ron::from_str(DREAMWELL_EDITOR_SOURCE).unwrap();
            set_dreamwell_field(&mut catalog.cards[0], field, value).unwrap();
            let patched =
                patch_dreamwell_source_field(DREAMWELL_EDITOR_SOURCE, &catalog.cards[0], field)
                    .unwrap();
            assert_eq!(
                ron::from_str::<DreamwellCatalog>(&patched).unwrap(),
                catalog,
                "field {field} failed typed round trip"
            );
            assert!(patched.contains("/* Unrelated record comment. */"));
            assert!(patched.contains("// Preserve nested art provenance guidance."));
        }
    }

    #[test]
    fn dreamwell_editor_rejects_invalid_identity_and_values() {
        let mut catalog: DreamwellCatalog = ron::from_str(DREAMWELL_EDITOR_SOURCE).unwrap();
        assert!(
            unique_dreamwell_index(&catalog.cards, "missing")
                .unwrap_err()
                .to_string()
                .contains("RECORD_NOT_FOUND")
        );
        assert!(set_dreamwell_field(&mut catalog.cards[0], "order", json!(5)).is_err());
        assert!(
            set_dreamwell_field(
                &mut catalog.cards[0],
                "art",
                json!({ "x": 0, "y": 0, "scale": 0 }),
            )
            .is_err()
        );
        assert!(set_dreamwell_field(&mut catalog.cards[0], "card-number", json!(1)).is_err());
    }

    #[test]
    fn dreamwell_semantic_no_op_preserves_source_bytes() {
        let mut catalog: DreamwellCatalog = ron::from_str(DREAMWELL_EDITOR_SOURCE).unwrap();
        let original = catalog.clone();
        set_dreamwell_field(&mut catalog.cards[0], "name", json!("Raw Horizon")).unwrap();
        let patched =
            patch_dreamwell_source_field(DREAMWELL_EDITOR_SOURCE, &catalog.cards[0], "name")
                .unwrap();

        assert_eq!(catalog, original);
        assert_ne!(patched, DREAMWELL_EDITOR_SOURCE);
        assert_eq!(
            ron::from_str::<DreamwellCatalog>(&patched).unwrap(),
            catalog
        );
        // edit_dreamwell compares typed catalogs before writing, so this
        // normalized replacement is deliberately suppressed as a no-op.
    }

    const DREAMSIGN_ID: &str = "00000000-0000-4000-8000-000000000021";
    const DREAMSIGN_SOURCE: &str = r###"// Stable Dreamsign guidance.

#![enable(implicit_some)]
[
  // Edited record comment.
  DreamsignDefinition(
    name: r#"Raw Sign"#,
    id: "00000000-0000-4000-8000-000000000021",
    ability_text: ["First paragraph", "Nested text: tags: [\"not metadata\"]"],
    art: (image: "first.png"),
  ),

  /* Unrelated record comment. */
  DreamsignDefinition(
    name: "Unrelated Sign",
    id: "00000000-0000-4000-8000-000000000022",
    ability_text: ["Unrelated ability."],
    art: (image: "second.png"),
  ),
]
"###;

    const DREAMSIGN_METADATA_SOURCE: &str = r###"// Internal labels.

#![enable(implicit_some)]
(
  dreamsigns: {
    "00000000-0000-4000-8000-000000000021": (
      tides: ["one"],
      // Preserve this field comment.
      tags: ["first", "second"],
    ),
    "00000000-0000-4000-8000-000000000022": (tags: ["unrelated"]),
  },
)
"###;

    const DREAMSIGN_TAG_SOURCE: &str = r###"// Registry guidance.

#![enable(implicit_some)]
(
  tags: [
    DreamsignTag(name: "first", color: "#112233"),
    DreamsignTag(name: "second", color: "#445566"),
  ],
)
"###;

    const FIGMENT_ID: &str = "00000000-0000-4000-8000-000000000031";
    const FIGMENT_SOURCE: &str = r###"// Stable Figment catalog guidance.

#![enable(implicit_some)]
[
  // Edited record comment.
  FigmentDefinition(
    id: "00000000-0000-4000-8000-000000000031",
    name: r#"Raw Figment"#,
    character_type: Warrior,
    base_spark: 1,
    behavior: Vanilla,
    image_number: 31,
  ),

  /* Unrelated record comment. */
  FigmentDefinition(
    id: "00000000-0000-4000-8000-000000000032",
    name: "Unrelated Figment",
    character_type: Shadow,
    base_spark: 2,
    behavior: Vengeful,
    image_number: 32,
    art: (x: 0.0, y: 0.25, scale: 1.5),
  ),
]
"###;

    #[test]
    fn figment_scalar_patch_changes_one_line_and_preserves_unrelated_source() {
        let mut figments: Vec<FigmentDefinition> = ron::from_str(FIGMENT_SOURCE).unwrap();
        let index = unique_figment_index(&figments, FIGMENT_ID).unwrap();
        let unrelated_before = typed_record_range(
            FIGMENT_SOURCE,
            "FigmentDefinition",
            "id",
            "00000000-0000-4000-8000-000000000032",
        )
        .unwrap();
        set_figment_field(&mut figments[index], "spark", json!(3)).unwrap();
        let patched =
            patch_figment_source_field(FIGMENT_SOURCE, &figments[index], "spark").unwrap();
        let changed_lines = FIGMENT_SOURCE
            .lines()
            .zip(patched.lines())
            .filter(|(before, after)| before != after)
            .count();
        assert_eq!(changed_lines, 1);
        let unrelated_after = typed_record_range(
            &patched,
            "FigmentDefinition",
            "id",
            "00000000-0000-4000-8000-000000000032",
        )
        .unwrap();
        assert_eq!(&FIGMENT_SOURCE[unrelated_before], &patched[unrelated_after]);
        assert!(patched.contains("name: r#\"Raw Figment\"#"));
        assert_eq!(
            ron::from_str::<Vec<FigmentDefinition>>(&patched).unwrap(),
            figments
        );
    }

    #[test]
    fn figment_editor_round_trips_every_field_shape_and_inserts_optional_art() {
        let mut figments: Vec<FigmentDefinition> = ron::from_str(FIGMENT_SOURCE).unwrap();
        let index = unique_figment_index(&figments, FIGMENT_ID).unwrap();
        let mut patched = FIGMENT_SOURCE.to_owned();
        for (field, value) in [
            ("name", json!("Edited Figment")),
            ("subtype", json!("Spirit Animal")),
            ("spark", json!(4)),
            ("rendered-text", json!("Awakened")),
            ("image-number", json!(99)),
            ("art", json!({ "x": -0.25, "y": 0.5, "scale": 1.75 })),
        ] {
            set_figment_field(&mut figments[index], field, value).unwrap();
            patched = patch_figment_source_field(&patched, &figments[index], field).unwrap();
        }
        assert!(patched.contains("art: (x: -0.25, y: 0.5, scale: 1.75),"));
        assert!(patched.contains("/* Unrelated record comment. */"));
        assert_eq!(
            ron::from_str::<Vec<FigmentDefinition>>(&patched).unwrap(),
            figments
        );
        crate::models::figments::lower(figments).unwrap();
    }

    #[test]
    fn figment_editor_rejects_invalid_identities_variants_and_numbers() {
        let mut figments: Vec<FigmentDefinition> = ron::from_str(FIGMENT_SOURCE).unwrap();
        let index = unique_figment_index(&figments, FIGMENT_ID).unwrap();
        assert!(unique_figment_index(&figments, "not-a-uuid").is_err());
        assert!(set_figment_field(&mut figments[index], "subtype", json!("Visitor")).is_err());
        assert!(
            set_figment_field(&mut figments[index], "rendered-text", json!("Custom text")).is_err()
        );
        assert!(set_figment_field(&mut figments[index], "spark", json!(-1)).is_err());
    }

    #[test]
    fn dreamsign_scalar_patch_changes_one_line_and_preserves_unrelated_source() {
        let mut definitions: Vec<DreamsignDefinition> = ron::from_str(DREAMSIGN_SOURCE).unwrap();
        let index = unique_dreamsign_index(&definitions, DREAMSIGN_ID).unwrap();
        set_dreamsign_definition_field(&mut definitions[index], "name", json!("Edited Sign"))
            .unwrap();
        let patched =
            patch_dreamsign_definition_field(DREAMSIGN_SOURCE, &definitions[index], "name")
                .unwrap();
        let changed_lines = DREAMSIGN_SOURCE
            .lines()
            .zip(patched.lines())
            .filter(|(before, after)| before != after)
            .count();
        assert_eq!(changed_lines, 1);
        assert!(patched.contains("/* Unrelated record comment. */"));
        assert!(patched.contains("name: \"Unrelated Sign\""));
        assert!(patched.contains("Nested text: tags:"));
        assert_eq!(
            ron::from_str::<Vec<DreamsignDefinition>>(&patched).unwrap(),
            definitions
        );
    }

    #[test]
    fn dreamsign_editor_patches_ability_and_metadata_tags_as_typed_values() {
        let mut definitions: Vec<DreamsignDefinition> = ron::from_str(DREAMSIGN_SOURCE).unwrap();
        let index = unique_dreamsign_index(&definitions, DREAMSIGN_ID).unwrap();
        set_dreamsign_definition_field(
            &mut definitions[index],
            "rendered-text",
            json!("One paragraph\n\nAnother paragraph"),
        )
        .unwrap();
        let patched_definitions = patch_dreamsign_definition_field(
            DREAMSIGN_SOURCE,
            &definitions[index],
            "rendered-text",
        )
        .unwrap();
        assert_eq!(
            ron::from_str::<Vec<DreamsignDefinition>>(&patched_definitions).unwrap(),
            definitions
        );

        let metadata: DreamsignMetadataCatalog = ron::from_str(DREAMSIGN_METADATA_SOURCE).unwrap();
        let id = definitions[index].id;
        let patched_metadata =
            patch_dreamsign_metadata_tags(DREAMSIGN_METADATA_SOURCE, id, &["second".into()])
                .unwrap();
        let parsed: DreamsignMetadataCatalog = ron::from_str(&patched_metadata).unwrap();
        assert_eq!(parsed.dreamsigns[&id].tags, ["second"]);
        assert!(patched_metadata.contains("// Preserve this field comment."));
        assert!(patched_metadata.contains("(tags: [\"unrelated\"])"));
        assert_eq!(
            metadata.dreamsigns.keys().collect::<Vec<_>>(),
            parsed.dreamsigns.keys().collect::<Vec<_>>()
        );
    }

    #[test]
    fn dreamsign_tag_registry_replacement_preserves_root_comments_and_round_trips() {
        let catalog = DreamsignTagCatalog {
            tags: vec![
                DreamsignTag {
                    name: "second".into(),
                    color: "#445566".into(),
                },
                DreamsignTag {
                    name: "third".into(),
                    color: "#778899".into(),
                },
            ],
        };
        let patched = patch_dreamsign_tag_catalog(DREAMSIGN_TAG_SOURCE, &catalog).unwrap();
        assert!(patched.starts_with("// Registry guidance."));
        assert_eq!(
            ron::from_str::<DreamsignTagCatalog>(&patched).unwrap(),
            catalog
        );
        assert!(
            unique_dreamsign_index(
                &ron::from_str::<Vec<DreamsignDefinition>>(DREAMSIGN_SOURCE).unwrap(),
                "not-a-uuid"
            )
            .is_err()
        );
        assert!(
            dreamsigns::validate_tags(&DreamsignTagCatalog {
                tags: vec![DreamsignTag {
                    name: "bad".into(),
                    color: "red".into()
                }],
            })
            .is_err()
        );
    }

    #[test]
    fn dream_avatar_scalar_patch_changes_one_line_and_preserves_unrelated_source() {
        let mut avatars: Vec<AvatarDefinition> = ron::from_str(DREAM_AVATAR_SOURCE).unwrap();
        let index = unique_dream_avatar_index(&avatars, AVATAR_ID).unwrap();
        set_dream_avatar_field(&mut avatars[index], "name", json!("Edited Name")).unwrap();
        let patched =
            patch_dream_avatar_source_field(DREAM_AVATAR_SOURCE, &avatars[index], "name").unwrap();

        let changed_lines = DREAM_AVATAR_SOURCE
            .lines()
            .zip(patched.lines())
            .filter(|(before, after)| before != after)
            .count();
        assert_eq!(changed_lines, 1);
        assert!(patched.contains("// Edited record comment."));
        assert!(patched.contains("/* Unrelated record comment. */"));
        assert!(patched.contains("name: \"Unrelated Avatar\""));
        assert_eq!(
            ron::from_str::<Vec<AvatarDefinition>>(&patched).unwrap(),
            avatars
        );
    }

    #[test]
    fn glossary_scalar_patch_changes_one_line_and_preserves_unrelated_source() {
        let mut definitions: Vec<GlossaryDefinition> = ron::from_str(GLOSSARY_SOURCE).unwrap();
        let index = unique_glossary_index(&definitions, GLOSSARY_ID).unwrap();
        let unrelated_before = typed_record_range(
            GLOSSARY_SOURCE,
            "GlossaryDefinition",
            "id",
            "00000000-0000-4000-8000-000000000022",
        )
        .unwrap();
        set_glossary_field(
            &mut definitions[index],
            "definition",
            json!("Edited definition."),
        )
        .unwrap();
        let patched =
            patch_glossary_source_field(GLOSSARY_SOURCE, &definitions[index], "definition")
                .unwrap();

        assert_eq!(
            GLOSSARY_SOURCE
                .lines()
                .zip(patched.lines())
                .filter(|(before, after)| before != after)
                .count(),
            1
        );
        assert!(patched.contains("term: r#\"Echo\"#"));
        assert!(patched.contains("/* Unrelated record comment. */"));
        let unrelated_after = typed_record_range(
            &patched,
            "GlossaryDefinition",
            "id",
            "00000000-0000-4000-8000-000000000022",
        )
        .unwrap();
        assert_eq!(
            &GLOSSARY_SOURCE[unrelated_before],
            &patched[unrelated_after]
        );
        assert_eq!(
            ron::from_str::<Vec<GlossaryDefinition>>(&patched).unwrap(),
            definitions
        );
    }

    #[test]
    fn glossary_editor_round_trips_every_field_shape_and_optional_presentation() {
        let mut source = GLOSSARY_SOURCE.to_owned();
        let mut definitions: Vec<GlossaryDefinition> = ron::from_str(&source).unwrap();
        let index = unique_glossary_index(&definitions, GLOSSARY_ID).unwrap();
        for (field, value) in [
            ("term", json!("Resonance")),
            ("priority", json!(-12)),
            ("variants", json!(["resonances", "resonant"])),
            ("term-presentation", json!("definitionOnly")),
        ] {
            set_glossary_field(&mut definitions[index], field, value).unwrap();
            glossary::lower(definitions.clone()).unwrap();
            source = patch_glossary_source_field(&source, &definitions[index], field).unwrap();
            assert_eq!(
                ron::from_str::<Vec<GlossaryDefinition>>(&source).unwrap(),
                definitions
            );
        }
        assert_eq!(source.matches("term_presentation:").count(), 2);
        assert!(source.contains("pattern: r#\"\\becho"));

        set_glossary_field(
            &mut definitions[index],
            "term-presentation",
            JsonValue::Null,
        )
        .unwrap();
        source =
            patch_glossary_source_field(&source, &definitions[index], "term-presentation").unwrap();
        assert_eq!(source.matches("term_presentation:").count(), 1);
        assert_eq!(
            ron::from_str::<Vec<GlossaryDefinition>>(&source).unwrap(),
            definitions
        );
        assert_eq!(
            definitions
                .iter()
                .map(|definition| definition.id.to_string())
                .collect::<Vec<_>>(),
            [
                "00000000-0000-4000-8000-000000000021",
                "00000000-0000-4000-8000-000000000022",
                "00000000-0000-4000-8000-000000000023",
                "00000000-0000-4000-8000-000000000024",
                "00000000-0000-4000-8000-000000000025",
                "00000000-0000-4000-8000-000000000026",
            ]
        );
    }

    #[test]
    fn glossary_editor_rejects_invalid_fields_values_and_identities() {
        let mut definitions: Vec<GlossaryDefinition> = ron::from_str(GLOSSARY_SOURCE).unwrap();
        let index = unique_glossary_index(&definitions, GLOSSARY_ID).unwrap();
        for (field, value) in [
            ("term", json!("   ")),
            ("definition", json!("")),
            ("priority", json!(1.5)),
            ("variants", json!([17])),
            ("term-presentation", json!("titleAndDefinition")),
            ("id", json!(GLOSSARY_ID)),
        ] {
            assert!(set_glossary_field(&mut definitions[index], field, value).is_err());
        }
        assert!(unique_glossary_index(&definitions, "not-a-uuid").is_err());
        assert!(
            unique_glossary_index(&definitions, "00000000-0000-4000-8000-000000000099",)
                .unwrap_err()
                .to_string()
                .contains("RECORD_NOT_FOUND")
        );
    }

    #[test]
    fn dream_guide_home_swap_changes_two_lines_and_preserves_unrelated_source() {
        let source = DREAM_GUIDE_EDITOR_SOURCE;
        let mut guides: Vec<GuideDefinition> = ron::from_str(source).unwrap();
        let unrelated_before = typed_record_range(
            source,
            "GuideDefinition",
            "id",
            "00000000-0000-4000-8000-000000000003",
        )
        .unwrap();
        let patched =
            swap_dream_guide_source_field(source, &mut guides, 0, 1, "home_dreamscape_id").unwrap();
        let changed_lines = source
            .lines()
            .zip(patched.lines())
            .filter(|(before, after)| before != after)
            .count();
        assert_eq!(changed_lines, 2);
        assert!(patched.contains("site_dialogue: [r#\"Raw dialogue\"#]"));
        assert!(patched.starts_with("// Stable Dream guide guidance.\n"));
        let unrelated_after = typed_record_range(
            &patched,
            "GuideDefinition",
            "id",
            "00000000-0000-4000-8000-000000000003",
        )
        .unwrap();
        assert_eq!(
            &source[unrelated_before], &patched[unrelated_after],
            "unrelated records must remain byte-identical"
        );
        assert_eq!(
            ron::from_str::<Vec<GuideDefinition>>(&patched).unwrap(),
            guides
        );
    }

    #[test]
    fn dream_guide_specialty_swap_preserves_nested_source_and_order() {
        let source = DREAM_GUIDE_EDITOR_SOURCE;
        let mut guides: Vec<GuideDefinition> = ron::from_str(source).unwrap();
        let ids_before = guides.iter().map(|guide| guide.id).collect::<Vec<_>>();
        let patched =
            swap_dream_guide_source_field(source, &mut guides, 0, 1, "specialty").unwrap();
        assert!(patched.contains("specialty: RandomSite("));
        assert!(patched.contains("description: \"Random copy\""));
        assert!(patched.contains("dialogue: [\"Random line\"]"));
        assert!(patched.contains("specialty: Shop(description: \"Shop copy\")"));
        assert_eq!(
            guides.iter().map(|guide| guide.id).collect::<Vec<_>>(),
            ids_before
        );
        assert_eq!(
            ron::from_str::<Vec<GuideDefinition>>(&patched).unwrap(),
            guides
        );
    }

    #[test]
    fn dream_guide_routes_reject_unknown_identities_and_accept_canonical_ids() {
        let guides: Vec<GuideDefinition> = ron::from_str(DREAM_GUIDE_EDITOR_SOURCE).unwrap();
        assert_eq!(
            unique_dream_guide_index(&guides, "00000000-0000-4000-8000-000000000001").unwrap(),
            0
        );
        assert!(
            unique_dream_guide_index(&guides, "not-a-guide")
                .unwrap_err()
                .to_string()
                .contains("registered compatibility key")
        );
    }

    #[test]
    fn dreamscape_scalar_patch_changes_one_line_and_preserves_unrelated_source() {
        let source = DREAMSCAPE_EDITOR_SOURCE;
        let mut dreamscapes: Vec<DreamscapeDefinition> = ron::from_str(source).unwrap();
        let index = unique_dreamscape_index(&dreamscapes, "firstlight_meadow").unwrap();
        let unrelated_before = typed_record_range(
            source,
            "DreamscapeDefinition",
            "id",
            "f31e1199-70bc-4110-85f9-505afebb02c4",
        )
        .unwrap();
        set_dreamscape_field(&mut dreamscapes[index], "name", json!("Edited Starter")).unwrap();
        let patched = patch_dreamscape_source_field(source, &dreamscapes[index], "name").unwrap();

        assert_eq!(
            source
                .lines()
                .zip(patched.lines())
                .filter(|(before, after)| before != after)
                .count(),
            1
        );
        assert!(patched.starts_with("// Stable catalog guidance.\n"));
        assert!(patched.contains("// Editable nested fields."));
        let unrelated_after = typed_record_range(
            &patched,
            "DreamscapeDefinition",
            "id",
            "f31e1199-70bc-4110-85f9-505afebb02c4",
        )
        .unwrap();
        assert_eq!(&source[unrelated_before], &patched[unrelated_after]);
        assert_eq!(
            ron::from_str::<Vec<DreamscapeDefinition>>(&patched).unwrap(),
            dreamscapes
        );
    }

    #[test]
    fn dreamscape_editor_round_trips_nested_affiliation_and_opponent_fields() {
        let mut source = DREAMSCAPE_EDITOR_SOURCE.to_owned();
        let mut dreamscapes: Vec<DreamscapeDefinition> = ron::from_str(&source).unwrap();
        let index = unique_dreamscape_index(&dreamscapes, "tumbleleaf_village").unwrap();

        set_dreamscape_field(
            &mut dreamscapes[index],
            "affiliation-id",
            json!("c3815562-e80d-4afc-8ba6-91bd60ad323e"),
        )
        .unwrap();
        source =
            patch_dreamscape_source_field(&source, &dreamscapes[index], "affiliation-id").unwrap();
        set_dreamscape_opponents(
            &mut dreamscapes[index],
            vec![
                "c72cfd7b-408b-47f6-adf1-1e486a7e20d3".into(),
                "6488452d-4e9e-466c-96df-716d4ec646b1".into(),
                "60bd584b-5bc8-4ee7-8a98-cbb304eb71ab".into(),
            ],
        )
        .unwrap();
        source = patch_dreamscape_source_field(
            &source,
            &dreamscapes[index],
            "opponent_dream_avatar_ids",
        )
        .unwrap();

        dreamscapes::validate(&dreamscapes).unwrap();
        assert!(source.contains("/* Unrelated record comment. */"));
        assert_eq!(
            ron::from_str::<Vec<DreamscapeDefinition>>(&source).unwrap(),
            dreamscapes
        );
    }

    #[test]
    fn dreamscape_editor_rejects_invalid_identities_and_inapplicable_fields() {
        let mut dreamscapes: Vec<DreamscapeDefinition> =
            ron::from_str(DREAMSCAPE_EDITOR_SOURCE).unwrap();
        assert!(
            unique_dreamscape_index(&dreamscapes, "not-a-dreamscape")
                .unwrap_err()
                .to_string()
                .contains("canonical UUIDv4 or registered compatibility key")
        );
        let starter = unique_dreamscape_index(&dreamscapes, "firstlight_meadow").unwrap();
        assert!(
            set_dreamscape_field(
                &mut dreamscapes[starter],
                "affiliation-id",
                json!("4b715cd0-8b41-4b82-9cef-c47b15e8992b"),
            )
            .unwrap_err()
            .to_string()
            .contains("Standard Dreamscapes")
        );
    }

    #[test]
    fn dream_avatar_patches_every_editable_field_shape_and_absent_optional_field() {
        let mut source = DREAM_AVATAR_SOURCE.to_owned();
        let mut avatars: Vec<AvatarDefinition> = ron::from_str(&source).unwrap();
        let index = unique_dream_avatar_index(&avatars, AVATAR_ID).unwrap();
        for (field, value) in [
            ("title", json!("Edited Title")),
            ("rendered-text", json!("One paragraph\n\nAnother paragraph")),
            ("image-number", json!("0099")),
            ("starting-essence", json!(137)),
        ] {
            set_dream_avatar_field(&mut avatars[index], field, value).unwrap();
            source = patch_dream_avatar_source_field(&source, &avatars[index], field).unwrap();
            assert_eq!(
                ron::from_str::<Vec<AvatarDefinition>>(&source).unwrap(),
                avatars
            );
        }

        assert!(source.contains("portrait: (image: 99, focus: (x: 0.25, y: 0.75))"));
        assert_eq!(source.matches("starting_essence:").count(), 1);
        assert!(source.contains("name: \"Unrelated Avatar\""));
        let ids = ron::from_str::<Vec<AvatarDefinition>>(&source)
            .unwrap()
            .into_iter()
            .map(|avatar| avatar.id.to_string())
            .collect::<Vec<_>>();
        assert_eq!(
            ids,
            vec![
                "00000000-0000-4000-8000-000000000011",
                "00000000-0000-4000-8000-000000000012",
            ]
        );
    }

    #[test]
    fn dream_avatar_editor_rejects_invalid_fields_values_and_identities() {
        let mut avatars: Vec<AvatarDefinition> = ron::from_str(DREAM_AVATAR_SOURCE).unwrap();
        let index = unique_dream_avatar_index(&avatars, AVATAR_ID).unwrap();
        for (field, value) in [
            ("name", json!("   ")),
            ("title", json!("")),
            ("rendered-text", json!("")),
            ("image-number", json!(0)),
            ("id", json!("00000000-0000-4000-8000-000000000099")),
        ] {
            assert!(set_dream_avatar_field(&mut avatars[index], field, value).is_err());
        }
        assert!(
            unique_dream_avatar_index(&avatars, "00000000-0000-4000-8000-000000000099")
                .unwrap_err()
                .to_string()
                .contains("RECORD_NOT_FOUND")
        );
        assert!(unique_dream_avatar_index(&avatars, "not-a-uuid").is_err());
    }

    #[test]
    fn tide_scalar_edit_is_operation_sized_and_preserves_unrelated_source() {
        let mut catalog: TidesCatalog = ron::from_str(TIDES_SOURCE).unwrap();
        let index = unique_tide_index(&catalog, TIDE_ID).unwrap();
        set_tide_field(&mut catalog[index], "displayName", json!("Edited Tide")).unwrap();
        let patched = patch_tide_field(TIDES_SOURCE, &catalog[index], "displayName").unwrap();

        assert_eq!(ron::from_str::<TidesCatalog>(&patched).unwrap(), catalog);
        let before = TIDES_SOURCE.lines().collect::<Vec<_>>();
        let after = patched.lines().collect::<Vec<_>>();
        assert_eq!(before.len(), after.len());
        assert_eq!(
            before
                .iter()
                .zip(after.iter())
                .filter(|(left, right)| left != right)
                .count(),
            1
        );
        assert!(patched.contains("/* Unrelated tide comment. */"));
        assert!(patched.contains("display_name: \"Facet Tide\""));
    }

    #[test]
    fn tide_editor_round_trips_resonance() {
        let mut catalog: TidesCatalog = ron::from_str(TIDES_SOURCE).unwrap();
        let index = unique_tide_index(&catalog, TIDE_ID).unwrap();
        set_tide_field(&mut catalog[index], "resonance", json!("ember")).unwrap();
        let patched = patch_tide_field(TIDES_SOURCE, &catalog[index], "resonance").unwrap();

        assert_eq!(ron::from_str::<TidesCatalog>(&patched).unwrap(), catalog);
        assert!(patched.contains("resonance: Ember"));
        assert!(patched.contains("display_name: \"Facet Tide\""));
    }

    #[test]
    fn tide_pool_editor_round_trips_optional_and_list_shapes() {
        let mut catalog: DreamAvatarTidePoolsCatalog = ron::from_str(TIDE_POOLS_SOURCE).unwrap();

        let before = catalog[0].clone();
        let after = DreamAvatarPool {
            dream_avatar_id: before.dream_avatar_id,
            starter: None,
            facets: vec![TideId::parse("00000000-0000-4000-8000-000000000042").unwrap()],
            neutral: vec![],
        };
        let patched = patch_tide_pool(TIDE_POOLS_SOURCE, &before, &after).unwrap();
        catalog[0] = after;

        assert_eq!(
            ron::from_str::<DreamAvatarTidePoolsCatalog>(&patched).unwrap(),
            catalog
        );
        assert!(patched.contains("starter: None"));
        assert!(patched.contains("neutral: []"));
    }

    #[test]
    fn tide_editor_rejects_invalid_identities_fields_and_roles() {
        let mut catalog: TidesCatalog = ron::from_str(TIDES_SOURCE).unwrap();
        assert!(unique_tide_index(&catalog, "not-a-uuid").is_err());
        assert!(unique_tide_index(&catalog, "00000000-0000-4000-8000-000000000099").is_err());
        let index = unique_tide_index(&catalog, TIDE_ID).unwrap();
        assert!(set_tide_field(&mut catalog[index], "resonance", json!("harmony")).is_err());
        assert!(set_tide_field(&mut catalog[index], "kind", json!("neutral")).is_err());

        let mut pools: DreamAvatarTidePoolsCatalog = ron::from_str(TIDE_POOLS_SOURCE).unwrap();
        pools[0].facets = vec![TideId::parse(TIDE_ID).unwrap()];
        assert!(
            dream_avatar_tide_pools::validate(&pools, &tides::tide_kinds(&catalog).unwrap())
                .unwrap_err()
                .to_string()
                .contains("facet reference")
        );
    }

    fn action(kind: EffectKind) -> JsonValue {
        let mut value = Map::from_iter([
            ("id".into(), json!("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")),
            ("label".into(), json!("Choose")),
            ("effectText".into(), json!("Effect")),
            ("effectKind".into(), json!(kind.as_compat())),
        ]);
        let fields: &[(&str, JsonValue)] = match kind {
            EffectKind::GainOfferedCard => &[("predicate", json!("character"))],
            EffectKind::TransfigureSelected => &[("count", json!(1))],
            EffectKind::TransfigureRandomCards => {
                &[("predicate", json!("event")), ("count", json!(2))]
            }
            EffectKind::TransfigureFixedRandomCards => &[
                ("predicate", json!("event")),
                ("count", json!(2)),
                ("transfiguration", json!("Kindled")),
            ],
            EffectKind::PurgeSelected => &[],
            EffectKind::TransfigureRandomStarterCards => &[("count", json!(2))],
            EffectKind::PurgeRandomStarterAndGainCard | EffectKind::ReplaceAllStarterCards => {
                &[("predicate", json!("character"))]
            }
            EffectKind::GainRandomCards => &[("predicate", json!("event")), ("count", json!(1))],
            EffectKind::DraftCard => &[
                ("predicate", json!("character")),
                ("count", json!(1)),
                ("offerCount", json!(2)),
            ],
            EffectKind::ChangeSubtypeSelected => {
                &[("subtype", json!("Guide")), ("deckTarget", json!("chosen"))]
            }
            EffectKind::ChangeCardTypeSelected => &[
                ("cardType", json!("Event")),
                ("deckTarget", json!("offered")),
            ],
            EffectKind::ChangeRandomCardType => {
                &[("count", json!(2)), ("cardType", json!("Character"))]
            }
            EffectKind::ChangeSubtypeAll => &[("subtypeOptions", json!(["Guide", "Warrior"]))],
            EffectKind::GainCard => &[("cardId", json!("00000000-0000-4000-8000-000000000001"))],
            EffectKind::GainDreamsign => {
                &[("dreamsignId", json!("00000000-0000-4000-8000-000000000002"))]
            }
            EffectKind::GainNightmareAndDreamsign => &[
                ("dreamsignId", json!("00000000-0000-4000-8000-000000000002")),
                ("nightmareCount", json!(1)),
            ],
            EffectKind::GainNightmareAndOfferedDreamsign => {
                &[("offerCount", json!(3)), ("nightmareCount", json!(1))]
            }
            EffectKind::GainEssencePerCard => &[
                ("predicate", json!("character")),
                ("essencePerCard", json!(1)),
            ],
            EffectKind::GainEssence => &[("essence", json!(100))],
            EffectKind::GainRandomEssence => &[
                ("minimumEssence", json!(50)),
                ("maximumEssence", json!(150)),
            ],
            EffectKind::ChoosePack => &[
                ("predicate", json!("character")),
                ("packCount", json!(2)),
                ("packSize", json!(3)),
            ],
            EffectKind::IncreaseSparkAll => &[("sparkBonus", json!(1))],
            EffectKind::PurgeRandomSubtypeAndIncreaseSpark => {
                &[("subtype", json!("Warrior")), ("sparkBonus", json!(1))]
            }
            EffectKind::ReduceCostAllAndGainNightmares => &[
                ("energyCostReduction", json!(1)),
                ("nightmareCount", json!(1)),
            ],
            EffectKind::MakePredicateFastAndGainNightmares => {
                &[("predicate", json!("event")), ("nightmareCount", json!(2))]
            }
            EffectKind::PurgeOneTransfigureAndCopyOthers => &[
                ("offerCount", json!(4)),
                ("transfiguration", json!("Kindled")),
            ],
            EffectKind::TransfigureFixedSelected => &[
                ("transfiguration", json!("DoubledSpark")),
                ("deckTarget", json!("chosen")),
            ],
            EffectKind::TransfigureAllForEssence => &[
                ("essence", json!(100)),
                ("predicate", json!("event")),
                ("transfiguration", json!("Inspired")),
            ],
            EffectKind::PurgeDisclosedAndTransfigureSameType => {
                &[("transfiguration", json!("Inspired"))]
            }
            EffectKind::PurgeDreamsignForEssence => &[("essence", json!(5))],
            EffectKind::GainOfferedDreamsign | EffectKind::ReplaceSelectedDreamsignWithOffered => {
                &[("offerCount", json!(3))]
            }
            EffectKind::PurgeSelectedDreamsignAndGainRandom => &[("count", json!(1))],
            EffectKind::CopySelectedCard => &[("count", json!(1)), ("deckTarget", json!("chosen"))],
            EffectKind::CopySelectedCards => &[("count", json!(2))],
            EffectKind::CopyRandomCards => &[("predicate", json!("event")), ("count", json!(2))],
            EffectKind::CopyOfferedDeckCard => &[("offerCount", json!(3))],
            EffectKind::NextBattleOpeningHand => &[("count", json!(1))],
            EffectKind::NextBattleStartingEnergy => &[("count", json!(1))],
            EffectKind::ChooseDreamAvatar => &[("offerCount", json!(2))],
            EffectKind::TakeCards => &[("predicate", json!("character")), ("offerCount", json!(2))],
            EffectKind::TakeTransfiguredCardsAndGainNightmares => &[
                ("predicate", json!("character")),
                ("offerCount", json!(4)),
                ("transfiguration", json!("Inspired")),
                ("nightmareCount", json!(2)),
            ],
            EffectKind::ReplaceSelectedWithCard => {
                &[("cardId", json!("00000000-0000-4000-8000-000000000001"))]
            }
            EffectKind::ReplaceRandomWithCard => &[
                ("predicate", json!("legendary")),
                ("cardId", json!("00000000-0000-4000-8000-000000000001")),
            ],
            EffectKind::ReplaceSelected => &[("predicate", json!("event"))],
            EffectKind::GainNightmareAndCard => &[
                ("cardId", json!("00000000-0000-4000-8000-000000000001")),
                ("nightmareCount", json!(1)),
            ],
            EffectKind::TransfiguredCardDraft => {
                &[("predicate", json!("character")), ("offerCount", json!(2))]
            }
            EffectKind::PurgeForEssence => &[("essencePerSpark", json!(2))],
            EffectKind::AddFixedSite => &[("siteType", json!("Duplication"))],
            EffectKind::ChooseSiteType => &[("offerCount", json!(3))],
            EffectKind::LoseHalfEssenceAndFreePurchases => &[("count", json!(3))],
            EffectKind::MakeFastAll
            | EffectKind::DoubleEssence
            | EffectKind::PurgeAndCopy
            | EffectKind::PurgeStarterCard
            | EffectKind::PurgeRandomStarterCard
            | EffectKind::TransfigureAllStarterCards
            | EffectKind::TransfigureAllCards
            | EffectKind::GainRandomDreamsign
            | EffectKind::ReplaceAllDreamsignsRandom
            | EffectKind::NextBattleSmallerHandAndCostDiscount
            | EffectKind::PurgeDuplicatesAndGrantReclaim
            | EffectKind::TransfigureNextDraftOrShop
            | EffectKind::AddSite
            | EffectKind::FreeNextShop => &[],
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
        for kind in EffectKind::ALL {
            action_from_compat(action(kind))
                .unwrap_or_else(|error| panic!("{} did not map: {error:#}", kind.as_compat()));
        }
        let mut invalid = action(EffectKind::MakeFastAll);
        invalid
            .as_object_mut()
            .unwrap()
            .insert("count".into(), json!(1));
        assert!(
            action_from_compat(invalid)
                .unwrap_err()
                .to_string()
                .contains("does not apply")
        );
    }

    #[test]
    fn wave8_editor_maps_camel_case_fields_and_enforces_fixed_offer_counts() {
        assert!(matches!(
            action_from_compat(action(EffectKind::TransfigureAllCards))
                .unwrap()
                .effect,
            ActionEffect::TransfigureAllCards
        ));
        assert!(matches!(
            action_from_compat(action(EffectKind::PurgeDisclosedAndTransfigureSameType))
                .unwrap()
                .effect,
            ActionEffect::PurgeDisclosedAndTransfigureSameType { transfiguration }
                if transfiguration == "Inspired"
        ));
        assert!(matches!(
            action_from_compat(action(EffectKind::MakePredicateFastAndGainNightmares))
                .unwrap()
                .effect,
            ActionEffect::MakePredicateFastAndGainNightmares {
                predicate: Predicate::Event,
                nightmare_count: 2,
            }
        ));
        assert!(matches!(
            action_from_compat(action(EffectKind::TakeTransfiguredCardsAndGainNightmares))
                .unwrap()
                .effect,
            ActionEffect::TakeTransfiguredCardsAndGainNightmares {
                predicate: Predicate::Character,
                offer_count: 4,
                transfiguration,
                nightmare_count: 2,
            } if transfiguration == "Inspired"
        ));
        assert!(matches!(
            action_from_compat(action(EffectKind::PurgeOneTransfigureAndCopyOthers))
                .unwrap()
                .effect,
            ActionEffect::PurgeOneTransfigureAndCopyOthers {
                offer_count: 4,
                transfiguration,
            } if transfiguration == "Kindled"
        ));

        for kind in [
            EffectKind::TakeTransfiguredCardsAndGainNightmares,
            EffectKind::PurgeOneTransfigureAndCopyOthers,
        ] {
            let mut invalid = action(kind);
            invalid
                .as_object_mut()
                .unwrap()
                .insert("offerCount".into(), json!(3));
            assert!(
                action_from_compat(invalid)
                    .unwrap_err()
                    .to_string()
                    .contains("offerCount must be exactly 4")
            );
        }

        for kind in [
            EffectKind::MakePredicateFastAndGainNightmares,
            EffectKind::TakeTransfiguredCardsAndGainNightmares,
        ] {
            let mut invalid = action(kind);
            invalid
                .as_object_mut()
                .unwrap()
                .insert("nightmareCount".into(), json!(0));
            assert!(
                action_from_compat(invalid)
                    .unwrap_err()
                    .to_string()
                    .contains("must be positive")
            );
        }

        for kind in [
            EffectKind::TransfigureAllCards,
            EffectKind::PurgeDisclosedAndTransfigureSameType,
            EffectKind::MakePredicateFastAndGainNightmares,
            EffectKind::TakeTransfiguredCardsAndGainNightmares,
            EffectKind::PurgeOneTransfigureAndCopyOthers,
        ] {
            let mut invalid = action(kind);
            invalid
                .as_object_mut()
                .unwrap()
                .insert("foreignField".into(), json!(true));
            assert!(
                action_from_compat(invalid)
                    .unwrap_err()
                    .to_string()
                    .contains("does not apply")
            );
        }
    }

    #[test]
    fn wave8_effects_round_trip_through_source_patching_without_touching_other_actions() {
        for effect in [
            ActionEffect::TransfigureAllCards,
            ActionEffect::PurgeDisclosedAndTransfigureSameType {
                transfiguration: "Inspired".into(),
            },
            ActionEffect::MakePredicateFastAndGainNightmares {
                predicate: Predicate::Event,
                nightmare_count: 2,
            },
            ActionEffect::TakeTransfiguredCardsAndGainNightmares {
                predicate: Predicate::Character,
                offer_count: 4,
                transfiguration: "Kindled".into(),
                nightmare_count: 1,
            },
            ActionEffect::PurgeOneTransfigureAndCopyOthers {
                offer_count: 4,
                transfiguration: "DoubledSpark".into(),
            },
        ] {
            let mut catalog: ExplorationCatalog = ron::from_str(EXPLORATION_SOURCE).unwrap();
            let untouched_action = catalog[0].actions[1].clone();
            catalog[0].actions[0].effect = effect.clone();
            let patched =
                patch_exploration_action(EXPLORATION_SOURCE, &catalog[0].actions[0]).unwrap();
            let reparsed: ExplorationCatalog = ron::from_str(&patched).unwrap();
            assert_eq!(reparsed[0].actions[0].effect, effect);
            assert_eq!(reparsed[0].actions[1], untouched_action);
            assert!(patched.contains("/* Unrelated encounter comment. */"));
        }
    }

    #[test]
    fn shop_purchase_modifier_editor_maps_exact_fields_and_derived_metadata() {
        let mut free_next_shop = action(EffectKind::FreeNextShop);
        free_next_shop.as_object_mut().unwrap().insert(
            "canonicalMechanicId".into(),
            json!("shop-purchase-modifier"),
        );
        assert!(matches!(
            action_from_compat(free_next_shop).unwrap().effect,
            ActionEffect::FreeNextShop
        ));

        let counted =
            action_from_compat(action(EffectKind::LoseHalfEssenceAndFreePurchases)).unwrap();
        assert!(matches!(
            counted.effect,
            ActionEffect::LoseHalfEssenceAndFreePurchases { count: 3 }
        ));

        let mut nonpositive = action(EffectKind::LoseHalfEssenceAndFreePurchases);
        nonpositive
            .as_object_mut()
            .unwrap()
            .insert("count".into(), json!(0));
        assert!(
            action_from_compat(nonpositive)
                .unwrap_err()
                .to_string()
                .contains("count must be positive")
        );

        let mut foreign = action(EffectKind::FreeNextShop);
        foreign
            .as_object_mut()
            .unwrap()
            .insert("count".into(), json!(1));
        assert!(
            action_from_compat(foreign)
                .unwrap_err()
                .to_string()
                .contains("does not apply")
        );

        let mut invalid_policy = action(EffectKind::FreeNextShop);
        invalid_policy
            .as_object_mut()
            .unwrap()
            .insert("selectionPolicyId".into(), json!("uniform"));
        assert!(
            action_from_compat(invalid_policy)
                .unwrap_err()
                .to_string()
                .contains("FIELD_NOT_APPLICABLE")
        );
    }

    #[test]
    fn fixed_site_editor_maps_closed_site_types_and_preserves_add_site_metadata() {
        for (site_type, expected) in [
            ("Duplication", FixedSiteType::Duplication),
            ("Shop", FixedSiteType::Shop),
            ("DreamsignBazaar", FixedSiteType::DreamsignBazaar),
            ("Transfiguration", FixedSiteType::Transfiguration),
            ("Purge", FixedSiteType::Purge),
        ] {
            let mut fixed = action(EffectKind::AddFixedSite);
            fixed
                .as_object_mut()
                .unwrap()
                .insert("siteType".into(), json!(site_type));
            assert_eq!(
                action_from_compat(fixed).unwrap().effect,
                ActionEffect::AddFixedSite {
                    site_type: expected,
                }
            );
        }

        let mut fixed_metadata = action(EffectKind::AddFixedSite);
        fixed_metadata
            .as_object_mut()
            .unwrap()
            .insert("canonicalMechanicId".into(), json!("add-site"));
        fixed_metadata
            .as_object_mut()
            .unwrap()
            .insert("selectionPolicyId".into(), json!("fixed"));
        assert!(action_from_compat(fixed_metadata).is_ok());

        let mut uniform_metadata = action(EffectKind::AddSite);
        uniform_metadata
            .as_object_mut()
            .unwrap()
            .insert("canonicalMechanicId".into(), json!("add-site"));
        uniform_metadata
            .as_object_mut()
            .unwrap()
            .insert("selectionPolicyId".into(), json!("site-uniform"));
        assert_eq!(
            action_from_compat(uniform_metadata).unwrap().effect,
            ActionEffect::AddSite
        );
    }

    #[test]
    fn fixed_site_editor_rejects_missing_foreign_and_unknown_site_types() {
        let mut missing = action(EffectKind::AddFixedSite);
        missing.as_object_mut().unwrap().remove("siteType");
        assert!(
            action_from_compat(missing)
                .unwrap_err()
                .to_string()
                .contains("requires string field siteType")
        );

        for unknown in ["Battle", "duplication", "dreamsign-bazaar"] {
            let mut invalid = action(EffectKind::AddFixedSite);
            invalid
                .as_object_mut()
                .unwrap()
                .insert("siteType".into(), json!(unknown));
            assert!(
                action_from_compat(invalid)
                    .unwrap_err()
                    .to_string()
                    .contains("unknown fixed site type")
            );
        }

        let mut foreign = action(EffectKind::AddFixedSite);
        foreign
            .as_object_mut()
            .unwrap()
            .insert("count".into(), json!(1));
        assert!(
            action_from_compat(foreign)
                .unwrap_err()
                .to_string()
                .contains("does not apply")
        );

        let mut fieldful_add_site = action(EffectKind::AddSite);
        fieldful_add_site
            .as_object_mut()
            .unwrap()
            .insert("siteType".into(), json!("Shop"));
        assert!(
            action_from_compat(fieldful_add_site)
                .unwrap_err()
                .to_string()
                .contains("does not apply")
        );
    }

    #[test]
    fn site_type_chooser_editor_maps_default_offer_count_and_derived_metadata() {
        let chooser = action(EffectKind::ChooseSiteType);
        assert_eq!(chooser["offerCount"], json!(3));
        assert_eq!(
            action_from_compat(chooser).unwrap().effect,
            ActionEffect::ChooseSiteType { offer_count: 3 }
        );

        let mut chooser_metadata = action(EffectKind::ChooseSiteType);
        chooser_metadata
            .as_object_mut()
            .unwrap()
            .insert("canonicalMechanicId".into(), json!("add-site"));
        chooser_metadata
            .as_object_mut()
            .unwrap()
            .insert("selectionPolicyId".into(), json!("site-uniform"));
        assert!(action_from_compat(chooser_metadata).is_ok());
    }

    #[test]
    fn site_type_chooser_editor_rejects_missing_nonpositive_and_foreign_fields() {
        let mut missing = action(EffectKind::ChooseSiteType);
        missing.as_object_mut().unwrap().remove("offerCount");
        assert!(
            action_from_compat(missing)
                .unwrap_err()
                .to_string()
                .contains("requires integer field offerCount")
        );

        for invalid_count in [0, -1] {
            let mut nonpositive = action(EffectKind::ChooseSiteType);
            nonpositive
                .as_object_mut()
                .unwrap()
                .insert("offerCount".into(), json!(invalid_count));
            assert!(
                action_from_compat(nonpositive)
                    .unwrap_err()
                    .to_string()
                    .contains("offerCount must be positive")
            );
        }

        let mut foreign = action(EffectKind::ChooseSiteType);
        foreign
            .as_object_mut()
            .unwrap()
            .insert("siteType".into(), json!("Shop"));
        assert!(
            action_from_compat(foreign)
                .unwrap_err()
                .to_string()
                .contains("does not apply")
        );
    }

    #[test]
    fn validates_starter_card_effect_editor_contracts() {
        assert_eq!(
            action_from_compat(action(EffectKind::PurgeStarterCard))
                .unwrap()
                .effect,
            ActionEffect::PurgeStarterCard
        );
        assert_eq!(
            action_from_compat(action(EffectKind::PurgeRandomStarterCard))
                .unwrap()
                .effect,
            ActionEffect::PurgeRandomStarterCard
        );
        assert_eq!(
            action_from_compat(action(EffectKind::PurgeRandomStarterAndGainCard))
                .unwrap()
                .effect,
            ActionEffect::PurgeRandomStarterAndGainCard {
                predicate: Predicate::Character,
            }
        );
        assert_eq!(
            action_from_compat(action(EffectKind::ReplaceAllStarterCards))
                .unwrap()
                .effect,
            ActionEffect::ReplaceAllStarterCards {
                predicate: Predicate::Character,
            }
        );

        for kind in [
            EffectKind::PurgeStarterCard,
            EffectKind::PurgeRandomStarterCard,
        ] {
            let mut foreign = action(kind);
            foreign
                .as_object_mut()
                .unwrap()
                .insert("predicate".into(), json!("character"));
            assert!(
                action_from_compat(foreign)
                    .unwrap_err()
                    .to_string()
                    .contains("does not apply")
            );
        }

        for kind in [
            EffectKind::PurgeRandomStarterAndGainCard,
            EffectKind::ReplaceAllStarterCards,
        ] {
            let mut missing = action(kind);
            missing.as_object_mut().unwrap().remove("predicate");
            assert!(
                action_from_compat(missing)
                    .unwrap_err()
                    .to_string()
                    .contains("requires string field predicate")
            );

            let mut unsupported = action(kind);
            unsupported
                .as_object_mut()
                .unwrap()
                .insert("predicate".into(), json!("any"));
            assert!(
                action_from_compat(unsupported)
                    .unwrap_err()
                    .to_string()
                    .contains("unknown predicate")
            );

            let mut foreign = action(kind);
            foreign
                .as_object_mut()
                .unwrap()
                .insert("count".into(), json!(1));
            assert!(
                action_from_compat(foreign)
                    .unwrap_err()
                    .to_string()
                    .contains("does not apply")
            );

            let mut top_level_policy = action(kind);
            top_level_policy.as_object_mut().unwrap().insert(
                "selectionPolicyId".into(),
                json!(if kind == EffectKind::PurgeRandomStarterAndGainCard {
                    "card-fit-quality"
                } else {
                    "card-bundle"
                }),
            );
            assert!(
                action_from_compat(top_level_policy)
                    .unwrap_err()
                    .to_string()
                    .contains("FIELD_NOT_APPLICABLE")
            );
        }
    }

    #[test]
    fn validates_starter_card_transfiguration_editor_contracts() {
        assert_eq!(
            action_from_compat(action(EffectKind::TransfigureRandomStarterCards))
                .unwrap()
                .effect,
            ActionEffect::TransfigureRandomStarterCards { count: 2 }
        );
        assert_eq!(
            action_from_compat(action(EffectKind::TransfigureAllStarterCards))
                .unwrap()
                .effect,
            ActionEffect::TransfigureAllStarterCards
        );

        let mut missing_count = action(EffectKind::TransfigureRandomStarterCards);
        missing_count.as_object_mut().unwrap().remove("count");
        assert!(
            action_from_compat(missing_count)
                .unwrap_err()
                .to_string()
                .contains("requires integer field count")
        );

        let mut nonpositive_count = action(EffectKind::TransfigureRandomStarterCards);
        nonpositive_count
            .as_object_mut()
            .unwrap()
            .insert("count".into(), json!(0));
        assert!(
            action_from_compat(nonpositive_count)
                .unwrap_err()
                .to_string()
                .contains("count must be positive")
        );

        let mut foreign = action(EffectKind::TransfigureAllStarterCards);
        foreign
            .as_object_mut()
            .unwrap()
            .insert("count".into(), json!(1));
        assert!(
            action_from_compat(foreign)
                .unwrap_err()
                .to_string()
                .contains("does not apply")
        );

        for kind in [
            EffectKind::TransfigureRandomStarterCards,
            EffectKind::TransfigureAllStarterCards,
        ] {
            let mut explicit_metadata = action(kind);
            explicit_metadata.as_object_mut().unwrap().insert(
                "canonicalMechanicId".into(),
                json!("transfigure-deck-entry"),
            );
            explicit_metadata
                .as_object_mut()
                .unwrap()
                .insert("selectionPolicyId".into(), json!("uniform"));
            assert!(action_from_compat(explicit_metadata).is_ok());
        }
    }

    #[test]
    fn validates_multi_card_transfiguration_editor_contracts() {
        assert_eq!(
            action_from_compat(action(EffectKind::TransfigureSelected))
                .unwrap()
                .effect,
            ActionEffect::TransfigureSelected {
                predicate: None,
                count: 1,
            }
        );
        assert_eq!(
            action_from_compat(action(EffectKind::TransfigureRandomCards))
                .unwrap()
                .effect,
            ActionEffect::TransfigureRandomCards {
                predicate: Predicate::Event,
                count: 2,
            }
        );
        assert_eq!(
            action_from_compat(action(EffectKind::TransfigureFixedRandomCards))
                .unwrap()
                .effect,
            ActionEffect::TransfigureFixedRandomCards {
                predicate: Predicate::Event,
                count: 2,
                transfiguration: "Kindled".into(),
            }
        );

        let mut chosen_pair = action(EffectKind::TransfigureSelected);
        chosen_pair
            .as_object_mut()
            .unwrap()
            .insert("count".into(), json!(2));
        assert!(
            action_from_compat(chosen_pair.clone())
                .unwrap_err()
                .to_string()
                .contains("requires predicate when count exceeds one")
        );
        chosen_pair
            .as_object_mut()
            .unwrap()
            .insert("predicate".into(), json!("event"));
        assert_eq!(
            action_from_compat(chosen_pair).unwrap().effect,
            ActionEffect::TransfigureSelected {
                predicate: Some(Predicate::Event),
                count: 2,
            }
        );

        for kind in [
            EffectKind::TransfigureRandomCards,
            EffectKind::TransfigureFixedRandomCards,
        ] {
            let mut missing_predicate = action(kind);
            missing_predicate
                .as_object_mut()
                .unwrap()
                .remove("predicate");
            assert!(
                action_from_compat(missing_predicate)
                    .unwrap_err()
                    .to_string()
                    .contains("requires string field predicate")
            );

            let mut explicit_metadata = action(kind);
            explicit_metadata.as_object_mut().unwrap().insert(
                "canonicalMechanicId".into(),
                json!("transfigure-deck-entry"),
            );
            explicit_metadata
                .as_object_mut()
                .unwrap()
                .insert("selectionPolicyId".into(), json!("uniform"));
            assert!(action_from_compat(explicit_metadata).is_ok());
        }

        let mut missing_transfiguration = action(EffectKind::TransfigureFixedRandomCards);
        missing_transfiguration
            .as_object_mut()
            .unwrap()
            .remove("transfiguration");
        assert!(
            action_from_compat(missing_transfiguration)
                .unwrap_err()
                .to_string()
                .contains("requires string field transfiguration")
        );
    }

    #[test]
    fn validates_multi_entry_deck_mutation_editor_contracts() {
        assert_eq!(
            action_from_compat(action(EffectKind::ReplaceSelected))
                .unwrap()
                .effect,
            ActionEffect::ReplaceSelected {
                predicate: Predicate::Event,
                count: None,
            }
        );
        assert_eq!(
            action_from_compat(action(EffectKind::TransfigureFixedSelected))
                .unwrap()
                .effect,
            ActionEffect::TransfigureFixedSelected {
                predicate: None,
                transfiguration: "DoubledSpark".into(),
                target: DeckTarget::Chosen,
                count: None,
            }
        );
        assert_eq!(
            action_from_compat(action(EffectKind::CopyRandomCards))
                .unwrap()
                .effect,
            ActionEffect::CopyRandomCards {
                predicate: Predicate::Event,
                count: 2,
            }
        );
        assert_eq!(
            action_from_compat(action(EffectKind::ChangeRandomCardType))
                .unwrap()
                .effect,
            ActionEffect::ChangeRandomCardType {
                count: 2,
                card_type: CardTypeTarget::Character,
            }
        );

        let mut replace_many = action(EffectKind::ReplaceSelected);
        replace_many
            .as_object_mut()
            .unwrap()
            .insert("count".into(), json!(2));
        assert_eq!(
            action_from_compat(replace_many).unwrap().effect,
            ActionEffect::ReplaceSelected {
                predicate: Predicate::Event,
                count: Some(2),
            }
        );

        let mut fixed_many = action(EffectKind::TransfigureFixedSelected);
        fixed_many.as_object_mut().unwrap().extend(Map::from_iter([
            ("predicate".into(), json!("event")),
            ("count".into(), json!(2)),
        ]));
        assert!(action_from_compat(fixed_many.clone()).is_ok());
        fixed_many
            .as_object_mut()
            .unwrap()
            .insert("deckTarget".into(), json!("offered"));
        assert!(
            action_from_compat(fixed_many)
                .unwrap_err()
                .to_string()
                .contains("requires a chosen target and predicate")
        );

        let mut fixed_without_predicate = action(EffectKind::TransfigureFixedSelected);
        fixed_without_predicate
            .as_object_mut()
            .unwrap()
            .insert("count".into(), json!(2));
        assert!(
            action_from_compat(fixed_without_predicate)
                .unwrap_err()
                .to_string()
                .contains("requires a chosen target and predicate")
        );

        for kind in [
            EffectKind::ReplaceSelected,
            EffectKind::TransfigureFixedSelected,
            EffectKind::CopyRandomCards,
            EffectKind::ChangeRandomCardType,
        ] {
            let mut nonpositive = action(kind);
            nonpositive
                .as_object_mut()
                .unwrap()
                .insert("count".into(), json!(0));
            assert!(
                action_from_compat(nonpositive)
                    .unwrap_err()
                    .to_string()
                    .contains("count must be positive")
            );
        }

        let mut unknown_type = action(EffectKind::ChangeRandomCardType);
        unknown_type
            .as_object_mut()
            .unwrap()
            .insert("cardType".into(), json!("Warrior"));
        assert!(
            action_from_compat(unknown_type)
                .unwrap_err()
                .to_string()
                .contains("unknown card type")
        );

        for (kind, mechanic) in [
            (EffectKind::CopyRandomCards, "duplicate-deck-entry"),
            (EffectKind::ChangeRandomCardType, "change-entry-card-type"),
        ] {
            let mut explicit_metadata = action(kind);
            explicit_metadata
                .as_object_mut()
                .unwrap()
                .insert("canonicalMechanicId".into(), json!(mechanic));
            explicit_metadata
                .as_object_mut()
                .unwrap()
                .insert("selectionPolicyId".into(), json!("uniform"));
            assert!(action_from_compat(explicit_metadata).is_ok());
        }
    }

    #[test]
    fn validates_wave7_editor_fields_metadata_and_foreign_field_rejection() {
        assert_eq!(
            action_from_compat(action(EffectKind::ReplaceRandomWithCard))
                .unwrap()
                .effect,
            ActionEffect::ReplaceRandomWithCard {
                predicate: Predicate::Legendary,
                card_id: "00000000-0000-4000-8000-000000000001".into(),
            }
        );
        assert_eq!(
            action_from_compat(action(EffectKind::ChangeCardTypeSelected))
                .unwrap()
                .effect,
            ActionEffect::ChangeCardTypeSelected {
                card_type: CardTypeTarget::Event,
                target: DeckTarget::Offered,
            }
        );

        for (kind, mechanic, policy) in [
            (
                EffectKind::ReplaceRandomWithCard,
                "replace-deck-entry",
                "uniform",
            ),
            (
                EffectKind::ChangeCardTypeSelected,
                "change-entry-card-type",
                "deck-entry-centrality",
            ),
        ] {
            let mut explicit_metadata = action(kind);
            explicit_metadata
                .as_object_mut()
                .unwrap()
                .insert("canonicalMechanicId".into(), json!(mechanic));
            explicit_metadata
                .as_object_mut()
                .unwrap()
                .insert("selectionPolicyId".into(), json!(policy));
            assert!(action_from_compat(explicit_metadata).is_ok());
        }

        for (kind, field, value) in [
            (EffectKind::ReplaceRandomWithCard, "count", json!(1)),
            (
                EffectKind::ChangeCardTypeSelected,
                "predicate",
                json!("legendary"),
            ),
            (
                EffectKind::ChangeCardTypeSelected,
                "cardId",
                json!("00000000-0000-4000-8000-000000000001"),
            ),
        ] {
            let mut invalid = action(kind);
            invalid.as_object_mut().unwrap().insert(field.into(), value);
            assert!(
                action_from_compat(invalid)
                    .unwrap_err()
                    .to_string()
                    .contains("does not apply")
            );
        }

        for (kind, field) in [
            (EffectKind::ReplaceRandomWithCard, "predicate"),
            (EffectKind::ReplaceRandomWithCard, "cardId"),
            (EffectKind::ChangeCardTypeSelected, "cardType"),
            (EffectKind::ChangeCardTypeSelected, "deckTarget"),
        ] {
            let mut invalid = action(kind);
            invalid.as_object_mut().unwrap().remove(field);
            assert!(action_from_compat(invalid).is_err());
        }
    }

    #[test]
    fn starter_card_effects_round_trip_through_source_patching() {
        for effect in [
            ActionEffect::PurgeStarterCard,
            ActionEffect::PurgeRandomStarterCard,
            ActionEffect::PurgeRandomStarterAndGainCard {
                predicate: Predicate::Character,
            },
            ActionEffect::ReplaceAllStarterCards {
                predicate: Predicate::Event,
            },
            ActionEffect::TransfigureRandomStarterCards { count: 2 },
            ActionEffect::TransfigureAllStarterCards,
        ] {
            let mut catalog: ExplorationCatalog = ron::from_str(EXPLORATION_SOURCE).unwrap();
            catalog[0].actions[0].effect = effect.clone();
            let patched =
                patch_exploration_action(EXPLORATION_SOURCE, &catalog[0].actions[0]).unwrap();
            let reparsed: ExplorationCatalog = ron::from_str(&patched).unwrap();
            assert_eq!(reparsed[0].actions[0].effect, effect);
        }
    }

    #[test]
    fn multi_card_transfigurations_round_trip_through_source_patching() {
        for effect in [
            ActionEffect::TransfigureSelected {
                predicate: Some(Predicate::Event),
                count: 2,
            },
            ActionEffect::TransfigureRandomCards {
                predicate: Predicate::Event,
                count: 2,
            },
            ActionEffect::TransfigureFixedRandomCards {
                predicate: Predicate::Event,
                count: 2,
                transfiguration: "Kindled".into(),
            },
        ] {
            let mut catalog: ExplorationCatalog = ron::from_str(EXPLORATION_SOURCE).unwrap();
            catalog[0].actions[0].effect = effect.clone();
            let patched =
                patch_exploration_action(EXPLORATION_SOURCE, &catalog[0].actions[0]).unwrap();
            let reparsed: ExplorationCatalog = ron::from_str(&patched).unwrap();
            assert_eq!(reparsed[0].actions[0].effect, effect);
        }
    }

    #[test]
    fn multi_entry_deck_mutations_round_trip_through_source_patching() {
        for effect in [
            ActionEffect::ReplaceSelected {
                predicate: Predicate::Event,
                count: Some(2),
            },
            ActionEffect::TransfigureFixedSelected {
                predicate: Some(Predicate::Event),
                transfiguration: "Kindled".into(),
                target: DeckTarget::Chosen,
                count: Some(2),
            },
            ActionEffect::CopyRandomCards {
                predicate: Predicate::Event,
                count: 2,
            },
            ActionEffect::ChangeRandomCardType {
                count: 2,
                card_type: CardTypeTarget::Event,
            },
        ] {
            let mut catalog: ExplorationCatalog = ron::from_str(EXPLORATION_SOURCE).unwrap();
            catalog[0].actions[0].effect = effect.clone();
            let patched =
                patch_exploration_action(EXPLORATION_SOURCE, &catalog[0].actions[0]).unwrap();
            let reparsed: ExplorationCatalog = ron::from_str(&patched).unwrap();
            assert_eq!(reparsed[0].actions[0].effect, effect);
        }
    }

    #[test]
    fn wave7_deck_mutations_round_trip_through_source_patching() {
        for effect in [
            ActionEffect::ReplaceRandomWithCard {
                predicate: Predicate::Legendary,
                card_id: "00000000-0000-4000-8000-000000000001".into(),
            },
            ActionEffect::ChangeCardTypeSelected {
                card_type: CardTypeTarget::Event,
                target: DeckTarget::Offered,
            },
            ActionEffect::ChangeCardTypeSelected {
                card_type: CardTypeTarget::Character,
                target: DeckTarget::Chosen,
            },
        ] {
            let mut catalog: ExplorationCatalog = ron::from_str(EXPLORATION_SOURCE).unwrap();
            catalog[0].actions[0].effect = effect.clone();
            let patched =
                patch_exploration_action(EXPLORATION_SOURCE, &catalog[0].actions[0]).unwrap();
            let reparsed: ExplorationCatalog = ron::from_str(&patched).unwrap();
            assert_eq!(reparsed[0].actions[0].effect, effect);
        }
    }

    #[test]
    fn fixed_site_effects_round_trip_without_rewriting_unrelated_source() {
        let original: ExplorationCatalog = ron::from_str(EXPLORATION_SOURCE).unwrap();
        let original_action = typed_record_range_at_indent(
            EXPLORATION_SOURCE,
            "ActionDefinition",
            "id",
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            6,
        )
        .unwrap();

        for site_type in [
            FixedSiteType::Duplication,
            FixedSiteType::Shop,
            FixedSiteType::DreamsignBazaar,
            FixedSiteType::Transfiguration,
            FixedSiteType::Purge,
        ] {
            let mut catalog = original.clone();
            let expected = ActionEffect::AddFixedSite { site_type };
            catalog[0].actions[0].effect = expected.clone();
            let patched =
                patch_exploration_action(EXPLORATION_SOURCE, &catalog[0].actions[0]).unwrap();
            let patched_action = typed_record_range_at_indent(
                &patched,
                "ActionDefinition",
                "id",
                "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                6,
            )
            .unwrap();

            assert_eq!(
                &EXPLORATION_SOURCE[..original_action.start],
                &patched[..patched_action.start]
            );
            assert_eq!(
                &EXPLORATION_SOURCE[original_action.end..],
                &patched[patched_action.end..]
            );
            let reparsed: ExplorationCatalog = ron::from_str(&patched).unwrap();
            assert_eq!(reparsed[0].actions[0].effect, expected);
            assert_eq!(reparsed[0].actions[1], original[0].actions[1]);
            assert_eq!(reparsed[1], original[1]);
        }
    }

    #[test]
    fn site_type_chooser_round_trips_without_rewriting_unrelated_source() {
        let original: ExplorationCatalog = ron::from_str(EXPLORATION_SOURCE).unwrap();
        let original_action = typed_record_range_at_indent(
            EXPLORATION_SOURCE,
            "ActionDefinition",
            "id",
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            6,
        )
        .unwrap();
        let mut catalog = original.clone();
        let expected = ActionEffect::ChooseSiteType { offer_count: 3 };
        catalog[0].actions[0].effect = expected.clone();
        let patched = patch_exploration_action(EXPLORATION_SOURCE, &catalog[0].actions[0]).unwrap();
        let patched_action = typed_record_range_at_indent(
            &patched,
            "ActionDefinition",
            "id",
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            6,
        )
        .unwrap();

        assert_eq!(
            &EXPLORATION_SOURCE[..original_action.start],
            &patched[..patched_action.start]
        );
        assert_eq!(
            &EXPLORATION_SOURCE[original_action.end..],
            &patched[patched_action.end..]
        );
        let reparsed: ExplorationCatalog = ron::from_str(&patched).unwrap();
        assert_eq!(reparsed[0].actions[0].effect, expected);
        assert_eq!(reparsed[0].actions[1], original[0].actions[1]);
        assert_eq!(reparsed[1], original[1]);
    }

    #[test]
    fn shop_purchase_modifiers_round_trip_without_rewriting_unrelated_source() {
        let original: ExplorationCatalog = ron::from_str(EXPLORATION_SOURCE).unwrap();
        let original_action = typed_record_range_at_indent(
            EXPLORATION_SOURCE,
            "ActionDefinition",
            "id",
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            6,
        )
        .unwrap();

        for effect in [
            ActionEffect::FreeNextShop,
            ActionEffect::LoseHalfEssenceAndFreePurchases { count: 3 },
        ] {
            let mut catalog = original.clone();
            catalog[0].actions[0].effect = effect.clone();
            let patched =
                patch_exploration_action(EXPLORATION_SOURCE, &catalog[0].actions[0]).unwrap();
            let patched_action = typed_record_range_at_indent(
                &patched,
                "ActionDefinition",
                "id",
                "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                6,
            )
            .unwrap();

            assert_eq!(
                &EXPLORATION_SOURCE[..original_action.start],
                &patched[..patched_action.start]
            );
            assert_eq!(
                &EXPLORATION_SOURCE[original_action.end..],
                &patched[patched_action.end..]
            );
            let reparsed: ExplorationCatalog = ron::from_str(&patched).unwrap();
            assert_eq!(reparsed[0].actions[0].effect, effect);
            assert_eq!(reparsed[0].actions[1], original[0].actions[1]);
            assert_eq!(reparsed[1], original[1]);
        }
    }

    #[test]
    fn validates_essence_effect_editor_fields() {
        let mut fixed = action(EffectKind::GainEssence);
        fixed
            .as_object_mut()
            .unwrap()
            .insert("essence".into(), json!(0));
        assert!(
            action_from_compat(fixed)
                .unwrap_err()
                .to_string()
                .contains("essence must be positive")
        );

        let mut reversed = action(EffectKind::GainRandomEssence);
        reversed
            .as_object_mut()
            .unwrap()
            .insert("minimumEssence".into(), json!(151));
        assert!(
            action_from_compat(reversed)
                .unwrap_err()
                .to_string()
                .contains("minimumEssence must not exceed maximumEssence")
        );

        let mut maximum_zero = action(EffectKind::GainRandomEssence);
        maximum_zero
            .as_object_mut()
            .unwrap()
            .insert("maximumEssence".into(), json!(0));
        assert!(
            action_from_compat(maximum_zero)
                .unwrap_err()
                .to_string()
                .contains("maximumEssence must be positive")
        );

        let mut fieldful_double = action(EffectKind::DoubleEssence);
        fieldful_double
            .as_object_mut()
            .unwrap()
            .insert("essence".into(), json!(1));
        assert!(
            action_from_compat(fieldful_double)
                .unwrap_err()
                .to_string()
                .contains("does not apply")
        );
    }

    #[test]
    fn validates_explicit_dreamsign_effect_editor_fields() {
        for kind in [
            EffectKind::GainOfferedDreamsign,
            EffectKind::ReplaceSelectedDreamsignWithOffered,
        ] {
            let mut invalid = action(kind);
            invalid
                .as_object_mut()
                .unwrap()
                .insert("offerCount".into(), json!(0));
            assert!(
                action_from_compat(invalid)
                    .unwrap_err()
                    .to_string()
                    .contains("offerCount must be positive")
            );
        }

        let mut invalid_count = action(EffectKind::PurgeSelectedDreamsignAndGainRandom);
        invalid_count
            .as_object_mut()
            .unwrap()
            .insert("count".into(), json!(0));
        assert!(
            action_from_compat(invalid_count)
                .unwrap_err()
                .to_string()
                .contains("count must be positive")
        );

        let mut foreign = action(EffectKind::ReplaceAllDreamsignsRandom);
        foreign
            .as_object_mut()
            .unwrap()
            .insert("offerCount".into(), json!(3));
        assert!(
            action_from_compat(foreign)
                .unwrap_err()
                .to_string()
                .contains("does not apply")
        );
    }

    #[test]
    fn validates_nightmare_dreamsign_editor_fields_and_derived_contracts() {
        let fixed = action_from_compat(action(EffectKind::GainNightmareAndDreamsign)).unwrap();
        assert_eq!(
            fixed.effect,
            ActionEffect::GainNightmareAndDreamsign {
                dreamsign_id: "00000000-0000-4000-8000-000000000002".into(),
                nightmare_count: 1,
            }
        );

        let offered =
            action_from_compat(action(EffectKind::GainNightmareAndOfferedDreamsign)).unwrap();
        assert_eq!(
            offered.effect,
            ActionEffect::GainNightmareAndOfferedDreamsign {
                offer_count: 3,
                nightmare_count: 1,
            }
        );

        for (kind, field) in [
            (EffectKind::GainNightmareAndDreamsign, "nightmareCount"),
            (EffectKind::GainNightmareAndOfferedDreamsign, "offerCount"),
            (
                EffectKind::GainNightmareAndOfferedDreamsign,
                "nightmareCount",
            ),
        ] {
            let mut invalid = action(kind);
            invalid
                .as_object_mut()
                .unwrap()
                .insert(field.into(), json!(0));
            assert!(
                action_from_compat(invalid)
                    .unwrap_err()
                    .to_string()
                    .contains("must be positive")
            );
        }

        let mut foreign_fixed = action(EffectKind::GainNightmareAndDreamsign);
        foreign_fixed
            .as_object_mut()
            .unwrap()
            .insert("offerCount".into(), json!(3));
        assert!(
            action_from_compat(foreign_fixed)
                .unwrap_err()
                .to_string()
                .contains("does not apply")
        );

        let mut foreign_offered = action(EffectKind::GainNightmareAndOfferedDreamsign);
        foreign_offered.as_object_mut().unwrap().insert(
            "dreamsignId".into(),
            json!("00000000-0000-4000-8000-000000000002"),
        );
        assert!(
            action_from_compat(foreign_offered)
                .unwrap_err()
                .to_string()
                .contains("does not apply")
        );

        let mut malformed_reference = action(EffectKind::GainNightmareAndDreamsign);
        malformed_reference
            .as_object_mut()
            .unwrap()
            .insert("dreamsignId".into(), json!("not-a-uuid"));
        assert!(
            action_from_compat(malformed_reference)
                .unwrap_err()
                .to_string()
                .contains("canonical UUIDv4")
        );
    }

    #[test]
    fn validates_fixed_exploration_dreamsign_references_against_the_catalog() {
        let known_id = parse_dreamsign_reference("00000000-0000-4000-8000-000000000002").unwrap();
        let known = BTreeSet::from([known_id]);
        let mut catalog: ExplorationCatalog = ron::from_str(EXPLORATION_SOURCE).unwrap();

        catalog[0].actions[0].effect = ActionEffect::GainNightmareAndDreamsign {
            dreamsign_id: "00000000-0000-4000-8000-000000000002".into(),
            nightmare_count: 1,
        };
        validate_exploration_dreamsign_references(&catalog, &known).unwrap();

        catalog[0].actions[0].effect = ActionEffect::GainDreamsign {
            dreamsign_id: "00000000-0000-4000-8000-000000000099".into(),
        };
        assert!(
            validate_exploration_dreamsign_references(&catalog, &known)
                .unwrap_err()
                .to_string()
                .contains("unknown Dreamsign UUID")
        );

        catalog[0].actions[0].effect = ActionEffect::GainNightmareAndDreamsign {
            dreamsign_id: "not-a-uuid".into(),
            nightmare_count: 1,
        };
        assert!(
            validate_exploration_dreamsign_references(&catalog, &known)
                .unwrap_err()
                .to_string()
                .contains("canonical UUIDv4")
        );
    }

    #[test]
    fn rejects_exploration_derived_field_overrides() {
        let mut invalid = action(EffectKind::GainDreamsign);
        invalid
            .as_object_mut()
            .unwrap()
            .insert("selectionPolicyId".into(), json!("uniform"));
        assert!(
            action_from_compat(invalid)
                .unwrap_err()
                .to_string()
                .contains("FIELD_NOT_APPLICABLE")
        );
    }

    #[test]
    fn exploration_presentation_edit_preserves_unrelated_source() {
        let mut catalog: ExplorationCatalog = ron::from_str(EXPLORATION_SOURCE).unwrap();
        catalog[0].actions[0].presentation.effect_text = "Edited effect".into();
        let patched = patch_exploration_action(EXPLORATION_SOURCE, &catalog[0].actions[0]).unwrap();

        assert!(patched.starts_with("// Stable Exploration guidance."));
        assert!(patched.contains("// Edited action comment."));
        let unrelated = EXPLORATION_SOURCE
            .find("  /* Unrelated encounter comment. */")
            .unwrap();
        let patched_unrelated = patched
            .find("  /* Unrelated encounter comment. */")
            .unwrap();
        assert_eq!(
            &EXPLORATION_SOURCE[unrelated..],
            &patched[patched_unrelated..]
        );
        let reparsed: ExplorationCatalog = ron::from_str(&patched).unwrap();
        assert_eq!(reparsed, catalog);
    }

    #[test]
    fn exploration_effect_edit_preserves_implicit_some_notation() {
        let mut catalog: ExplorationCatalog = ron::from_str(EXPLORATION_SOURCE).unwrap();
        catalog[0].actions[0].effect = ActionEffect::PurgeSelected {
            predicate: Some(Predicate::Event),
            count: Some(2),
        };
        let patched = patch_exploration_action(EXPLORATION_SOURCE, &catalog[0].actions[0]).unwrap();

        assert!(patched.contains("effect: PurgeSelected("));
        assert!(patched.contains("predicate: Event"));
        assert!(patched.contains("count: 2"));
        assert!(!patched.contains("Some("));
        assert_eq!(
            ron::from_str::<ExplorationCatalog>(&patched).unwrap(),
            catalog
        );
    }

    #[test]
    fn exploration_editor_serializes_fieldless_double_essence() {
        let mut catalog: ExplorationCatalog = ron::from_str(EXPLORATION_SOURCE).unwrap();
        catalog[0].actions[0].effect = ActionEffect::DoubleEssence;
        let patched = patch_exploration_action(EXPLORATION_SOURCE, &catalog[0].actions[0]).unwrap();

        assert!(patched.contains("effect: DoubleEssence,"));
        assert_eq!(
            ron::from_str::<ExplorationCatalog>(&patched).unwrap(),
            catalog
        );
    }

    #[test]
    fn exploration_editor_serializes_fieldless_dreamsign_replacement_as_a_unit_variant() {
        let mut catalog: ExplorationCatalog = ron::from_str(EXPLORATION_SOURCE).unwrap();
        catalog[0].actions[0].effect = ActionEffect::ReplaceAllDreamsignsRandom;
        let patched = patch_exploration_action(EXPLORATION_SOURCE, &catalog[0].actions[0]).unwrap();

        assert!(patched.contains("effect: ReplaceAllDreamsignsRandom,"));
        assert!(!patched.contains("ReplaceAllDreamsignsRandom("));
        assert_eq!(
            ron::from_str::<ExplorationCatalog>(&patched).unwrap(),
            catalog
        );
    }

    #[test]
    fn exploration_editor_serializes_nightmare_dreamsign_variants_exactly() {
        let mut catalog: ExplorationCatalog = ron::from_str(EXPLORATION_SOURCE).unwrap();
        catalog[0].actions[0].effect = ActionEffect::GainNightmareAndDreamsign {
            dreamsign_id: "00000000-0000-4000-8000-000000000002".into(),
            nightmare_count: 2,
        };
        let fixed = patch_exploration_action(EXPLORATION_SOURCE, &catalog[0].actions[0]).unwrap();
        assert!(fixed.contains("effect: GainNightmareAndDreamsign("));
        assert!(fixed.contains("dreamsign_id: \"00000000-0000-4000-8000-000000000002\""));
        assert!(fixed.contains("nightmare_count: 2"));
        assert_eq!(
            ron::from_str::<ExplorationCatalog>(&fixed).unwrap(),
            catalog
        );

        catalog[0].actions[0].effect = ActionEffect::GainNightmareAndOfferedDreamsign {
            offer_count: 3,
            nightmare_count: 1,
        };
        let offered = patch_exploration_action(EXPLORATION_SOURCE, &catalog[0].actions[0]).unwrap();
        assert!(offered.contains("effect: GainNightmareAndOfferedDreamsign("));
        assert!(offered.contains("offer_count: 3"));
        assert!(offered.contains("nightmare_count: 1"));
        assert_eq!(
            ron::from_str::<ExplorationCatalog>(&offered).unwrap(),
            catalog
        );
    }

    #[test]
    fn editor_serializer_omits_generated_array_indices() {
        let text = serialize_ron(&vec!["first", "second"], false).unwrap();
        assert!(!text.contains("/*["));
    }

    #[test]
    fn exploration_prose_edit_changes_only_the_scalar() {
        let patched = patch_exploration_prose(
            EXPLORATION_SOURCE,
            "00000000-0000-4000-8000-000000000031",
            "Edited scene",
        )
        .unwrap();
        let changed_lines = EXPLORATION_SOURCE
            .lines()
            .zip(patched.lines())
            .filter(|(before, after)| before != after)
            .collect::<Vec<_>>();
        assert_eq!(changed_lines.len(), 1);
        assert!(patched.contains("/* Unrelated encounter comment. */"));
    }

    #[test]
    fn card_ability_text_edit_changes_exactly_one_source_line() {
        let mut cards: Vec<CardDefinition> = ron::from_str(CARD_SOURCE).unwrap();
        let index = unique_card_index(&cards, CARD_ID).unwrap();
        set_card_field(
            &mut cards[index],
            "rendered-text",
            json!(
                "Offering, Veil\n\n    tags: [\"inside rules\"],\n▸Materialized: Dissolve an enemy."
            ),
        )
        .unwrap();

        let patched = patch_card_source_field(CARD_SOURCE, &cards[index], "rendered-text").unwrap();
        let changed_lines = CARD_SOURCE
            .lines()
            .zip(patched.lines())
            .filter(|(before, after)| before != after)
            .collect::<Vec<_>>();

        assert_eq!(CARD_SOURCE.lines().count(), patched.lines().count());
        assert_eq!(
            changed_lines,
            vec![(
                "    ability_text: [\"Offering\", \"    tags: [\\\"inside rules\\\"],\\n▸Materialized: Dissolve an enemy.\"],",
                "    ability_text: [\"Offering, Veil\", \"    tags: [\\\"inside rules\\\"],\\n▸Materialized: Dissolve an enemy.\"],"
            )]
        );
        assert!(patched.starts_with("// Stable catalog guidance.\n"));
        assert_eq!(
            ron::from_str::<Vec<CardDefinition>>(&patched).unwrap(),
            cards
        );
    }

    #[test]
    fn card_amplified_text_edit_inserts_and_updates_one_source_field() {
        let mut cards: Vec<CardDefinition> = ron::from_str(CARD_SOURCE).unwrap();
        let index = unique_card_index(&cards, CARD_ID).unwrap();
        set_card_field(
            &mut cards[index],
            "amplified-text",
            json!("Offering\n\n▸Materialized: Dissolve up to two enemies."),
        )
        .unwrap();

        let inserted =
            patch_card_source_field(CARD_SOURCE, &cards[index], "amplified-text").unwrap();
        assert!(inserted.contains(
            "amplified_text: [\"Offering\", \"▸Materialized: Dissolve up to two enemies.\"],"
        ));
        assert_eq!(
            ron::from_str::<Vec<CardDefinition>>(&inserted).unwrap(),
            cards
        );

        set_card_field(
            &mut cards[index],
            "amplified-text",
            json!("Offering\n\n▸Materialized: Dissolve an enemy. Gain 1⍟."),
        )
        .unwrap();
        let updated = patch_card_source_field(&inserted, &cards[index], "amplified-text").unwrap();
        assert_eq!(updated.matches("amplified_text:").count(), 1);
        assert_eq!(
            ron::from_str::<Vec<CardDefinition>>(&updated).unwrap(),
            cards
        );

        set_card_field(&mut cards[index], "amplified-text", json!("")).unwrap();
        let removed = patch_card_source_field(&updated, &cards[index], "amplified-text").unwrap();
        assert!(!removed.contains("amplified_text:"));
        assert_eq!(
            ron::from_str::<Vec<CardDefinition>>(&removed).unwrap(),
            cards
        );
    }

    #[test]
    fn card_source_patch_round_trips_every_editable_shape() {
        let edits = [
            ("name", json!("Quoted \"Name\"")),
            ("energy-cost", json!("3,X")),
            ("card-type", json!("Event")),
            ("subtype", json!("Guide")),
            ("spark", json!("X")),
            ("image-number", json!(42)),
            ("art", json!({ "x": -0.25, "y": 1.0, "scale": 1.5 })),
        ];

        for (field, value) in edits {
            let mut cards: Vec<CardDefinition> = ron::from_str(CARD_SOURCE).unwrap();
            let index = unique_card_index(&cards, CARD_ID).unwrap();
            set_card_field(&mut cards[index], field, value).unwrap();
            let patched = patch_card_source_field(CARD_SOURCE, &cards[index], field).unwrap();

            assert!(
                patched.starts_with("// Stable catalog guidance.\n"),
                "{field}"
            );
            assert!(patched.contains("name: \"Unrelated Card\""), "{field}");
            assert_eq!(
                ron::from_str::<Vec<CardDefinition>>(&patched).unwrap(),
                cards,
                "{field}"
            );
        }
    }

    #[test]
    fn card_edit_variants_enforce_applicability() {
        let mut event = CardDefinition {
            name: "Fixture".into(),
            id: "00000000-0000-4000-8000-000000000001".into(),
            ability_text: Vec::new(),
            amplified_text: None,
            energy_cost: OrbValue::Fixed(1),
            kind: CardKind::Event,
            speed: crate::models::cards::Speed::Normal,
            rarity: None,
            roles: Vec::new(),
            art: crate::models::cards::Art {
                image: 1,
                owned: false,
                crop: None,
            },
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

    #[test]
    fn card_tag_scalar_edit_changes_one_line_and_preserves_unrelated_source() {
        let mut catalog: CardMetadataCatalog = ron::from_str(CARD_METADATA_SOURCE).unwrap();
        let index = unique_card_metadata_index(&catalog, CARD_ID).unwrap();
        set_card_metadata_tags(&mut catalog.cards[index], json!(["Art Rework", "Art OK"])).unwrap();
        let patched =
            patch_card_metadata_tags(CARD_METADATA_SOURCE, &catalog.cards[index]).unwrap();

        assert_eq!(
            CARD_METADATA_SOURCE
                .lines()
                .zip(patched.lines())
                .filter(|(before, after)| before != after)
                .count(),
            1
        );
        assert!(patched.contains("mtg_origin: r#\"Solitude\"#"));
        assert!(patched.contains("/* Unrelated record comment. */"));
        assert!(patched.contains("// Preserve the unrelated facet comment."));
        assert_eq!(
            ron::from_str::<CardMetadataCatalog>(&patched).unwrap(),
            catalog
        );
    }

    #[test]
    fn card_metadata_editor_round_trips_optional_tags_and_facet_operations() {
        let mut source = CARD_METADATA_SOURCE.to_owned();
        let mut catalog: CardMetadataCatalog = ron::from_str(&source).unwrap();

        let unrelated =
            unique_card_metadata_index(&catalog, "00000000-0000-4000-8000-000000000002").unwrap();
        set_card_metadata_tags(&mut catalog.cards[unrelated], json!(["Art OK"])).unwrap();
        source = patch_card_metadata_tags(&source, &catalog.cards[unrelated]).unwrap();
        assert!(source.contains("mtg_origin: \"Fixture\",\n      tags: [\"Art OK\"],"));

        let edited = unique_card_metadata_index(&catalog, CARD_ID).unwrap();
        set_card_metadata_tags(&mut catalog.cards[edited], json!([])).unwrap();
        source = patch_card_metadata_tags(&source, &catalog.cards[edited]).unwrap();
        assert_eq!(source.matches("tags:").count(), 1);

        let existed =
            upsert_facet(&mut catalog, Facet::Tags, "Art OK".into(), "#166534".into()).unwrap();
        let updated = facet_entries(&catalog, Facet::Tags)
            .iter()
            .find(|entry| entry.name == "Art OK")
            .unwrap();
        source = patch_card_metadata_facet(&source, Facet::Tags, updated, existed).unwrap();

        let existed =
            upsert_facet(&mut catalog, Facet::Tides, "Flow".into(), "#7c3aed".into()).unwrap();
        let inserted = facet_entries(&catalog, Facet::Tides)
            .iter()
            .find(|entry| entry.name == "Flow")
            .unwrap();
        source = patch_card_metadata_facet(&source, Facet::Tides, inserted, existed).unwrap();

        delete_facet(&mut catalog, Facet::Tags, "Art Rework").unwrap();
        source = delete_card_metadata_facet(&source, Facet::Tags, "Art Rework").unwrap();

        internal_card_metadata::validate(&catalog).unwrap();
        assert!(source.contains("FacetDefinition(name: \"Flow\", color: \"#7c3aed\")"));
        assert!(source.contains("// Preserve the unrelated facet comment."));
        assert_eq!(
            ron::from_str::<CardMetadataCatalog>(&source).unwrap(),
            catalog
        );
    }

    #[test]
    fn card_metadata_editor_rejects_invalid_identity_values_and_semantic_no_ops() {
        let mut catalog: CardMetadataCatalog = ron::from_str(CARD_METADATA_SOURCE).unwrap();
        assert!(unique_card_metadata_index(&catalog, "not-a-uuid").is_err());
        let index = unique_card_metadata_index(&catalog, CARD_ID).unwrap();
        assert!(set_card_metadata_tags(&mut catalog.cards[index], json!([17])).is_err());
        assert!(validate_facet("", "#123456").is_err());
        assert!(validate_facet("valid", "blue").is_err());
        assert!(delete_facet(&mut catalog, Facet::Tags, "missing").is_err());

        let before = catalog.clone();
        let existed =
            upsert_facet(&mut catalog, Facet::Tags, "Art OK".into(), "#15803d".into()).unwrap();
        assert!(existed);
        assert_eq!(catalog, before);
    }
    const TUTORIAL_EDITOR_SOURCE: &str = r###"// Preserve catalog guidance.
#![enable(implicit_some)]
TutorialCatalog(
  default_maximum_width_pixels: 700,
  scripted_tutorial_sequence: [
    TutorialActionDefinition(
      id: "11111111-1111-4111-8111-111111111111",
      wait_seconds: 1,
      behavior: DisplaySpeechBubble(
        speech_bubble: TutorialSpeechBubble(
          duration_seconds: 3,
          text: r#"Raw tutorial text"#,
        ),
      ),
    ),

    /* Preserve the unrelated action comment. */
    TutorialActionDefinition(
      id: "22222222-2222-4222-8222-222222222222",
      wait_seconds: 0,
      behavior: DrawOpponentCard(
        card_id: "33333333-3333-4333-8333-333333333333",
      ),
    ),
  ],
)
"###;

    fn tutorial_fixture_actions() -> Vec<TutorialActionDefinition> {
        let mut actions = tutorial::actions_from_compatibility_json(json!([
          {
            "id": "11111111-1111-4111-8111-111111111111",
            "action": "display-speech-bubble",
            "speechBubble": {
              "speaker": "mira",
              "duration": 3,
              "horizontalOffset": 0,
              "verticalOffset": 0,
              "bubbleWidth": 700,
              "text": "Raw tutorial text"
            },
            "wait": 1
          },
          {
            "id": "22222222-2222-4222-8222-222222222222",
            "action": "draw-opponent-card",
            "cardId": "33333333-3333-4333-8333-333333333333",
            "wait": 0
          }
        ]))
        .unwrap();
        tutorial::preserve_default_bubble_width_omissions(
            &parse_tutorial_actions(TUTORIAL_EDITOR_SOURCE),
            &mut actions,
            700,
        );
        actions
    }

    fn parse_tutorial_actions(source: &str) -> Vec<TutorialActionDefinition> {
        let catalog = tutorial_catalog_range(source).unwrap();
        let actions = top_level_field_value_range(source, catalog, "scripted_tutorial_sequence")
            .unwrap()
            .unwrap();
        ron::from_str(&format!("#![enable(implicit_some)]\n{}", &source[actions])).unwrap()
    }

    #[test]
    fn tutorial_scalar_patch_changes_one_line_and_preserves_unrelated_source() {
        let before = tutorial_fixture_actions();
        let mut after = before.clone();
        after[0].wait_seconds = tutorial::Scalar::Integer(2);
        let patched = patch_tutorial_actions(TUTORIAL_EDITOR_SOURCE, &before, &after).unwrap();
        let changed_lines = TUTORIAL_EDITOR_SOURCE
            .lines()
            .zip(patched.lines())
            .filter(|(left, right)| left != right)
            .count();
        assert_eq!(changed_lines, 1);
        assert!(patched.starts_with("// Preserve catalog guidance.\n"));
        assert!(patched.contains("/* Preserve the unrelated action comment. */"));
        assert!(patched.contains("text: r#\"Raw tutorial text\"#"));
        assert!(!patched.contains("\n          maximum_width_pixels:"));
        assert_eq!(parse_tutorial_actions(&patched), after);
    }

    #[test]
    fn tutorial_behavior_and_structural_edits_round_trip_typed_actions() {
        let before = tutorial_fixture_actions();
        let mut behavior_edit = before.clone();
        behavior_edit[0].behavior = tutorial::TutorialAction::EndTurn {
            speech_bubble: None,
        };
        let patched =
            patch_tutorial_actions(TUTORIAL_EDITOR_SOURCE, &before, &behavior_edit).unwrap();
        assert_eq!(parse_tutorial_actions(&patched), behavior_edit);
        assert!(patched.contains("/* Preserve the unrelated action comment. */"));

        let reordered = before.iter().cloned().rev().collect::<Vec<_>>();
        let reordered_source =
            patch_tutorial_actions(TUTORIAL_EDITOR_SOURCE, &before, &reordered).unwrap();
        assert_eq!(parse_tutorial_actions(&reordered_source), reordered);
        assert!(reordered_source.starts_with("// Preserve catalog guidance.\n"));

        let inserted = before[..1].to_vec();
        let inserted_source =
            patch_tutorial_actions(TUTORIAL_EDITOR_SOURCE, &before, &inserted).unwrap();
        assert_eq!(parse_tutorial_actions(&inserted_source), inserted);
        assert_eq!(
            patch_tutorial_actions(TUTORIAL_EDITOR_SOURCE, &before, &before).unwrap(),
            TUTORIAL_EDITOR_SOURCE
        );
    }

    #[test]
    fn tutorial_editor_rejects_non_uuid_new_identity() {
        assert!(
            tutorial::actions_from_compatibility_json(json!([{
              "id": "new-action",
              "action": "end-turn",
              "wait": 0
            }]))
            .is_err()
        );
    }
    const AFFILIATION_SOURCE: &str = r###"// Catalog guidance stays byte-stable; AffiliationCatalog(fake: true).
#![enable(implicit_some)]
AffiliationCatalog(
  default_random_draw_max_multiplier: 1.25,
  default_opponent_deck_max_multiplier: 3.5,
  affiliations: [
    AffiliationDefinition (
      // AffiliationDefinition(id: "comment-only")
      id : "00000000-0000-4000-8000-000000000031",
      name: r#"First Affiliation"#,
      atlas_card_theme: "Dawn",
      signature_card_ids: ["00000000-0000-4000-8000-000000000101"],
    ),
    // Unrelated record comment.
    AffiliationDefinition(
      id: "00000000-0000-4000-8000-000000000032",
      name: "Unrelated",
      atlas_card_theme: "Dusk",
      signature_card_ids: ["00000000-0000-4000-8000-000000000102"],
    ),
  ],
)
"###;

    #[test]
    fn affiliation_scalar_edits_change_only_the_target_values() {
        let mut catalog: AffiliationCatalog = ron::from_str(AFFILIATION_SOURCE).unwrap();
        catalog.default_random_draw_max_multiplier = 2.0;
        let global = patch_affiliation_catalog_field(
            AFFILIATION_SOURCE,
            &catalog,
            "default_random_draw_max_multiplier",
        )
        .unwrap();
        assert!(global.contains("default_random_draw_max_multiplier: 2.0,"));
        assert!(global.contains("// Unrelated record comment."));

        catalog.affiliations[0].name = "Renamed".into();
        let patched = patch_affiliation_field(&global, &catalog.affiliations[0], "name").unwrap();
        assert!(patched.contains("name: \"Renamed\","));
        assert!(patched.contains("name: \"Unrelated\","));
        verify_round_trip::<AffiliationCatalog>(&patched, &catalog).unwrap();
    }

    #[test]
    fn affiliation_signature_replacement_preserves_order_and_unrelated_source() {
        let mut catalog: AffiliationCatalog = ron::from_str(AFFILIATION_SOURCE).unwrap();
        catalog.affiliations[0].signature_card_ids = vec![
            CanonicalUuid::parse("00000000-0000-4000-8000-000000000102").unwrap(),
            CanonicalUuid::parse("00000000-0000-4000-8000-000000000101").unwrap(),
        ];
        let patched = patch_affiliation_field(
            AFFILIATION_SOURCE,
            &catalog.affiliations[0],
            "signature_card_ids",
        )
        .unwrap();
        assert!(patched.contains(
            "[\"00000000-0000-4000-8000-000000000102\",\"00000000-0000-4000-8000-000000000101\"]"
        ));
        assert!(patched.contains("// Unrelated record comment."));
        verify_round_trip::<AffiliationCatalog>(&patched, &catalog).unwrap();
        catalog.affiliations[0].signature_card_ids.clear();
        assert!(
            affiliations::validate(&catalog)
                .unwrap_err()
                .to_string()
                .contains("no signature cards")
        );
    }
}
