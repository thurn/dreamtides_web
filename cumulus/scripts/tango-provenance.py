#!/usr/bin/env python3

import argparse, json, subprocess, sys
from pathlib import Path

def run(repo, *args): return subprocess.check_output(["git", *args], cwd=repo, text=True).strip()

def main():
    p=argparse.ArgumentParser(); p.add_argument("--repo-root", required=True); p.add_argument("--summary", required=True); p.add_argument("--expect-head"); a=p.parse_args()
    repo=Path(a.repo_root); summary=Path(a.summary); head=run(repo,"rev-parse","HEAD")
    dirty=subprocess.check_output(["git","status","--porcelain=v1","--untracked-files=all"],cwd=repo,text=True).splitlines()
    reason=None
    if a.expect_head and head != a.expect_head: reason=f"HEAD changed: expected {a.expect_head}, found {head}"
    elif dirty: reason="working tree is not clean"
    if reason:
        summary.parent.mkdir(parents=True,exist_ok=True)
        summary.write_text(json.dumps({"schemaVersion":1,"overall":"failed","failedStage":"clean-head-provenance","gitCommit":head,"reason":reason,"dirtyPaths":dirty},indent=2)+"\n")
        print(f"tango-provenance: {reason}",file=sys.stderr); return 1
    print(head); return 0
if __name__ == "__main__": raise SystemExit(main())
