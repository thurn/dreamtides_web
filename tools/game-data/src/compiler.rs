use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Instant;

use anyhow::{Context, Result, bail};
use ron::ser::PrettyConfig;
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::manifest::{Dataset, Manifest, MigrationState};
use crate::models::{
    affiliations, apollyon_incarnations, atlas, augury, cards, compat, draft,
    dream_avatar_tide_pools, dream_avatars, dream_guides, dreamscapes, dreamsign_profiles,
    dreamsign_signatures, dreamsigns, dreamwell, economy, exploration, figments, gamble, glossary,
    internal_card_metadata, opponents, resonance, reward_selection, sites, tides, transfiguration,
    tutorial, tutorial_journey_pool,
};

pub const BUILD_VERSION: &str = env!("GAME_DATA_BUILD_VERSION");

pub struct CompileRequest<'a> {
    pub root: &'a Path,
    pub manifest: &'a Manifest,
    pub dataset: Option<&'a str>,
    pub staging_root: &'a Path,
}

#[derive(Debug, Serialize)]
pub struct CompileReport {
    pub ok: bool,
    pub compiler_build_version: &'static str,
    pub staging_root: String,
    pub datasets: Vec<DatasetReport>,
}

#[derive(Debug, Serialize)]
pub struct DatasetReport {
    pub dataset_id: String,
    pub source_path: String,
    pub output_path: String,
    pub adapter_version: u32,
    pub source_hash: String,
    pub manifest_fingerprint: String,
    pub generated_hash: String,
    pub duration_ms: f64,
    pub changed: bool,
}

#[derive(Debug, Serialize)]
pub struct MigrationReport {
    pub ok: bool,
    pub dataset_id: String,
    pub source_path: String,
    pub output_path: String,
    pub record_count: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct EditReport {
    pub ok: bool,
    pub changed: bool,
    pub dataset_id: String,
    pub source_revision: String,
}

pub fn compile(request: CompileRequest<'_>) -> Result<CompileReport> {
    let staging_root = absolute_staging_root(request.root, request.staging_root);
    fs::create_dir_all(&staging_root)
        .with_context(|| format!("create staging root {}", staging_root.display()))?;
    let mut reports = Vec::new();
    for dataset in request.manifest.selected(request.dataset)? {
        if dataset.state != MigrationState::Ron {
            continue;
        }
        let started = Instant::now();
        let source_path = request.root.join(&dataset.source);
        let source = fs::read(&source_path)
            .with_context(|| format!("read {} source {}", dataset.id, source_path.display()))?;
        let source_hash = dataset_source_hash(request.root, request.manifest, dataset, &source)?;
        let manifest_fingerprint = manifest_fingerprint(dataset)?;
        let compatibility =
            adapt(request.root, request.manifest, dataset, &source).with_context(|| {
                format!(
                    "compile dataset {} from {}",
                    dataset.id,
                    source_path.display()
                )
            })?;
        let body = toml::to_string_pretty(&compatibility)
            .with_context(|| format!("serialize compatibility TOML for {}", dataset.id))?;
        let generated = generated_document(
            dataset,
            &source_hash,
            &manifest_fingerprint,
            normalize_newlines(&body),
        );
        let generated_hash = sha256(generated.as_bytes());
        let staged_path = staging_root.join(&dataset.output);
        atomic_write(&staged_path, generated.as_bytes())?;
        let visible_path = request.root.join(&dataset.output);
        let changed =
            fs::read(&visible_path).map_or(true, |visible| visible != generated.as_bytes());
        reports.push(DatasetReport {
            dataset_id: dataset.id.clone(),
            source_path: source_path.display().to_string(),
            output_path: staged_path.display().to_string(),
            adapter_version: dataset.adapter_version,
            source_hash,
            manifest_fingerprint,
            generated_hash,
            duration_ms: started.elapsed().as_secs_f64() * 1000.0,
            changed,
        });
    }
    Ok(CompileReport {
        ok: true,
        compiler_build_version: BUILD_VERSION,
        staging_root: staging_root.display().to_string(),
        datasets: reports,
    })
}

fn adapt(
    root: &Path,
    manifest: &Manifest,
    dataset: &Dataset,
    source: &[u8],
) -> Result<toml::Value> {
    let source = std::str::from_utf8(source).context("RON source is not UTF-8")?;
    match dataset.adapter.as_str() {
        "affiliations_v1" => affiliations::lower(parse_ron(source, dataset)?),
        "apollyon_incarnations_v1" => apollyon_incarnations::lower(parse_ron(source, dataset)?),
        "atlas_v1" => atlas::lower(parse_ron(source, dataset)?),
        "augury_v1" => augury::lower(parse_ron(source, dataset)?),
        "battle_v1" => opponents::lower_battle(parse_ron(source, dataset)?),
        "draft_v1" => draft::lower(parse_ron(source, dataset)?),
        "dream_avatar_metadata_v1" => dream_avatars::lower_metadata(parse_ron(source, dataset)?),
        "dream_avatars_v1" => {
            let avatars: Vec<dream_avatars::AvatarDefinition> = parse_ron(source, dataset)?;
            let metadata_dataset = manifest.dataset("internal-card-metadata")?;
            let metadata_source = fs::read_to_string(root.join(&metadata_dataset.source))
                .with_context(|| {
                    format!(
                        "read internal card metadata source {}",
                        metadata_dataset.source
                    )
                })?;
            let metadata: internal_card_metadata::CardMetadataCatalog =
                parse_ron(&metadata_source, metadata_dataset)?;
            internal_card_metadata::validate(&metadata)?;
            let known_card_ids = metadata
                .cards
                .into_iter()
                .map(|entry| entry.id.to_string())
                .collect();
            dream_avatars::validate_signature_card_references(&avatars, &known_card_ids)?;

            let avatar_metadata_dataset = manifest.dataset("internal-avatar-metadata")?;
            let avatar_metadata_path = root.join(&avatar_metadata_dataset.source);
            let avatar_metadata: Vec<dream_avatars::AvatarMetadata> =
                ron::from_str(&fs::read_to_string(&avatar_metadata_path).with_context(|| {
                    format!(
                        "read internal DreamAvatar metadata source {}",
                        avatar_metadata_path.display()
                    )
                })?)
                .context("parse internal DreamAvatar metadata source")?;
            dream_avatars::validate_internal_metadata(&avatars, &avatar_metadata)?;
            dream_avatars::lower(avatars)
        }
        "dream_guides_v1" => dream_guides::lower(parse_ron(source, dataset)?),
        "dreamscapes_v1" => dreamscapes::lower(parse_ron(source, dataset)?),
        "dreamsign_profiles_v1" => dreamsign_profiles::lower(parse_ron(source, dataset)?),
        "dreamsign_signatures_v1" => dreamsign_signatures::lower(parse_ron(source, dataset)?),
        "dreamsign_metadata_v1" => dreamsigns::lower_metadata(parse_ron(source, dataset)?),
        "dreamsign_tags_v1" => dreamsigns::lower_tags(parse_ron(source, dataset)?),
        "dreamsigns_v1" => {
            let definitions: Vec<dreamsigns::DreamsignDefinition> = parse_ron(source, dataset)?;
            let metadata_dataset = manifest.dataset("internal-dreamsign-metadata")?;
            let metadata_path = root.join(&metadata_dataset.source);
            let metadata: dreamsigns::DreamsignMetadataCatalog = parse_ron(
                &fs::read_to_string(&metadata_path).with_context(|| {
                    format!(
                        "read internal Dreamsign metadata source {}",
                        metadata_path.display()
                    )
                })?,
                metadata_dataset,
            )?;
            dreamsigns::lower(definitions, metadata)
        }
        "dreamwell_metadata_v1" => dreamwell::lower_metadata(parse_ron(source, dataset)?),
        "dreamwell_v2" => {
            let catalog: dreamwell::DreamwellCatalog = parse_ron(source, dataset)?;
            let metadata_dataset = manifest.dataset("internal-dreamwell-metadata")?;
            let metadata_path = root.join(&metadata_dataset.source);
            let metadata: Vec<dreamwell::DreamwellCardMetadata> = parse_ron(
                &fs::read_to_string(&metadata_path).with_context(|| {
                    format!(
                        "read internal Dreamwell metadata source {}",
                        metadata_path.display()
                    )
                })?,
                metadata_dataset,
            )?;
            dreamwell::lower(catalog, metadata)
        }
        "cards_v2" => {
            let metadata_dataset = manifest.dataset("internal-card-metadata")?;
            let metadata_source = fs::read_to_string(root.join(&metadata_dataset.source))
                .with_context(|| {
                    format!(
                        "read internal card metadata source {}",
                        metadata_dataset.source
                    )
                })?;
            let metadata: internal_card_metadata::CardMetadataCatalog =
                parse_ron(&metadata_source, metadata_dataset)?;
            let compatibility_metadata = internal_card_metadata::lower(metadata)?;
            cards::lower(
                parse_ron(source, dataset)?,
                cards::metadata_by_id(&compatibility_metadata)?,
            )
        }
        "economy_v1" => economy::lower(parse_ron(source, dataset)?),
        "exploration_v2" => exploration::lower(parse_ron(source, dataset)?),
        "internal_ai_v1" => {
            let catalog: opponents::InternalAiCatalog = parse_ron(source, dataset)?;
            let known_card_ids = known_opponent_card_ids(root, manifest)?;
            opponents::validate_card_references(&catalog, &known_card_ids)?;
            opponents::lower_internal_ai(catalog)
        }
        "internal_card_metadata_v1" => internal_card_metadata::lower(parse_ron(source, dataset)?),
        "opponents_v1" => {
            let catalog: opponents::OpponentsCatalog = parse_ron(source, dataset)?;
            let battle_dataset = manifest.dataset("battle")?;
            let battle_source = fs::read_to_string(root.join(&battle_dataset.source))
                .with_context(|| format!("read battle source {}", battle_dataset.source))?;
            let battle = parse_ron(&battle_source, battle_dataset)?;
            let dreamwell_dataset = manifest.dataset("dreamwell")?;
            let dreamwell_source = fs::read_to_string(root.join(&dreamwell_dataset.source))
                .with_context(|| format!("read Dreamwell source {}", dreamwell_dataset.source))?;
            let dreamwell: dreamwell::DreamwellCatalog =
                parse_ron(&dreamwell_source, dreamwell_dataset)?;
            let ai_dataset = manifest.dataset("internal-ai")?;
            let ai_source = fs::read_to_string(root.join(&ai_dataset.source))
                .with_context(|| format!("read internal AI source {}", ai_dataset.source))?;
            let internal_ai = parse_ron(&ai_source, ai_dataset)?;
            let known_card_ids = known_opponent_card_ids(root, manifest)?;
            opponents::validate_card_references(&internal_ai, &known_card_ids)?;
            opponents::lower(catalog, battle, dreamwell.rules, internal_ai)
        }
        "reward_selection_v1" => reward_selection::lower(parse_ron(source, dataset)?),
        "figments_v1" => figments::lower(parse_ron(source, dataset)?),
        "gamble_v1" => gamble::lower(parse_ron(source, dataset)?),
        "glossary_v1" => glossary::lower(parse_ron(source, dataset)?),
        "sites_v1" => sites::lower(parse_ron(source, dataset)?),
        "tutorial_v1" => tutorial::lower(parse_ron(source, dataset)?),
        "tutorial_journey_pool_v1" => {
            let catalog: tutorial_journey_pool::TutorialJourneyDraftPool =
                parse_ron(source, dataset)?;
            let cards_dataset = manifest.dataset("cards")?;
            let cards: Vec<cards::CardDefinition> = parse_ron(
                &fs::read_to_string(root.join(&cards_dataset.source))
                    .with_context(|| format!("read cards source {}", cards_dataset.source))?,
                cards_dataset,
            )?;
            let avatars_dataset = manifest.dataset("dream-avatars")?;
            let avatars: Vec<dream_avatars::AvatarDefinition> = parse_ron(
                &fs::read_to_string(root.join(&avatars_dataset.source)).with_context(|| {
                    format!("read DreamAvatars source {}", avatars_dataset.source)
                })?,
                avatars_dataset,
            )?;
            let dreamsigns_dataset = manifest.dataset("dreamsigns")?;
            let dreamsigns: Vec<dreamsigns::DreamsignDefinition> = parse_ron(
                &fs::read_to_string(root.join(&dreamsigns_dataset.source)).with_context(|| {
                    format!("read Dreamsigns source {}", dreamsigns_dataset.source)
                })?,
                dreamsigns_dataset,
            )?;
            tutorial_journey_pool::validate_references(
                &catalog,
                &cards.into_iter().map(|card| card.id).collect(),
                &avatars
                    .into_iter()
                    .map(|avatar| avatar.id.to_string())
                    .collect(),
                &dreamsigns
                    .into_iter()
                    .map(|dreamsign| dreamsign.id.to_string())
                    .collect(),
            )?;
            tutorial_journey_pool::lower(catalog)
        }
        "resonance_v1" => resonance::lower(parse_ron(source, dataset)?),
        "tides_v1" => {
            let catalog: tides::TidesCatalog = parse_ron(source, dataset)?;
            let cards_dataset = manifest.dataset("cards")?;
            let cards: Vec<cards::CardDefinition> = parse_ron(
                &fs::read_to_string(root.join(&cards_dataset.source))
                    .with_context(|| format!("read card source {}", cards_dataset.source))?,
                cards_dataset,
            )?;
            tides::validate_references(&catalog, &cards.into_iter().map(|card| card.id).collect())?;
            tides::lower(catalog)
        }
        "dream_avatar_tide_pools_v1" => {
            let catalog: dream_avatar_tide_pools::DreamAvatarTidePoolsCatalog =
                parse_ron(source, dataset)?;
            let tides_dataset = manifest.dataset("tides")?;
            let tides_catalog: tides::TidesCatalog = parse_ron(
                &fs::read_to_string(root.join(&tides_dataset.source))
                    .with_context(|| format!("read tides source {}", tides_dataset.source))?,
                tides_dataset,
            )?;
            let avatars_dataset = manifest.dataset("dream-avatars")?;
            let avatars: Vec<dream_avatars::AvatarDefinition> = parse_ron(
                &fs::read_to_string(root.join(&avatars_dataset.source)).with_context(|| {
                    format!("read Dream Avatar source {}", avatars_dataset.source)
                })?,
                avatars_dataset,
            )?;
            dream_avatar_tide_pools::validate_references(
                &catalog,
                &tides::tide_kinds(&tides_catalog)?,
                &avatars
                    .into_iter()
                    .map(|avatar| avatar.id.to_string())
                    .collect(),
            )?;
            dream_avatar_tide_pools::lower(catalog)
        }
        "transfiguration_v1" => transfiguration::lower(parse_ron(source, dataset)?),
        "compat_v1" => {
            let document: compat::CompatDocument = parse_ron(source, dataset)?;
            Ok(document.data)
        }
        adapter => bail!("dataset {} has unsupported adapter {adapter}", dataset.id),
    }
}

fn known_opponent_card_ids(
    root: &Path,
    manifest: &Manifest,
) -> Result<std::collections::BTreeSet<opponents::CardId>> {
    let cards_dataset = manifest.dataset("cards")?;
    let card_source = fs::read_to_string(root.join(&cards_dataset.source))
        .with_context(|| format!("read cards source {}", cards_dataset.source))?;
    let cards: Vec<cards::CardDefinition> = parse_ron(&card_source, cards_dataset)?;
    cards
        .into_iter()
        .map(|card| {
            card.id
                .parse::<opponents::CardId>()
                .map_err(anyhow::Error::msg)
                .with_context(|| {
                    format!("parse card identity {} for opponents validation", card.id)
                })
        })
        .collect()
}

fn dataset_source_hash(
    root: &Path,
    manifest: &Manifest,
    dataset: &Dataset,
    source: &[u8],
) -> Result<String> {
    if dataset.dependencies.is_empty() {
        return Ok(sha256(source));
    }
    let mut bytes = Vec::new();
    bytes.extend_from_slice(source);
    bytes.push(0);
    for dependency_id in &dataset.dependencies {
        let dependency = manifest.dataset(dependency_id)?;
        bytes.extend_from_slice(&fs::read(root.join(&dependency.source)).with_context(|| {
            format!(
                "read dependency {} source {}",
                dependency.id, dependency.source
            )
        })?);
        bytes.push(0);
    }
    Ok(sha256(bytes))
}

fn parse_ron<T: serde::de::DeserializeOwned>(source: &str, dataset: &Dataset) -> Result<T> {
    ron::from_str(source).map_err(|error| {
        anyhow::anyhow!(
            "MALFORMED_SOURCE: dataset {} at {}: {}",
            dataset.id,
            dataset.source,
            error
        )
    })
}

pub fn migrate(
    root: &Path,
    manifest: &Manifest,
    id: &str,
    requested_output: Option<&Path>,
) -> Result<MigrationReport> {
    let dataset = manifest.dataset(id)?;
    if dataset.adapter != "compat_v1" {
        bail!(
            "dataset {} uses typed adapter {}; its reviewed RON source must be supplied directly",
            id,
            dataset.adapter
        );
    }
    let toml_path = root.join(&dataset.output);
    let toml_text = fs::read_to_string(&toml_path)
        .with_context(|| format!("read migration input {}", toml_path.display()))?;
    let value: toml::Value = toml::from_str(&toml_text)
        .with_context(|| format!("parse migration input {}", toml_path.display()))?;
    let record_count = inferred_record_count(&value);
    let document = compat::CompatDocument { data: value };
    let pretty = migration_pretty_config();
    let mut ron = ron::ser::to_string_pretty(&document, pretty)?;
    if !ron.ends_with('\n') {
        ron.push('\n');
    }
    let output = requested_output
        .map(|path| {
            if path.is_absolute() {
                path.to_owned()
            } else {
                root.join(path)
            }
        })
        .unwrap_or_else(|| root.join(&dataset.source));
    if output != root.join(&dataset.source) {
        let data_root = root.join("data");
        if !output.starts_with(&data_root) {
            bail!(
                "migration output must remain beneath {}",
                data_root.display()
            );
        }
    }
    atomic_write(&output, ron.as_bytes())?;

    // The official serializer must round-trip the exact typed result and be
    // idempotent before a migrated source is accepted.
    let reparsed: compat::CompatDocument = ron::from_str(&ron)?;
    if reparsed != document {
        bail!("migrated RON failed semantic round-trip for {id}");
    }
    let serialized_again = ron::ser::to_string_pretty(&reparsed, migration_pretty_config())?;
    if serialized_again.trim_end() != ron.trim_end() {
        bail!("migrated RON formatting is not idempotent for {id}");
    }
    Ok(MigrationReport {
        ok: true,
        dataset_id: id.to_owned(),
        source_path: toml_path.display().to_string(),
        output_path: output.display().to_string(),
        record_count,
    })
}

fn migration_pretty_config() -> PrettyConfig {
    PrettyConfig::new()
        .depth_limit(128)
        .struct_names(true)
        .separate_tuple_members(true)
        .enumerate_arrays(false)
}

pub fn stage_edit(
    root: &Path,
    manifest: &Manifest,
    staging_root: &Path,
    body: &str,
) -> Result<EditReport> {
    crate::editor::stage_edit(root, manifest, staging_root, body)
}

fn generated_document(
    dataset: &Dataset,
    source_hash: &str,
    manifest_fingerprint: &str,
    body: String,
) -> String {
    format!(
        "# GENERATED FILE — DO NOT EDIT. Canonical source: {}\n\
# source-sha256: {source_hash}\n\
# compiler-build: {BUILD_VERSION}\n\
# adapter: {}@{}\n\
# manifest-fingerprint: {manifest_fingerprint}\n\
# Regenerate with: npm run game-data:compile\n\n{}\n",
        dataset.source,
        dataset.adapter,
        dataset.adapter_version,
        body.trim_end(),
    )
}

fn normalize_newlines(value: &str) -> String {
    value.replace("\r\n", "\n").replace('\r', "\n")
}

fn manifest_fingerprint(dataset: &Dataset) -> Result<String> {
    Ok(sha256(&serde_json::to_vec(dataset)?))
}

pub fn sha256(bytes: impl AsRef<[u8]>) -> String {
    format!("{:x}", Sha256::digest(bytes.as_ref()))
}

fn absolute_staging_root(root: &Path, staging_root: &Path) -> PathBuf {
    if staging_root.is_absolute() {
        staging_root.to_owned()
    } else {
        root.join(staging_root)
    }
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().context("output path has no parent")?;
    fs::create_dir_all(parent)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    temporary.persist(path).map_err(|error| {
        anyhow::anyhow!("publish staged file {}: {}", path.display(), error.error)
    })?;
    Ok(())
}

fn inferred_record_count(value: &toml::Value) -> Option<usize> {
    let table = value.as_table()?;
    let arrays = table
        .values()
        .filter_map(toml::Value::as_array)
        .collect::<Vec<_>>();
    (arrays.len() == 1).then(|| arrays[0].len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        cards::CardDefinition, draft::DraftDocument, dream_avatars::AvatarDefinition,
        exploration::ExplorationCatalog,
    };

    fn repository_root() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap()
    }

    fn canonical<T>(source: &str, implicit_some: bool) -> String
    where
        T: serde::de::DeserializeOwned + serde::Serialize + PartialEq + std::fmt::Debug,
    {
        let parsed: T = ron::from_str(source).unwrap();
        let mut extensions = ron::extensions::Extensions::empty();
        if implicit_some {
            extensions |= ron::extensions::Extensions::IMPLICIT_SOME;
        }
        let config = PrettyConfig::new()
            .depth_limit(128)
            .struct_names(true)
            .separate_tuple_members(true)
            .enumerate_arrays(false)
            .extensions(extensions);
        let text = ron::ser::to_string_pretty(&parsed, config.clone()).unwrap();
        let reparsed: T = ron::from_str(&text).unwrap();
        assert_eq!(reparsed, parsed);
        assert_eq!(ron::ser::to_string_pretty(&reparsed, config).unwrap(), text);
        text
    }

    #[test]
    fn migration_serializer_omits_generated_array_indices() {
        let text = ron::ser::to_string_pretty(&vec!["first", "second"], migration_pretty_config())
            .unwrap();
        assert!(!text.contains("/*["));
    }

    #[test]
    fn every_canonical_source_round_trips_idempotently() {
        let root = repository_root();
        let manifest = Manifest::load(&root).unwrap();
        for dataset in &manifest.datasets {
            let source = fs::read_to_string(root.join(&dataset.source)).unwrap();
            match dataset.adapter.as_str() {
                "affiliations_v1" => {
                    canonical::<affiliations::AffiliationCatalog>(&source, true);
                }
                "apollyon_incarnations_v1" => {
                    canonical::<Vec<apollyon_incarnations::ApollyonIncarnation>>(&source, true);
                }
                "atlas_v1" => {
                    canonical::<atlas::AtlasCatalog>(&source, true);
                }
                "augury_v1" => {
                    canonical::<augury::AuguryCatalog>(&source, true);
                }
                "battle_v1" => {
                    canonical::<opponents::BattleRules>(&source, true);
                }
                "cards_v2" => {
                    canonical::<Vec<CardDefinition>>(&source, true);
                }
                "draft_v1" => {
                    canonical::<DraftDocument>(&source, false);
                }
                "dream_avatar_metadata_v1" => {
                    canonical::<Vec<dream_avatars::AvatarMetadata>>(&source, true);
                }
                "dream_avatars_v1" => {
                    canonical::<Vec<AvatarDefinition>>(&source, true);
                }
                "dream_guides_v1" => {
                    canonical::<Vec<dream_guides::GuideDefinition>>(&source, true);
                }
                "dreamscapes_v1" => {
                    canonical::<Vec<dreamscapes::DreamscapeDefinition>>(&source, true);
                }
                "dreamsign_profiles_v1" => {
                    canonical::<Vec<dreamsign_profiles::DreamsignProfileDefinition>>(&source, true);
                }
                "dreamsign_signatures_v1" => {
                    canonical::<Vec<dreamsign_signatures::DreamsignSignatureDefinition>>(
                        &source, true,
                    );
                }
                "dreamsign_metadata_v1" => {
                    canonical::<dreamsigns::DreamsignMetadataCatalog>(&source, true);
                }
                "dreamsign_tags_v1" => {
                    canonical::<dreamsigns::DreamsignTagCatalog>(&source, true);
                }
                "dreamsigns_v1" => {
                    canonical::<Vec<dreamsigns::DreamsignDefinition>>(&source, true);
                }
                "economy_v1" => {
                    canonical::<economy::EconomyCatalog>(&source, true);
                }
                "dreamwell_v2" => {
                    canonical::<dreamwell::DreamwellCatalog>(&source, true);
                }
                "dreamwell_metadata_v1" => {
                    canonical::<Vec<dreamwell::DreamwellCardMetadata>>(&source, true);
                }
                "exploration_v2" => {
                    canonical::<ExplorationCatalog>(&source, true);
                }
                "internal_ai_v1" => {
                    canonical::<opponents::InternalAiCatalog>(&source, true);
                }
                "internal_card_metadata_v1" => {
                    canonical::<internal_card_metadata::CardMetadataCatalog>(&source, true);
                }
                "opponents_v1" => {
                    canonical::<opponents::OpponentsCatalog>(&source, true);
                }
                "reward_selection_v1" => {
                    canonical::<reward_selection::RewardSelectionCatalog>(&source, true);
                }
                "figments_v1" => {
                    canonical::<Vec<figments::FigmentDefinition>>(&source, true);
                }
                "gamble_v1" => {
                    canonical::<gamble::GambleCatalog>(&source, false);
                }
                "glossary_v1" => {
                    canonical::<Vec<glossary::GlossaryDefinition>>(&source, true);
                }
                "sites_v1" => {
                    canonical::<sites::SitesCatalog>(&source, true);
                }
                "tutorial_v1" => {
                    canonical::<tutorial::TutorialCatalog>(&source, true);
                }
                "tutorial_journey_pool_v1" => {
                    canonical::<tutorial_journey_pool::TutorialJourneyDraftPool>(&source, true);
                }
                "resonance_v1" => {
                    canonical::<resonance::ResonanceCatalog>(&source, false);
                }
                "tides_v1" => {
                    canonical::<tides::TidesCatalog>(&source, true);
                }
                "dream_avatar_tide_pools_v1" => {
                    canonical::<dream_avatar_tide_pools::DreamAvatarTidePoolsCatalog>(
                        &source, true,
                    );
                }
                "transfiguration_v1" => {
                    canonical::<transfiguration::TransfigurationCatalog>(&source, true);
                }
                "compat_v1" => {
                    canonical::<compat::CompatDocument>(&source, false);
                }
                other => panic!("untested adapter {other}"),
            }
        }
    }

    #[test]
    fn complete_compilation_is_byte_deterministic() {
        let root = repository_root();
        let manifest = Manifest::load(&root).unwrap();
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let first_report = compile(CompileRequest {
            root: &root,
            manifest: &manifest,
            dataset: None,
            staging_root: first.path(),
        })
        .unwrap();
        compile(CompileRequest {
            root: &root,
            manifest: &manifest,
            dataset: None,
            staging_root: second.path(),
        })
        .unwrap();
        assert_eq!(first_report.datasets.len(), manifest.datasets.len());
        for dataset in &manifest.datasets {
            assert_eq!(
                fs::read(first.path().join(&dataset.output)).unwrap(),
                fs::read(second.path().join(&dataset.output)).unwrap(),
                "{} was nondeterministic",
                dataset.id,
            );
        }
    }

    #[test]
    fn malformed_ron_reports_the_dataset_and_source() {
        let dataset = Dataset {
            id: "fixture".into(),
            source: "data/fixture.ron".into(),
            output: "data/fixture.toml".into(),
            schema: "Fixture".into(),
            adapter: "compat_v1".into(),
            adapter_version: 1,
            dependencies: vec![],
            refresh: "fixture".into(),
            editor: crate::manifest::EditorCapability::ReadOnly,
            identity: "fixture".into(),
            state: MigrationState::Ron,
        };
        let error = parse_ron::<compat::CompatDocument>("(data: [)", &dataset).unwrap_err();
        let message = error.to_string();
        assert!(message.contains("MALFORMED_SOURCE"));
        assert!(message.contains("fixture"));
        assert!(message.contains("data/fixture.ron"));
    }
}
