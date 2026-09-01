const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const assert=require('assert');
const {normalizeEol}=require('./test-utils');
const {WorktreeManager,git}=require('../electron/worktree-manager');
const {ParallelLaneManager,analyzePatchConflict}=require('../electron/parallel-lane-manager');

(async()=>{
  const conflict=analyzePatchConflict(
`diff --git a/src/a.txt b/src/a.txt
--- a/src/a.txt
+++ b/src/a.txt
@@ -2,1 +2,1 @@
-old
+new
`,
`diff --git a/src/a.txt b/src/a.txt
--- a/src/a.txt
+++ b/src/a.txt
@@ -2,1 +2,1 @@
-old
+other
`);
  assert.equal(conflict.conflict,true);
  const disjoint=analyzePatchConflict(
`diff --git a/src/a.txt b/src/a.txt
--- a/src/a.txt
+++ b/src/a.txt
@@ -2,1 +2,1 @@
-old
+new
`,
`diff --git a/src/a.txt b/src/a.txt
--- a/src/a.txt
+++ b/src/a.txt
@@ -20,1 +20,1 @@
-old
+other
`);
  assert.equal(disjoint.conflict,false);

  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'abdx-lanes-repo-'));
  const state=await fsp.mkdtemp(path.join(os.tmpdir(),'abdx-lanes-state-'));
  await git(root,['init']);
  await git(root,['config','user.email','test@abdulkarem.local']);
  await git(root,['config','user.name','ABDULKAREM AI X Test']);
  await git(root,['config','core.autocrlf','true']);
  await git(root,['config','core.eol','crlf']);
  await fsp.mkdir(path.join(root,'src'),{recursive:true});
  await fsp.writeFile(path.join(root,'src','a.txt'),'a0\n','utf8');
  await fsp.writeFile(path.join(root,'src','b.txt'),'b0\n','utf8');
  await fsp.writeFile(path.join(root,'.gitignore'),'node_modules/\n','utf8');
  await git(root,['add','-A']); await git(root,['commit','-m','initial']);
  await fsp.mkdir(path.join(root,'node_modules','x'),{recursive:true});
  await fsp.writeFile(path.join(root,'node_modules','x','marker'),'ok','utf8');

  const wm=new WorktreeManager({baseDir:path.join(state,'worktrees'),maxPatchBytes:8*1024*1024,requireClean:true});
  await wm.init();
  const lm=new ParallelLaneManager({baseDir:path.join(state,'lanes'),worktreeManager:wm,maxBundleBytes:16*1024*1024});
  await lm.init();
  const prep=await lm.prepareLanes(root,2,{reason:'parallel test'});
  assert.equal(prep.success,true); assert.equal(prep.lanes.length,2);
  const [l1,l2]=prep.lanes;
  assert.notEqual(l1.id,l2.id);
  assert.equal((await wm.list()).active.length,2);
  await fsp.writeFile(path.join(l1.sandboxWorkspace,'src','a.txt'),'a1\n','utf8');
  await fsp.writeFile(path.join(l2.sandboxWorkspace,'src','b.txt'),'b2\n','utf8');
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'src','a.txt'),'utf8')),normalizeEol('a0\n'));
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'src','b.txt'),'utf8')),normalizeEol('b0\n'));
  await wm.exportPatch(l1.id,{success:true,score:95});
  await wm.exportPatch(l2.id,{success:true,score:93});
  const plan=await lm.planMerge([l1.id,l2.id]);
  assert.equal(plan.mergeable,true); assert.equal(plan.conflicts.length,0);
  const bundle=await lm.prepareBundle([l1.id,l2.id],{test:true});
  assert.equal(bundle.status,'VERIFYING');
  assert.equal(normalizeEol(await fsp.readFile(path.join(bundle.integrationWorkspace,'src','a.txt'),'utf8')),normalizeEol('a1\n'));
  assert.equal(normalizeEol(await fsp.readFile(path.join(bundle.integrationWorkspace,'src','b.txt'),'utf8')),normalizeEol('b2\n'));
  // Original is still untouched until bundle application.
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'src','a.txt'),'utf8')),normalizeEol('a0\n'));
  const sealed=await lm.sealBundle(bundle.id,{success:true,gate:'test'});
  assert.equal(sealed.status,'BUNDLE_READY');
  assert.equal(sealed.patch.files.length,2);
  await lm.applyBundle(bundle.id);
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'src','a.txt'),'utf8')),normalizeEol('a1\n'));
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'src','b.txt'),'utf8')),normalizeEol('b2\n'));
  await lm.markCommitted(bundle.id,{test:true});
  const status=await lm.list();
  assert(status.bundles.some(x=>x.id===bundle.id&&x.status==='COMMITTED'));
  await git(root,['add','-A']);await git(root,['commit','-m','merged lanes']);

  // Conflicting lanes must fail closed before bundle creation.
  const prep2=await lm.prepareLanes(root,2,{reason:'conflict test'});
  assert.equal(prep2.success,true);
  await fsp.writeFile(path.join(prep2.lanes[0].sandboxWorkspace,'src','a.txt'),'conflict-one\n','utf8');
  await fsp.writeFile(path.join(prep2.lanes[1].sandboxWorkspace,'src','a.txt'),'conflict-two\n','utf8');
  await wm.exportPatch(prep2.lanes[0].id,{success:true});
  await wm.exportPatch(prep2.lanes[1].id,{success:true});
  const cplan=await lm.planMerge(prep2.lanes.map(x=>x.id));
  assert.equal(cplan.mergeable,false);assert(cplan.conflicts.length>=1);
  let blocked=false;try{await lm.prepareBundle(prep2.lanes.map(x=>x.id));}catch(e){blocked=e.code==='LANE_PATCH_CONFLICT';}
  assert.equal(blocked,true);
  for(const lane of prep2.lanes)await wm.abort(lane.id,'test cleanup');

  await fsp.rm(root,{recursive:true,force:true}); await fsp.rm(state,{recursive:true,force:true});
  console.log('parallel-lane-manager.test.js PASS');
})().catch(e=>{console.error(e);process.exit(1);});
