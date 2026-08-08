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
use crate::models::cards::{CardDefinition, CardKind, Crop, OrbValue};
use crate::models::compat::CompatDocument;
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
    SetDreamAvatarField {
        avatar_id: String,
        field: String,
        value: JsonValue,
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
        "dream-avatars" => edit_dream_avatars(manifest, staging_root, request.operations),
        "dream-guides" => edit_dream_guides(manifest, staging_root, request.operations),
        "dreamscapes" => edit_dreamscapes(manifest, staging_root, request.operations),
        "dreamsigns" => edit_dreamsigns(manifest, staging_root, request.operations),
        "exploration" => edit_exploration(manifest, staging_root, request.operations),
        dataset => edit_compat(manifest, staging_root, dataset, request.operations),
    }
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
    let mut cards_text = original_text;
    let metadata_path = staging_root.join(&manifest.dataset("internal-card-metadata")?.source);
    let original_metadata_text = fs::read_to_string(&metadata_path).with_context(|| {
        format!(
            "read staged card metadata source {}",
            metadata_path.display()
        )
    })?;
    let mut metadata: CompatDocument = ron::from_str(&original_metadata_text)
        .context("MALFORMED_SOURCE: staged internal card metadata RON is invalid")?;
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
                    let before = metadata.clone();
                    set_card_metadata_tags(&mut metadata, &card_id, value)?;
                    if metadata != before {
                        metadata_text =
                            patch_card_metadata_record(&metadata_text, &metadata, &card_id)?;
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
                upsert_facet(&mut metadata, facet, name, color)?;
            }
            EditOperation::DeleteFacet { facet, name } => {
                delete_facet(&mut metadata, facet, &name)?;
                if matches!(facet, Facet::Tags) {
                    for card_id in remove_tag_from_card_metadata(&mut metadata, &name)? {
                        metadata_text =
                            patch_card_metadata_record(&metadata_text, &metadata, &card_id)?;
                    }
                }
            }
            _ => bail!("FIELD_NOT_APPLICABLE: operation does not apply to Cards"),
        }
    }
    reject_duplicate_cards(&cards)?;

    verify_round_trip::<Vec<CardDefinition>>(&cards_text, &cards)?;
    let serialized_metadata = serialize_ron(&metadata, false)?;
    let metadata_text = preserve_card_metadata_source(&serialized_metadata, &metadata_text)?;
    verify_round_trip::<CompatDocument>(&metadata_text, &metadata)?;
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
    let identity_literal = ron::to_string(identity)?;
    let marker = format!("\n    {identity_field}: {identity_literal},");
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
    let record_marker = format!("\n  {record_type}(");
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

fn card_metadata_table_mut(
    document: &mut CompatDocument,
) -> Result<&mut toml::map::Map<String, toml::Value>> {
    document
        .data
        .as_table_mut()
        .and_then(|data| data.get_mut("cards"))
        .and_then(toml::Value::as_table_mut)
        .context("MALFORMED_SOURCE: internal card metadata must contain a cards table")
}

fn card_metadata_record_mut<'a>(
    document: &'a mut CompatDocument,
    card_id: &str,
) -> Result<&'a mut toml::map::Map<String, toml::Value>> {
    card_metadata_table_mut(document)?
        .get_mut(card_id)
        .and_then(toml::Value::as_table_mut)
        .with_context(|| format!("RECORD_NOT_FOUND: internal metadata for card UUID {card_id}"))
}

fn card_metadata_record<'a>(
    document: &'a CompatDocument,
    card_id: &str,
) -> Result<&'a toml::map::Map<String, toml::Value>> {
    document
        .data
        .as_table()
        .and_then(|data| data.get("cards"))
        .and_then(toml::Value::as_table)
        .and_then(|cards| cards.get(card_id))
        .and_then(toml::Value::as_table)
        .with_context(|| format!("RECORD_NOT_FOUND: internal metadata for card UUID {card_id}"))
}

fn set_card_metadata_tags(
    document: &mut CompatDocument,
    card_id: &str,
    value: JsonValue,
) -> Result<()> {
    let values = value
        .as_array()
        .context("INVALID_EDIT: tags must be an array")?;
    let tags = values
        .iter()
        .map(|entry| {
            entry
                .as_str()
                .map(|tag| toml::Value::String(tag.to_owned()))
                .context("INVALID_EDIT: every tag must be a string")
        })
        .collect::<Result<Vec<_>>>()?;
    card_metadata_record_mut(document, card_id)?.insert("tags".into(), tags.into());
    Ok(())
}

fn remove_tag_from_card_metadata(document: &mut CompatDocument, name: &str) -> Result<Vec<String>> {
    let mut changed = Vec::new();
    for (card_id, value) in card_metadata_table_mut(document)? {
        let record = value.as_table_mut().with_context(|| {
            format!("MALFORMED_SOURCE: internal metadata for card UUID {card_id} must be a record")
        })?;
        if let Some(tags) = record.get_mut("tags") {
            let tags = tags.as_array_mut().with_context(|| {
                format!("MALFORMED_SOURCE: tags for card UUID {card_id} must be an array")
            })?;
            let before = tags.len();
            tags.retain(|tag| tag.as_str() != Some(name));
            if tags.len() != before {
                changed.push(card_id.clone());
            }
        }
    }
    Ok(changed)
}

fn card_metadata_value_range(source: &str, card_id: &str) -> Result<Range<usize>> {
    let id_literal = ron::to_string(card_id)?;
    let marker = format!("{id_literal}:");
    let matches = source
        .match_indices(&marker)
        .map(|(offset, _)| offset)
        .collect::<Vec<_>>();
    if matches.is_empty() {
        bail!("RECORD_NOT_FOUND: internal metadata for card UUID {card_id}");
    }
    if matches.len() > 1 {
        bail!("MALFORMED_SOURCE: duplicate internal metadata for card UUID {card_id}");
    }
    let mut start = matches[0] + marker.len();
    let bytes = source.as_bytes();
    while start < bytes.len() && bytes[start].is_ascii_whitespace() {
        start += 1;
    }
    Ok(start..top_level_value_end(source, start, source.len())?)
}

fn patch_card_metadata_record(
    source: &str,
    metadata: &CompatDocument,
    card_id: &str,
) -> Result<String> {
    let range = card_metadata_value_range(source, card_id)?;
    let replacement = ron::to_string(&toml::Value::Table(
        card_metadata_record(metadata, card_id)?.clone(),
    ))?;
    Ok(format!(
        "{}{}{}",
        &source[..range.start],
        replacement,
        &source[range.end..]
    ))
}

fn card_metadata_map_value_range(source: &str) -> Result<Range<usize>> {
    let marker = "\"cards\":";
    let matches = source
        .match_indices(marker)
        .map(|(offset, _)| offset)
        .collect::<Vec<_>>();
    if matches.len() != 1 {
        bail!("MALFORMED_SOURCE: internal card metadata must contain one cards table");
    }
    let mut start = matches[0] + marker.len();
    let bytes = source.as_bytes();
    while start < bytes.len() && bytes[start].is_ascii_whitespace() {
        start += 1;
    }
    Ok(start..top_level_value_end(source, start, source.len())?)
}

fn preserve_card_metadata_source(serialized: &str, source: &str) -> Result<String> {
    let serialized_range = card_metadata_map_value_range(serialized)
        .context("serialized internal card metadata is missing its cards table")?;
    let source_range = card_metadata_map_value_range(source)
        .context("source internal card metadata is missing its cards table")?;
    Ok(format!(
        "{}{}{}",
        &serialized[..serialized_range.start],
        &source[source_range],
        &serialized[serialized_range.end..]
    ))
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

    const CARD_ID: &str = "a424b91a-8c3c-4f96-8ac9-8bbbbbbd28b5";
    const AVATAR_ID: &str = "00000000-0000-4000-8000-000000000011";

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

    fn catalog() -> ExplorationCatalog {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        ron::from_str(&fs::read_to_string(root.join("data/exploration.ron")).unwrap()).unwrap()
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
    fn card_tags_are_edited_in_id_keyed_internal_metadata() {
        let mut document = CompatDocument {
            data: toml::Value::Table(toml::map::Map::from_iter([(
                "cards".into(),
                toml::Value::Table(toml::map::Map::from_iter([(
                    CARD_ID.into(),
                    toml::Value::Table(toml::map::Map::from_iter([
                        ("number".into(), 142.into()),
                        ("mtg_origin".into(), "Solitude".into()),
                    ])),
                )])),
            )])),
        };

        set_card_metadata_tags(&mut document, CARD_ID, json!(["Art OK", "tutorial"])).unwrap();

        let record = card_metadata_record_mut(&mut document, CARD_ID).unwrap();
        assert_eq!(record["number"].as_integer(), Some(142));
        assert_eq!(record["mtg_origin"].as_str(), Some("Solitude"));
        assert_eq!(record["tags"][0].as_str(), Some("Art OK"));
        assert_eq!(record["tags"][1].as_str(), Some("tutorial"));
    }

    #[test]
    fn card_tag_source_patch_preserves_unrelated_metadata_bytes() {
        let source = r##"CompatDocument(
  data: {
    "cards": {
      /* first card comment */
      "a424b91a-8c3c-4f96-8ac9-8bbbbbbd28b5": {
        "number": 142,
        "mtg_origin": "Solitude",
        "tags": ["Art Rework"],
      },
      /* unrelated card comment */
      "00000000-0000-4000-8000-000000000002": {
        "number": 2,
        "mtg_origin": "Fixture",
      },
    },
    "tags": [
      /*[0]*/
      {"name": "Art Rework", "color": "#b91c1c"},
      /*[1]*/
      {"name": "Art OK", "color": "#15803d"},
    ],
    "tides": [],
  },
)
"##;
        let mut metadata: CompatDocument = ron::from_str(source).unwrap();
        set_card_metadata_tags(&mut metadata, CARD_ID, json!(["Art Rework", "Art OK"])).unwrap();

        let patched = patch_card_metadata_record(source, &metadata, CARD_ID).unwrap();
        let before = card_metadata_value_range(source, CARD_ID).unwrap();
        let after = card_metadata_value_range(&patched, CARD_ID).unwrap();
        assert_eq!(&source[..before.start], &patched[..after.start]);
        assert_eq!(&source[before.end..], &patched[after.end..]);
        assert!(patched.contains("/* unrelated card comment */"));

        let serialized = serialize_ron(&metadata, false).unwrap();
        let preserved = preserve_card_metadata_source(&serialized, &patched).unwrap();
        let patched_cards = card_metadata_map_value_range(&patched).unwrap();
        let preserved_cards = card_metadata_map_value_range(&preserved).unwrap();
        assert_eq!(&patched[patched_cards], &preserved[preserved_cards]);
        assert_eq!(
            ron::from_str::<CompatDocument>(&preserved).unwrap(),
            metadata
        );
    }
}
