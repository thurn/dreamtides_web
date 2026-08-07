use std::fs;
use std::path::{Path, PathBuf};

fn collect_files(path: &Path, files: &mut Vec<PathBuf>) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    if metadata.is_file() {
        files.push(path.to_owned());
        return;
    }
    let mut entries = fs::read_dir(path)
        .expect("read compiler source directory")
        .map(|entry| entry.expect("read compiler source entry").path())
        .collect::<Vec<_>>();
    entries.sort();
    for entry in entries {
        collect_files(&entry, files);
    }
}

fn main() {
    let manifest_dir = PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let mut files = Vec::new();
    collect_files(&manifest_dir.join("src"), &mut files);
    files.push(manifest_dir.join("Cargo.toml"));
    files.push(manifest_dir.join("Cargo.lock"));
    files.sort();

    // FNV-1a is used only as a deterministic build identity. Content hashes in
    // generated headers use SHA-256 in the runtime binary.
    let mut hash = 0xcbf29ce484222325_u64;
    for file in files {
        println!("cargo:rerun-if-changed={}", file.display());
        if let Ok(bytes) = fs::read(&file) {
            for byte in file.to_string_lossy().bytes().chain(bytes) {
                hash ^= u64::from(byte);
                hash = hash.wrapping_mul(0x100000001b3);
            }
        }
    }
    println!("cargo:rustc-env=GAME_DATA_BUILD_VERSION={hash:016x}");
}
