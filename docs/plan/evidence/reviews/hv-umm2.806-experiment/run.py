import subprocess,os,sys,json,time,hashlib,datetime,resource,pathlib
root=pathlib.Path('/Users/dthurn/dreamtides_web/.worktrees/codex-d19-qa-slots806')
out=pathlib.Path(__file__).parent
name=sys.argv[1]; cmd=sys.argv[2:]
sha=lambda b:hashlib.sha256(b).hexdigest()
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
def ps():
 return subprocess.run(['ps','-axo','pid=,ppid=,pgid=,etime=,time=,command='],capture_output=True,text=True).stdout
files=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
inputs={p:sha((root/p).read_bytes()) for p in files if p and (root/p).is_file()}
for p in ['node_modules/.package-lock.json','node_modules/vitest/vitest.mjs','node_modules/vitest/package.json','node_modules/vite/package.json']:
 inputs[p]=sha((root/p).read_bytes())
(out/(name+'.inputs.json')).write_text(json.dumps(inputs,indent=2)+'\n')
env=os.environ.copy();env['JOURNEY_TEST_WORKERS']='2'
load=subprocess.check_output(['sysctl','-n','vm.loadavg'],text=True).strip()
launch={'command':cmd,'cwd':str(root),'start':now(),'loadStart':load,'workers':2,'node':subprocess.check_output(['node','--version'],text=True).strip(),'npm':subprocess.check_output(['npm','--version'],text=True).strip(),'environment':{k:v for k,v in env.items() if k.startswith(('JOURNEY_','VITEST','NODE_','CI'))},'inputsSHA256':sha((out/(name+'.inputs.json')).read_bytes()),'beforePs':ps()}
start=time.monotonic();before=resource.getrusage(resource.RUSAGE_CHILDREN)
with (out/(name+'.stdout')).open('wb') as stdout,(out/(name+'.stderr')).open('wb') as stderr:
 child=subprocess.Popen(['/usr/bin/time','-l',*cmd],cwd=root,env=env,stdout=stdout,stderr=stderr,start_new_session=True)
 launch.update(pid=child.pid,pgid=os.getpgid(child.pid));(out/(name+'.launch.json')).write_text(json.dumps(launch,indent=2)+'\n')
 seen={};samples=0
 while child.poll() is None:
  for line in ps().splitlines():
   cols=line.strip().split(None,5)
   if len(cols)>=3 and cols[2]==str(child.pid):seen[cols[0]]=line.strip()
  samples+=1;time.sleep(.2)
 exitcode=child.wait()
wall=time.monotonic()-start;after=resource.getrusage(resource.RUSAGE_CHILDREN)
post=ps();alive=[line.strip() for line in post.splitlines() if len(line.split())>=3 and line.split()[2]==str(child.pid)]
receipt={'name':name,'command':cmd,'start':launch['start'],'end':now(),'wallSeconds':wall,'actualExit':exitcode,'pid':child.pid,'pgid':child.pid,'loadStart':load,'loadEnd':subprocess.check_output(['sysctl','-n','vm.loadavg'],text=True).strip(),'aggregateChildUserS':after.ru_utime-before.ru_utime,'aggregateChildSystemS':after.ru_stime-before.ru_stime,'samplingQualification':'0.2s process snapshots are observational; native time-l raw stderr carries command resource totals. Snapshot calls add wall overhead. No timing assertion in CI.','samples':samples,'observedOwnedGroupProcesses':seen,'ownedGroupAliveAfter':alive,'afterPs':post,'stdoutSHA256':sha((out/(name+'.stdout')).read_bytes()),'stderrSHA256':sha((out/(name+'.stderr')).read_bytes()),'inputsSHA256':launch['inputsSHA256']}
(out/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k not in ['beforePs','afterPs','observedOwnedGroupProcesses']},indent=2))
sys.exit(exitcode)
