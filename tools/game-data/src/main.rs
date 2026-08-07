mod compiler;
mod editor;
mod manifest;
mod models;

use std::io::{self, Read};
use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use compiler::{CompileRequest, compile, migrate};
use manifest::Manifest;

#[derive(Debug, Parser)]
#[command(
    name = "game-data",
    version,
    about = "Dreamtides RON game-data compiler"
)]
struct Cli {
    #[arg(long, default_value = ".")]
    root: PathBuf,
    #[arg(long, global = true)]
    json: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    List,
    Compile {
        #[arg(long)]
        dataset: Option<String>,
        #[arg(long)]
        staging_root: PathBuf,
    },
    Check {
        #[arg(long)]
        dataset: Option<String>,
    },
    Migrate {
        #[arg(long)]
        dataset: String,
        #[arg(long)]
        output: Option<PathBuf>,
    },
    StageEdit {
        #[arg(long)]
        staging_root: PathBuf,
    },
}

fn main() {
    if let Err(error) = run() {
        let message = format!("{error:#}");
        let diagnostic = serde_json::json!({
            "ok": false,
            "error": {
                "code": diagnostic_code(&message),
                "message": message,
            }
        });
        eprintln!("{}", serde_json::to_string(&diagnostic).unwrap());
        std::process::exit(1);
    }
}

fn diagnostic_code(message: &str) -> &'static str {
    const CODES: &[&str] = &[
        "STALE_SOURCE",
        "RECORD_NOT_FOUND",
        "FIELD_NOT_APPLICABLE",
        "INVALID_EDIT",
        "MALFORMED_SOURCE",
        "COMPATIBILITY_VALIDATION_FAILED",
        "PUBLICATION_FAILED",
    ];
    CODES
        .iter()
        .copied()
        .find(|code| message.contains(&format!("{code}:")))
        .unwrap_or("GAME_DATA_FAILED")
}

fn run() -> Result<()> {
    let cli = Cli::parse();
    let root = cli
        .root
        .canonicalize()
        .with_context(|| format!("repository root does not exist: {}", cli.root.display()))?;
    let manifest = Manifest::load(&root)?;

    match cli.command {
        Command::List => {
            println!(
                "{}",
                serde_json::to_string_pretty(&manifest.resolved(&root))?
            );
        }
        Command::Compile {
            dataset,
            staging_root,
        } => {
            let report = compile(CompileRequest {
                root: &root,
                manifest: &manifest,
                dataset: dataset.as_deref(),
                staging_root: &staging_root,
            })?;
            print_report(&report, cli.json)?;
        }
        Command::Check { dataset } => {
            let temporary = tempfile::Builder::new()
                .prefix("dreamtides-game-data-check-")
                .tempdir()?;
            let report = compile(CompileRequest {
                root: &root,
                manifest: &manifest,
                dataset: dataset.as_deref(),
                staging_root: temporary.path(),
            })?;
            if report.datasets.iter().any(|entry| entry.changed) {
                anyhow::bail!("one or more generated TOML outputs are stale");
            }
            print_report(&report, cli.json)?;
        }
        Command::Migrate { dataset, output } => {
            let result = migrate(&root, &manifest, &dataset, output.as_deref())?;
            print_report(&result, cli.json)?;
        }
        Command::StageEdit { staging_root } => {
            let mut body = String::new();
            io::stdin().read_to_string(&mut body)?;
            let report = compiler::stage_edit(&root, &manifest, &staging_root, &body)?;
            print_report(&report, true)?;
        }
    }
    Ok(())
}

fn print_report(value: &impl serde::Serialize, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string(value)?);
    } else {
        println!("{}", serde_json::to_string_pretty(value)?);
    }
    Ok(())
}
