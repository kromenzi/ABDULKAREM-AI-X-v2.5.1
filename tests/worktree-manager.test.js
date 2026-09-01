const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const assert=require('assert');
const {normalizeEol}=require('./test-utils');
const {WorktreeManager,git}=require('../electron/worktree-manager');

(async()=>{
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'abdx-wt-repo-'));
  const state=await fsp.mkdtemp(path.join(os.tmpdir(),'abdx-wt-state-'));
  await git(root,['init']);
  await git(root,['config','user.email','test@abdulkarem.local']);
  await git(root,['config','user.name','ABDULKAREM AI X Test']);
  await git(root,['config','core.autocrlf','true']);
  await git(root,['config','core.eol','crlf']);
  await fsp.mkdir(path.join(root,'src'),{recursive:true});
  await fsp.writeFile(path.join(root,'src','a.txt'),'alpha\n','utf8');
  await fsp.writeFile(path.join(root,'remove.txt'),'remove me\n','utf8');
  await fsp.writeFile(path.join(root,'.gitignore'),'node_modules/\n','utf8');
  await git(root,['add','-A']);
  await git(root,['commit','-m','initial']);
  await fsp.mkdir(path.join(root,'node_modules','example'),{recursive:true});
  await fsp.writeFile(path.join(root,'node_modules','example','marker.txt'),'runtime dependency\n','utf8');

  const wm=new WorktreeManager({baseDir:state,maxPatchBytes:4*1024*1024,retention:10,requireClean:true});
  await wm.init();
  const p=await wm.prepare(root,{reason:'test merge'});
  assert.equal(p.success,true);
  assert.equal(p.status,'ACTIVE');
  assert.notEqual(path.resolve(p.sandboxWorkspace),path.resolve(root));
  assert(p.runtimeLinks.some(x=>x.name==='node_modules'));
  assert.equal(normalizeEol(await fsp.readFile(path.join(p.sandboxWorkspace,'node_modules','example','marker.txt'),'utf8')),normalizeEol('runtime dependency\n'));
  await fsp.writeFile(path.join(p.sandboxWorkspace,'src','a.txt'),'verified change\n','utf8');
  await fsp.writeFile(path.join(p.sandboxWorkspace,'new.txt'),'new file\n','utf8');
  await fsp.rm(path.join(p.sandboxWorkspace,'remove.txt'));
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'src','a.txt'),'utf8')),normalizeEol('alpha\n'));
  assert.equal(fs.existsSync(path.join(root,'new.txt')),false);

  const exp=await wm.exportPatch(p.id,{success:true,gate:'test'});
  assert.equal(fs.existsSync(path.join(p.sandboxWorkspace,'node_modules')),false);
  assert.equal(exp.status,'PATCH_READY');
  assert.equal(exp.patch.files.length,3);
  const preview=await wm.preview(p.id);
  assert(preview.text.includes('verified change'));
  assert(preview.text.includes('new.txt'));

  const merged=await wm.applyPatch(p.id);
  assert.equal(merged.status,'MERGED');
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'src','a.txt'),'utf8')),normalizeEol('verified change\n'));
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'new.txt'),'utf8')),normalizeEol('new file\n'));
  assert.equal(fs.existsSync(path.join(root,'remove.txt')),false);
  await wm.cleanup(p.id,{keepRecord:true});
  const list=await wm.list();
  assert(list.sandboxes.some(x=>x.id===p.id&&x.mergedAt));
  await git(root,['add','-A']);
  await git(root,['commit','-m','accept merged patch']);

  // Dirty workspace must not be silently isolated because the sandbox would miss user's uncommitted state.
  await fsp.writeFile(path.join(root,'src','a.txt'),'dirty original\n','utf8');
  const dirty=await wm.prepare(root,{reason:'dirty fallback'});
  assert.equal(dirty.success,false);
  assert.equal(dirty.reason,'workspace-dirty');
  await git(root,['checkout','--','src/a.txt']);

  // If original changes after sandbox creation, merge must fail closed.
  const p2=await wm.prepare(root,{reason:'drift guard'});
  assert.equal(p2.success,true);
  await fsp.writeFile(path.join(p2.sandboxWorkspace,'src','a.txt'),'sandbox second\n','utf8');
  await wm.exportPatch(p2.id,{success:true});
  await fsp.writeFile(path.join(root,'src','a.txt'),'external change\n','utf8');
  let driftBlocked=false;
  try{await wm.applyPatch(p2.id);}catch(e){driftBlocked=e.code==='WT_ORIGINAL_CHANGED';}
  assert.equal(driftBlocked,true);
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'src','a.txt'),'utf8')),normalizeEol('external change\n'));
  await wm.abort(p2.id,'test cleanup');
  await git(root,['checkout','--','src/a.txt']);

  // Sandbox history rewrite must never be patch-merged.
  const p3=await wm.prepare(root,{reason:'head rewrite guard'});
  await fsp.writeFile(path.join(p3.sandboxWorkspace,'src','a.txt'),'commit inside sandbox\n','utf8');
  await git(p3.sandboxWorkspace,['add','-A']);
  await git(p3.sandboxWorkspace,['config','user.email','test@abdulkarem.local']);
  await git(p3.sandboxWorkspace,['config','user.name','ABDULKAREM AI X Test']);
  await git(p3.sandboxWorkspace,['commit','-m','unexpected sandbox commit']);
  let headBlocked=false;
  try{await wm.exportPatch(p3.id,{success:true});}catch(e){headBlocked=/HEAD changed/.test(e.message);}
  assert.equal(headBlocked,true);
  await wm.abort(p3.id,'test cleanup');

  await fsp.rm(root,{recursive:true,force:true});
  await fsp.rm(state,{recursive:true,force:true});
  console.log('worktree-manager.test.js PASS');
})().catch(e=>{console.error(e);process.exit(1);});
