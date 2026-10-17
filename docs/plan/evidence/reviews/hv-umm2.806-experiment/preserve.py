from pathlib import Path
import subprocess,json,hashlib,re,datetime
root=Path('/Users/dthurn/dreamtides_web/.worktrees/codex-d19-qa-slots806');scratch=Path(__file__).parent;ev=root/'docs/plan/evidence';base='7bd468f2d85676ce78eede18598b2074378462cb'
sha=lambda b:hashlib.sha256(b).hexdigest()
tracked=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root).decode().strip()==base
changed=subprocess.check_output(['git','diff','--name-only',base],cwd=root).decode().splitlines()
assert changed==['docs/plan/evidence/introspection.jsonl'],changed
old=subprocess.check_output(['git','show',base+':docs/plan/evidence/introspection.jsonl'],cwd=root)
current=(ev/'introspection.jsonl').read_bytes();assert current.startswith(old)
lines=current[len(old):].decode().splitlines();assert len(lines)==1
entry=json.loads(lines[0]);assert entry['phase']==5 and entry['tag']=='d19-qa-slot-redundant-lifecycles' and 'exact source rollback' in entry['reason']
source='scripts/qa/run-scenario-slots.test.mjs';original=(root/source).read_bytes();proto=(scratch/'prototype-source.mjs.txt').read_bytes()
assert sha(original)=='1a6264e17d284b8309dfaa1cb87960bf14edb356f244d7e0ef0d90a2835c8410'
assert sha(proto)=='2e0eb51909bfa7717ccd82725c0ac8000940d1222b8265e9faf7386db50e6aa3'
b=original.decode();p=proto.decode();weak='  it("keeps same-bead same-label runs in distinct evidence namespaces"';strong='  it("preserves legacy root evidence';nextcase='  it("fails a session whose port is answered outside'
b=b[:b.index(weak)]+b[b.index(strong):];b=b.replace(', [65500, [5174, 5274]]','')
mask=lambda s:s[:s.index(strong)]+'STRONG_CASE_BODY\n'+s[s.index(nextcase):]
assert mask(b)==mask(p)
assert p.count('it(')==original.decode().count('it(')-1
inputs=[json.loads((scratch/(name+'.inputs.json')).read_text()) for name in ['baseline','prototype']]
assert inputs[0].keys()==inputs[1].keys();assert [x for x in inputs[0] if inputs[0][x]!=inputs[1][x]]==[source]
commands={}
for name in ['baseline','prototype','review','knip','full']:
 r=json.loads((scratch/(name+'.receipt.json')).read_text());assert r['actualExit']==0 and r['ownedGroupAliveAfter']==[]
 for suffix,key in [('stdout','stdoutSHA256'),('stderr','stderrSHA256'),('inputs.json','inputsSHA256')]:assert sha((scratch/(name+'.'+suffix)).read_bytes())==r[key]
 stderr=(scratch/(name+'.stderr')).read_text();times=re.findall(r'([0-9.]+) real\s+([0-9.]+) user\s+([0-9.]+) sys',stderr);assert times
 commands[name]={'actualExit':r['actualExit'],'pid':r['pid'],'pgid':r['pgid'],'ownedProcessesObserved':len(r['observedOwnedGroupProcesses']),'ownedGroupAliveAfter':r['ownedGroupAliveAfter'],'nativeTimeL':{'realS':float(times[-1][0]),'userS':float(times[-1][1]),'systemS':float(times[-1][2])},'receiptSHA256':sha((scratch/(name+'.receipt.json')).read_bytes()),'stdoutSHA256':r['stdoutSHA256'],'stderrSHA256':r['stderrSHA256'],'inputsSHA256':r['inputsSHA256']}
for name,count in [('baseline',13),('prototype',11)]:assert re.search(r'Tests\s+'+str(count)+r' passed', (scratch/(name+'.stdout')).read_text())
full=(scratch/'full.stdout').read_text();assert 'test finished' in full and '(exit 0)' in full
sage=json.loads((scratch/'sage-preservation.json').read_text())
for name,expected in sage['artifacts'].items():assert sha((ev/'reviews/hv-umm2.806-sage270'/name).read_bytes())==expected
untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z'],cwd=root).decode().split('\0')
assert all(not x or ('/hv-umm2.806' in x and x.startswith('docs/plan/evidence/')) for x in untracked),untracked
final_ps=subprocess.check_output(['ps','-axo','pid=,ppid=,pgid=,lstart=,command='],text=True)
(scratch/'final-process-snapshot.txt').write_text(final_ps)
owned_pgs={str(v['pgid']) for v in commands.values()}
pg_matches=[line for line in final_ps.splitlines() if len(line.split())>=3 and line.split()[2] in owned_pgs]
assert pg_matches==[],pg_matches
fixture_roots=set()
for name in commands:
 fixture_roots.update(re.findall(r'(/private/var/folders/[^/]+/[^/]+/T/dreamtides-[^/\s"\\]+)',(scratch/(name+'.stderr')).read_text()))
root_matches=[line for line in final_ps.splitlines() if str(root) in line or any(x in line for x in fixture_roots)]
assert root_matches==[],root_matches
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base':base,'targetSourceSHA256':sha(original),'sourceRollback':'EXACT','baseTrackedFileCount':len([x for x in tracked if x]),'onlyTrackedDiff':changed,'finalProcessSnapshotSHA256':sha((scratch/'final-process-snapshot.txt').read_bytes()),'ownedPGs':sorted(owned_pgs),'ownedPGsAliveAtFinal':pg_matches,'ownedFixtureRootCount':len(fixture_roots),'ownedRootProcessesAliveAtFinal':root_matches,'ledgerAppendLines':1,'prototypeOnlyAllowedBodiesVerified':True,'baselinePrototypeInputDelta':[source],'commandProofs':commands,'sage270PreservedFull':sage['artifacts'],'noCausalOrFullsuiteAcceptance':True,'D19Unwaived':True,'verificationScope':'Byte preservation, allowed prototype regions, native receipts, aggregate CPU and post-command process-group emptiness. Snapshot process monitoring is observational and not an independent proof against escaped foreign groups; unmodified test containment joins direct owned children and actual signal descendants.'}
(scratch/'preservation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
