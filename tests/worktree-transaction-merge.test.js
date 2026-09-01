const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const assert=require('assert');
const {normalizeEol}=require('./test-utils');
const {WorktreeManager,git}=require('../electron/worktree-manager');
const {TransactionManager}=require('../electron/transaction-manager');

(async()=>{
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'abdx-wtmerge-repo-'));
  const state=await fsp.mkdtemp(path.join(os.tmpdir(),'abdx-wtmerge-state-'));
  await git(root,['init']);
  await git(root,['config','user.email','test@abdulkarem.local']);
  await git(root,['config','user.name','ABDULKAREM AI X Test']);
  await git(root,['config','core.autocrlf','true']);
  await git(root,['config','core.eol','crlf']);
  await fsp.writeFile(path.join(root,'app.txt'),'stable\n','utf8');
  await git(root,['add','-A']);
  await git(root,['commit','-m','initial']);
  const wm=new WorktreeManager({baseDir:state,requireClean:true,maxPatchBytes:4*1024*1024});
  const txm=new TransactionManager({maxFiles:100,maxBytes:10*1024*1024});
  await wm.init();

  // Simulate verified sandbox patch followed by failed post-merge project check.
  const s1=await wm.prepare(root,{reason:'post merge rollback'});
  await fsp.writeFile(path.join(s1.sandboxWorkspace,'app.txt'),'sandbox change\n','utf8');
  await wm.exportPatch(s1.id,{success:true,gate:'sandbox-check'});
  const mergeTx=await txm.begin(root,{source:'verified-worktree-merge'});
  await wm.applyPatch(s1.id);
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'app.txt'),'utf8')),normalizeEol('sandbox change\n'));
  // Host verification says FAIL → original transaction restores baseline.
  await txm.rollback(root,mergeTx.id,'simulated post-merge failure');
  await wm.markMergeRolledBack(s1.id,'simulated post-merge failure');
  await wm.cleanup(s1.id,{keepRecord:true});
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'app.txt'),'utf8')),normalizeEol('stable\n'));

  // Simulate verified sandbox patch followed by successful post-merge check.
  const s2=await wm.prepare(root,{reason:'post merge commit'});
  await fsp.writeFile(path.join(s2.sandboxWorkspace,'app.txt'),'verified merged\n','utf8');
  await wm.exportPatch(s2.id,{success:true,gate:'sandbox-check'});
  const mergeTx2=await txm.begin(root,{source:'verified-worktree-merge'});
  await wm.applyPatch(s2.id);
  await txm.commit(root,mergeTx2.id,{success:true,gate:'post-merge-project-check'});
  await wm.cleanup(s2.id,{keepRecord:true});
  assert.equal(normalizeEol(await fsp.readFile(path.join(root,'app.txt'),'utf8')),normalizeEol('verified merged\n'));

  await fsp.rm(root,{recursive:true,force:true});
  await fsp.rm(state,{recursive:true,force:true});
  console.log('worktree-transaction-merge.test.js PASS');
})().catch(e=>{console.error(e);process.exit(1);});
