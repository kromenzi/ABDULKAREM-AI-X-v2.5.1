const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const assert=require('assert');
const {WorktreeManager,git}=require('../electron/worktree-manager');
const {ParallelLaneManager}=require('../electron/parallel-lane-manager');

(async()=>{
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'abdx-region-repo-'));
  const state=await fsp.mkdtemp(path.join(os.tmpdir(),'abdx-region-state-'));
  await git(root,['init']); await git(root,['config','user.email','test@abdulkarem.local']); await git(root,['config','user.name','ABDULKAREM AI X Test']);
  const lines=Array.from({length:80},(_,i)=>`line-${i+1}`); await fsp.writeFile(path.join(root,'shared.txt'),lines.join('\n')+'\n','utf8');
  await git(root,['add','-A']); await git(root,['commit','-m','initial']);
  const wm=new WorktreeManager({baseDir:path.join(state,'wt'),requireClean:true}); await wm.init();
  const lm=new ParallelLaneManager({baseDir:path.join(state,'lanes'),worktreeManager:wm}); await lm.init();
  const prep=await lm.prepareLanes(root,2,{reason:'region merge'}); assert.equal(prep.success,true);
  const a=lines.slice();a[4]='lane-A-line-5'; await fsp.writeFile(path.join(prep.lanes[0].sandboxWorkspace,'shared.txt'),a.join('\n')+'\n','utf8');
  const b=lines.slice();b[69]='lane-B-line-70'; await fsp.writeFile(path.join(prep.lanes[1].sandboxWorkspace,'shared.txt'),b.join('\n')+'\n','utf8');
  await wm.exportPatch(prep.lanes[0].id,{success:true}); await wm.exportPatch(prep.lanes[1].id,{success:true});
  const plan=await lm.planMerge(prep.lanes.map(x=>x.id)); assert.equal(plan.mergeable,true);
  assert.equal(plan.pairs[0].sharedFiles.includes('shared.txt'),true); assert.equal(plan.pairs[0].conflict,false);
  const bundle=await lm.prepareBundle(prep.lanes.map(x=>x.id));
  const integrated=(await fsp.readFile(path.join(bundle.integrationWorkspace,'shared.txt'),'utf8')).trim().split(/\r?\n/);
  assert.equal(integrated[4],'lane-A-line-5'); assert.equal(integrated[69],'lane-B-line-70');
  await lm.sealBundle(bundle.id,{success:true}); await lm.applyBundle(bundle.id); await lm.markCommitted(bundle.id);
  const original=(await fsp.readFile(path.join(root,'shared.txt'),'utf8')).trim().split(/\r?\n/); assert.equal(original[4],'lane-A-line-5'); assert.equal(original[69],'lane-B-line-70');
  await fsp.rm(root,{recursive:true,force:true}); await fsp.rm(state,{recursive:true,force:true}); console.log('parallel-lane-region-merge.test.js PASS');
})().catch(e=>{console.error(e);process.exit(1);});
