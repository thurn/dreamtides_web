#!/usr/bin/env python3
import json, subprocess, tempfile
from pathlib import Path
tool=Path(__file__).with_name("cumulus-provenance.py")
with tempfile.TemporaryDirectory() as t:
 r=Path(t); subprocess.run(["git","init","-q"],cwd=r,check=True); subprocess.run(["git","config","user.email","fixture@example.com"],cwd=r,check=True); subprocess.run(["git","config","user.name","Fixture"],cwd=r,check=True)
 (r/"tracked").write_text("clean\n"); subprocess.run(["git","add","tracked"],cwd=r,check=True); subprocess.run(["git","commit","-qm","fixture"],cwd=r,check=True)
 s=r/"summary.json"; subprocess.run(["python3",str(tool),"--repo-root",str(r),"--summary",str(s)],check=True,stdout=subprocess.DEVNULL); print("PASS: accepted clean HEAD")
 (r/"tracked").write_text("dirty\n"); result=subprocess.run(["python3",str(tool),"--repo-root",str(r),"--summary",str(s)],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
 assert result.returncode and "working tree is not clean" in result.stderr; data=json.loads(s.read_text()); assert data["overall"]=="failed" and data["failedStage"]=="clean-head-provenance" and data["dirtyPaths"]; print("PASS: rejected tracked dirty tree with failed summary")
 subprocess.run(["git","restore","tracked"],cwd=r,check=True); (r/"untracked").write_text("dirty\n"); result=subprocess.run(["python3",str(tool),"--repo-root",str(r),"--summary",str(s)],stdout=subprocess.DEVNULL); assert result.returncode; print("PASS: rejected untracked dirty tree")
print("3 provenance checks passed; 0 failed")
