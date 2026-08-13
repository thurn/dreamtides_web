use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;

use dreamtides_game_data::affiliations::{self, AffiliationCatalog};
use dreamtides_game_data::models::localization::source_text;
use serde::Serialize;
use serde_json::Value;
use tauri::State;

#[derive(Default)]
struct Repository(Mutex<Option<PathBuf>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EditorSnapshot {
    dataset: &'static str,
    repository_root: String,
    source_revision: String,
    affiliations: Vec<SnapshotAffiliation>,
    tides: Value,
}

#[derive(Serialize)]
struct SnapshotAffiliation {
    id: String,
    name: String,
    atlas_card_theme: String,
    tide_ids: Vec<String>,
}

fn repository_at(path: &Path) -> Option<PathBuf> {
    let candidate = if path.is_file() { path.parent()? } else { path };
    candidate
        .ancestors()
        .find(|ancestor| {
            ancestor.join("data/affiliations.ron").is_file()
                && ancestor.join("data/game-data-manifest.ron").is_file()
                && ancestor.join("scripts/game-data-pipeline.mjs").is_file()
        })
        .map(Path::to_path_buf)
}

fn discover_repository() -> Result<PathBuf, String> {
    #[cfg(feature = "e2e")]
    if let Some(path) = std::env::var_os("TABULA_E2E_REPOSITORY_ROOT") {
        return repository_at(Path::new(&path)).ok_or_else(|| {
            "TABULA_E2E_REPOSITORY_ROOT is not a Dreamtides repository".to_string()
        });
    }
    let current = std::env::current_dir().map_err(|error| error.to_string())?;
    repository_at(&current).ok_or_else(|| "Choose a Dreamtides repository to begin".into())
}

fn source_revision(root: &Path) -> Result<String, String> {
    let output = Command::new("node")
        .args(["scripts/game-data-pipeline.mjs", "revision", "--root"])
        .arg(root)
        .args(["--dataset", "affiliations"])
        .current_dir(root)
        .output()
        .map_err(|error| format!("Read source revision: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr)
            .lines()
            .last()
            .unwrap_or("Source revision failed")
            .to_owned());
    }
    let report: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Parse source revision: {error}"))?;
    report
        .get("sourceRevision")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| "Source revision report is missing sourceRevision".into())
}

fn snapshot(root: &Path) -> Result<EditorSnapshot, String> {
    let source = fs::read_to_string(root.join("data/affiliations.ron"))
        .map_err(|error| format!("Read affiliations.ron: {error}"))?;
    let catalog: AffiliationCatalog =
        ron::from_str(&source).map_err(|error| format!("Parse affiliations.ron: {error}"))?;
    affiliations::validate(&catalog)
        .map_err(|error| format!("Validate affiliations.ron: {error:#}"))?;
    let tide_catalog: Value = serde_json::from_slice(
        &fs::read(root.join("public/tides4-data.json"))
            .map_err(|error| format!("Read tide catalog: {error}"))?,
    )
    .map_err(|error| format!("Parse tide catalog: {error}"))?;
    let tides = tide_catalog
        .get("tides")
        .cloned()
        .ok_or_else(|| "Tide catalog is missing tides".to_string())?;
    let affiliations = catalog
        .affiliations
        .into_iter()
        .map(|affiliation| {
            Ok(SnapshotAffiliation {
                id: affiliation.id.to_string(),
                name: source_text(&affiliation.name).map_err(|error| error.to_string())?,
                atlas_card_theme: source_text(&affiliation.atlas_card_theme)
                    .map_err(|error| error.to_string())?,
                tide_ids: affiliation
                    .tide_ids
                    .into_iter()
                    .map(|id| id.to_string())
                    .collect(),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(EditorSnapshot {
        dataset: "affiliations",
        repository_root: root.display().to_string(),
        source_revision: source_revision(root)?,
        affiliations,
        tides,
    })
}

fn log_event(root: &Path, event: &str, operation: Option<&Value>, outcome: &str) {
    let path = root.join("logs/tabula-log.jsonl");
    let _ = fs::create_dir_all(path.parent().unwrap());
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let record = serde_json::json!({
            "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|value| value.as_secs()).unwrap_or_default(),
            "event": event, "dataset": "affiliations", "operation": operation.and_then(|value| value.get("operation")), "outcome": outcome,
        });
        let _ = writeln!(file, "{record}");
    }
}

fn log_operations_event(root: &Path, operations: &[Value], outcome: &str) {
    let path = root.join("logs/tabula-log.jsonl");
    let _ = fs::create_dir_all(path.parent().unwrap());
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let kinds = operations
            .iter()
            .filter_map(|operation| operation.get("operation").and_then(Value::as_str))
            .collect::<Vec<_>>();
        let record = serde_json::json!({
            "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|value| value.as_secs()).unwrap_or_default(),
            "event": "operations_saved", "dataset": "affiliations", "operation_count": operations.len(), "operation_kinds": kinds, "outcome": outcome,
        });
        let _ = writeln!(file, "{record}");
    }
}

#[tauri::command]
fn load_editor_snapshot(state: State<'_, Repository>) -> Result<EditorSnapshot, String> {
    let mut repository = state
        .0
        .lock()
        .map_err(|_| "Repository state is unavailable")?;
    let root = match repository.clone() {
        Some(root) => root,
        None => discover_repository()?,
    };
    *repository = Some(root.clone());
    let result = snapshot(&root);
    log_event(
        &root,
        "snapshot_loaded",
        None,
        if result.is_ok() { "success" } else { "failure" },
    );
    result
}

#[tauri::command]
fn open_repository(path: String, state: State<'_, Repository>) -> Result<EditorSnapshot, String> {
    let root = repository_at(Path::new(&path))
        .ok_or_else(|| "The selected directory is not a Dreamtides repository".to_string())?;
    let result = snapshot(&root)?;
    *state
        .0
        .lock()
        .map_err(|_| "Repository state is unavailable")? = Some(root.clone());
    log_event(&root, "repository_opened", None, "success");
    Ok(result)
}

#[tauri::command]
fn save_editor_operations(
    operations: Vec<Value>,
    expected_source_revision: String,
    state: State<'_, Repository>,
) -> Result<EditorSnapshot, String> {
    let root = state
        .0
        .lock()
        .map_err(|_| "Repository state is unavailable")?
        .clone()
        .ok_or_else(|| "Open a repository before saving".to_string())?;
    let mut child = Command::new("node")
        .args(["scripts/game-data-pipeline.mjs", "edit", "--root"])
        .arg(&root)
        .args([
            "--dataset",
            "affiliations",
            "--expected-source-revision",
            &expected_source_revision,
        ])
        .current_dir(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Start game-data pipeline: {error}"))?;
    child
        .stdin
        .take()
        .unwrap()
        .write_all(serde_json::to_string(&operations).unwrap().as_bytes())
        .map_err(|error| format!("Write operation: {error}"))?;
    let output = child
        .wait_with_output()
        .map_err(|error| format!("Wait for game-data pipeline: {error}"))?;
    if !output.status.success() {
        let diagnostic = String::from_utf8_lossy(&output.stderr)
            .lines()
            .last()
            .unwrap_or("Save failed")
            .to_owned();
        log_operations_event(&root, &operations, "failure");
        return Err(diagnostic);
    }
    log_operations_event(&root, &operations, "success");
    snapshot(&root)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Repository::default())
        .invoke_handler(tauri::generate_handler![
            load_editor_snapshot,
            open_repository,
            save_editor_operations
        ]);
    #[cfg(feature = "e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());
    builder
        .run(tauri::generate_context!())
        .expect("error while running Tabula");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_preserves_canonical_affiliation_field_names() {
        let value = serde_json::to_value(EditorSnapshot {
            dataset: "affiliations",
            repository_root: "/fixture".into(),
            source_revision: "revision".into(),
            affiliations: Vec::new(),
            tides: Value::Array(Vec::new()),
        })
        .unwrap();
        assert!(value["affiliations"].is_array());
        assert!(value["tides"].is_array());
    }

    #[test]
    fn finds_repository_from_nested_path() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir_all(temp.path().join("data")).unwrap();
        fs::create_dir_all(temp.path().join("scripts/nested")).unwrap();
        fs::write(temp.path().join("data/affiliations.ron"), "").unwrap();
        fs::write(temp.path().join("data/game-data-manifest.ron"), "").unwrap();
        fs::write(temp.path().join("scripts/game-data-pipeline.mjs"), "").unwrap();
        assert_eq!(
            repository_at(&temp.path().join("scripts/nested")),
            Some(temp.path().to_path_buf())
        );
    }
}
