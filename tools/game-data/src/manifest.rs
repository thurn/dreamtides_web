use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Component, Path, PathBuf};

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

pub const MANIFEST_PATH: &str = "data/game-data-manifest.ron";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub datasets: Vec<Dataset>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Dataset {
    pub id: String,
    pub source: String,
    pub output: String,
    pub schema: String,
    pub adapter: String,
    pub adapter_version: u32,
    #[serde(default)]
    pub dependencies: Vec<String>,
    pub refresh: String,
    pub editor: EditorCapability,
    pub identity: String,
    pub state: MigrationState,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EditorCapability {
    ReadOnly,
    Semantic,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MigrationState {
    Ron,
    Toml,
}

#[derive(Debug, Serialize)]
pub struct ResolvedManifest<'a> {
    pub manifest_path: String,
    pub compiler_build_version: &'static str,
    pub datasets: Vec<ResolvedDataset<'a>>,
}

#[derive(Debug, Serialize)]
pub struct ResolvedDataset<'a> {
    #[serde(flatten)]
    pub dataset: &'a Dataset,
    pub source_path: String,
    pub output_path: String,
}

impl Manifest {
    pub fn load(root: &Path) -> Result<Self> {
        let path = root.join(MANIFEST_PATH);
        let text = fs::read_to_string(&path)
            .with_context(|| format!("read game-data manifest at {}", path.display()))?;
        let manifest: Manifest = ron::from_str(&text)
            .with_context(|| format!("parse game-data manifest at {}", path.display()))?;
        manifest.validate(root)?;
        Ok(manifest)
    }

    pub fn validate(&self, root: &Path) -> Result<()> {
        let mut ids = BTreeSet::new();
        let mut sources = BTreeSet::new();
        let mut outputs = BTreeSet::new();
        let adapters = [
            "affiliations_v1",
            "apollyon_incarnations_v1",
            "atlas_v1",
            "draft_v1",
            "cards_v2",
            "exploration_v1",
            "compat_v1",
        ];
        for dataset in &self.datasets {
            if !ids.insert(&dataset.id) {
                bail!("duplicate dataset id: {}", dataset.id);
            }
            if !sources.insert(&dataset.source) {
                bail!("duplicate canonical source path: {}", dataset.source);
            }
            if !outputs.insert(&dataset.output) {
                bail!("duplicate generated output path: {}", dataset.output);
            }
            if !adapters.contains(&dataset.adapter.as_str()) {
                bail!(
                    "dataset {} registers unknown adapter {}",
                    dataset.id,
                    dataset.adapter
                );
            }
            validate_relative_data_path(&dataset.source, ".ron")?;
            validate_relative_data_path(&dataset.output, ".toml")?;
            let source = root.join(&dataset.source);
            let output = root.join(&dataset.output);
            ensure_within_data(root, &source)?;
            ensure_within_data(root, &output)?;
            if dataset.state == MigrationState::Ron && !source.is_file() {
                bail!(
                    "canonical RON source is missing for {}: {}",
                    dataset.id,
                    source.display()
                );
            }
        }
        for dataset in &self.datasets {
            for dependency in &dataset.dependencies {
                if !ids.contains(dependency) {
                    bail!(
                        "dataset {} has unknown dependency {}",
                        dataset.id,
                        dependency
                    );
                }
            }
        }
        Ok(())
    }

    pub fn dataset(&self, id: &str) -> Result<&Dataset> {
        self.datasets
            .iter()
            .find(|dataset| dataset.id == id)
            .with_context(|| format!("unknown game-data dataset id: {id}"))
    }

    pub fn selected<'a>(&'a self, id: Option<&str>) -> Result<Vec<&'a Dataset>> {
        let Some(id) = id else {
            return Ok(self.datasets.iter().collect());
        };
        let mut selected = BTreeMap::new();
        self.collect_dependencies(self.dataset(id)?, &mut selected)?;
        Ok(selected.into_values().collect())
    }

    fn collect_dependencies<'a>(
        &'a self,
        dataset: &'a Dataset,
        selected: &mut BTreeMap<String, &'a Dataset>,
    ) -> Result<()> {
        if selected.insert(dataset.id.clone(), dataset).is_some() {
            return Ok(());
        }
        for dependency in &dataset.dependencies {
            self.collect_dependencies(self.dataset(dependency)?, selected)?;
        }
        Ok(())
    }

    pub fn resolved<'a>(&'a self, root: &Path) -> ResolvedManifest<'a> {
        ResolvedManifest {
            manifest_path: root.join(MANIFEST_PATH).display().to_string(),
            compiler_build_version: env!("GAME_DATA_BUILD_VERSION"),
            datasets: self
                .datasets
                .iter()
                .map(|dataset| ResolvedDataset {
                    source_path: root.join(&dataset.source).display().to_string(),
                    output_path: root.join(&dataset.output).display().to_string(),
                    dataset,
                })
                .collect(),
        }
    }
}

fn validate_relative_data_path(path: &str, extension: &str) -> Result<()> {
    let path = Path::new(path);
    if path.is_absolute()
        || path.extension().and_then(|value| value.to_str()) != Some(&extension[1..])
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        bail!("invalid manifest data path: {}", path.display());
    }
    if !path.starts_with("data") {
        bail!(
            "manifest target is outside the approved data root: {}",
            path.display()
        );
    }
    Ok(())
}

fn ensure_within_data(root: &Path, path: &Path) -> Result<()> {
    let data = root.join("data");
    let parent = path.parent().context("manifest path has no parent")?;
    let normalized = normalize(parent);
    if !normalized.starts_with(normalize(&data)) {
        bail!("manifest path escapes the data root: {}", path.display());
    }
    Ok(())
}

fn normalize(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                result.pop();
            }
            Component::CurDir => {}
            other => result.push(other.as_os_str()),
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dataset(id: &str, source: &str, output: &str) -> Dataset {
        Dataset {
            id: id.into(),
            source: source.into(),
            output: output.into(),
            schema: "Fixture".into(),
            adapter: "compat_v1".into(),
            adapter_version: 1,
            dependencies: vec![],
            refresh: "fixture".into(),
            editor: EditorCapability::ReadOnly,
            identity: "fixture".into(),
            state: MigrationState::Toml,
        }
    }

    #[test]
    fn rejects_path_traversal_and_unregistered_adapters() {
        let root = tempfile::tempdir().unwrap();
        let traversal = Manifest {
            datasets: vec![dataset("bad", "data/../escape.ron", "data/out.toml")],
        };
        assert!(
            traversal
                .validate(root.path())
                .unwrap_err()
                .to_string()
                .contains("invalid manifest data path")
        );

        let mut unknown = dataset("bad", "data/source.ron", "data/out.toml");
        unknown.adapter = "unknown".into();
        assert!(
            Manifest {
                datasets: vec![unknown]
            }
            .validate(root.path())
            .unwrap_err()
            .to_string()
            .contains("unknown adapter")
        );
    }

    #[test]
    fn accepts_nested_paths_within_data() {
        let root = tempfile::tempdir().unwrap();
        let manifest = Manifest {
            datasets: vec![dataset(
                "nested",
                "data/internal/source.ron",
                "data/internal/output.toml",
            )],
        };

        manifest.validate(root.path()).unwrap();
    }

    #[test]
    fn rejects_duplicate_ids_paths_and_unknown_dependencies() {
        let root = tempfile::tempdir().unwrap();
        let one = dataset("same", "data/one.ron", "data/one.toml");
        let mut two = dataset("same", "data/two.ron", "data/two.toml");
        assert!(
            Manifest {
                datasets: vec![one.clone(), two.clone()]
            }
            .validate(root.path())
            .unwrap_err()
            .to_string()
            .contains("duplicate dataset id")
        );
        two.id = "two".into();
        two.source = one.source.clone();
        assert!(
            Manifest {
                datasets: vec![one.clone(), two]
            }
            .validate(root.path())
            .unwrap_err()
            .to_string()
            .contains("duplicate canonical source")
        );
        let mut dependency = one;
        dependency.dependencies = vec!["missing".into()];
        assert!(
            Manifest {
                datasets: vec![dependency]
            }
            .validate(root.path())
            .unwrap_err()
            .to_string()
            .contains("unknown dependency")
        );
    }
}
