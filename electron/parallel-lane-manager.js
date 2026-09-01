const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { git, gitInput } = require('./worktree-manager');

function nowIso(){ return new Date().toISOString(); }
function makeId(prefix='lane_bundle'){ return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`; }
function safeName(s){ return String(s||'').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,96); }
function normPath(p=''){ return String(p||'').replace(/\\/g,'/').replace(/^\.\//,''); }

function parseUnifiedPatch(text=''){
  const files=[];
  let current=null;
  for(const line of String(text||'').split(/\r?\n/)){
    const diff=line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if(diff){
      current={oldPath:normPath(diff[1]),path:normPath(diff[2]),operation:'modify',hunks:[],binary:false};
      files.push(current); continue;
    }
    if(!current)continue;
    if(/^new file mode /.test(line)){current.operation='add';continue;}
    if(/^deleted file mode /.test(line)){current.operation='delete';continue;}
    if(/^rename from /.test(line)){current.operation='rename';current.oldPath=normPath(line.slice(12));continue;}
    if(/^rename to /.test(line)){current.path=normPath(line.slice(10));continue;}
    if(/^Binary files /.test(line) || /^GIT binary patch/.test(line)){current.binary=true;continue;}
    const h=line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if(h){
      const oldStart=Number(h[1]), oldCount=h[2]===undefined?1:Number(h[2]);
      const newStart=Number(h[3]), newCount=h[4]===undefined?1:Number(h[4]);
      current.hunks.push({oldStart,oldCount,newStart,newCount,oldEnd:oldStart+Math.max(0,oldCount-1),newEnd:newStart+Math.max(0,newCount-1)});
    }
  }
  return files;
}

function rangesConflict(a,b){
  // Insertions (oldCount=0) are treated as a point on the base file.
  const a0=a.oldCount===0?a.oldStart:a.oldStart, a1=a.oldCount===0?a.oldStart:a.oldEnd;
  const b0=b.oldCount===0?b.oldStart:b.oldStart, b1=b.oldCount===0?b.oldStart:b.oldEnd;
  return Math.max(a0,b0) <= Math.min(a1,b1);
}

function analyzePatchConflict(aText,bText){
  const aFiles=parseUnifiedPatch(aText), bFiles=parseUnifiedPatch(bText);
  const conflicts=[]; const shared=[]; const locks=[];
  const bBy=new Map();
  for(const f of bFiles){ for(const p of new Set([f.path,f.oldPath].filter(Boolean))) { const xs=bBy.get(p)||[];xs.push(f);bBy.set(p,xs); } }
  for(const af of aFiles){
    const candidates=new Set();
    for(const p of [af.path,af.oldPath].filter(Boolean)){ for(const x of bBy.get(p)||[])candidates.add(x); }
    for(const bf of candidates){
      const file=af.path||af.oldPath||bf.path||bf.oldPath; shared.push(file);
      const structural=af.binary||bf.binary||af.operation!=='modify'||bf.operation!=='modify'||!af.hunks.length||!bf.hunks.length;
      if(structural){ conflicts.push({file,type:'file',reason:`${af.operation}/${bf.operation}${af.binary||bf.binary?' binary':''}`.trim()}); continue; }
      for(const ah of af.hunks){
        locks.push({file,start:ah.oldStart,end:ah.oldEnd,source:'A'});
        for(const bh of bf.hunks){
          if(rangesConflict(ah,bh))conflicts.push({file,type:'region',a:{start:ah.oldStart,end:ah.oldEnd},b:{start:bh.oldStart,end:bh.oldEnd},reason:'overlapping base-file hunks'});
        }
      }
      for(const bh of bf.hunks)locks.push({file,start:bh.oldStart,end:bh.oldEnd,source:'B'});
    }
  }
  return {conflict:conflicts.length>0,conflicts,sharedFiles:[...new Set(shared)],regionLocks:locks};
}

class ParallelLaneManager {
  constructor({baseDir,worktreeManager,onEvent=()=>{},retention=30,maxBundleBytes=64*1024*1024}={}){
    if(!worktreeManager)throw new Error('ParallelLaneManager requires WorktreeManager.');
    this.baseDir=path.resolve(baseDir||path.join(process.cwd(),'.abdulkarem-lanes'));
    this.bundleDir=path.join(this.baseDir,'bundles');
    this.integrationDir=path.join(this.baseDir,'integrations');
    this.worktreeManager=worktreeManager;
    this.onEvent=onEvent;
    this.retention=Math.max(5,Number(retention)||30);
    this.maxBundleBytes=Math.max(1024*1024,Number(maxBundleBytes)||64*1024*1024);
    this.activeBundles=new Map();
    this.recent=[];
  }

  async init(){ await fsp.mkdir(this.bundleDir,{recursive:true}); await fsp.mkdir(this.integrationDir,{recursive:true}); await this.recoverStale(); return this.status(); }
  manifestPath(id){ return path.join(this.bundleDir,`${safeName(id)}.json`); }
  patchPath(id){ return path.join(this.bundleDir,`${safeName(id)}.patch`); }
  integrationPath(id){ return path.join(this.integrationDir,safeName(id)); }
  async writeManifest(m){ m.updatedAt=nowIso(); const p=this.manifestPath(m.id),tmp=`${p}.tmp`; await fsp.mkdir(path.dirname(p),{recursive:true}); await fsp.writeFile(tmp,JSON.stringify(m,null,2),'utf8'); try{await fsp.rename(tmp,p);}catch{await fsp.copyFile(tmp,p);await fsp.rm(tmp,{force:true}).catch(()=>{});} this.recent.push(this.public(m)); if(this.recent.length>100)this.recent=this.recent.slice(-100); }
  async readManifest(id){ return JSON.parse(await fsp.readFile(this.manifestPath(id),'utf8')); }

  async prepareLanes(workspace,count=2,metadata={}){
    const n=Math.max(1,Math.min(4,Number(count)||2)); const lanes=[];
    try{
      for(let i=0;i<n;i++){
        const lane=await this.worktreeManager.prepare(workspace,{...metadata,laneIndex:i+1,laneCount:n,parallelLane:true});
        if(!lane?.success)throw Object.assign(new Error(lane?.reason||lane?.error||'lane prepare failed'),{detail:lane});
        lanes.push(lane);
      }
      this.onEvent('Parallel Coding Lanes',`${lanes.length} isolated lane(s) ready`,'done','lanes');
      return {success:true,lanes};
    }catch(e){
      for(const lane of lanes){try{await this.worktreeManager.abort(lane.id,'Parallel lane preparation failed.');}catch{}}
      return {success:false,error:e.message||String(e),detail:e.detail||null,lanes:[]};
    }
  }

  async patchText(id){ try{return await fsp.readFile(this.worktreeManager.patchPath(id),'utf8');}catch{return '';} }

  async planMerge(ids=[]){
    const laneIds=[...new Set((ids||[]).filter(Boolean))];
    const rows=[];
    for(const id of laneIds){ const m=await this.worktreeManager.readManifest(id); if(m.status!=='PATCH_READY')throw new Error(`Lane ${id} is ${m.status}; PATCH_READY required.`); rows.push(m); }
    const conflicts=[]; const pairs=[]; const regionLocks=[];
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
      const a=rows[i],b=rows[j]; const r=analyzePatchConflict(await this.patchText(a.id),await this.patchText(b.id));
      pairs.push({a:a.id,b:b.id,conflict:r.conflict,sharedFiles:r.sharedFiles,conflicts:r.conflicts});
      regionLocks.push(...r.regionLocks.map(x=>({...x,laneA:a.id,laneB:b.id})));
      if(r.conflict)conflicts.push({a:a.id,b:b.id,details:r.conflicts});
    }
    const sameBase=rows.every(x=>x.baseHead===rows[0]?.baseHead && path.resolve(x.originalWorkspace)===path.resolve(rows[0]?.originalWorkspace));
    return {success:true,laneIds,sameBase,mergeable:sameBase&&conflicts.length===0,conflicts,pairs,regionLocks};
  }

  async prepareBundle(ids=[],metadata={}){
    const plan=await this.planMerge(ids);
    if(!plan.sameBase){ const e=new Error('Lane bundle must share the same base HEAD and original workspace.');e.code='LANE_BASE_MISMATCH';throw e; }
    if(plan.conflicts.length){ const e=new Error(`Patch conflict detected between ${plan.conflicts.length} lane pair(s).`);e.code='LANE_PATCH_CONFLICT';e.conflicts=plan.conflicts;throw e; }
    const manifests=[]; for(const id of plan.laneIds)manifests.push(await this.worktreeManager.readManifest(id));
    if(!manifests.length)throw new Error('No lane patches selected.');
    const first=manifests[0]; const safety=await this.worktreeManager.originalStillSafe(first);
    if(!safety.safe){const e=new Error(`Original workspace changed before lane integration: ${safety.reason}`);e.code='LANE_ORIGINAL_CHANGED';e.detail=safety;throw e;}
    const id=makeId(); const integrationRoot=this.integrationPath(id);
    await fsp.rm(integrationRoot,{recursive:true,force:true}).catch(()=>{});
    await git(first.repoTop,['worktree','add','--detach',integrationRoot,first.baseHead],{timeoutMs:120000});
    const integrationWorkspace=first.workspaceRel ? path.join(integrationRoot,first.workspaceRel) : integrationRoot;
    const runtimeLinks=await this.worktreeManager.linkRuntimeDependencies(first.originalWorkspace,integrationWorkspace,first.repoTop,integrationRoot);
    const applied=[];
    try{
      for(const lane of manifests){
        const patch=await this.patchText(lane.id);
        if(!patch){applied.push({id:lane.id,bytes:0});continue;}
        await gitInput(integrationRoot,['apply','--check','--binary','--whitespace=nowarn','-'],patch,{timeoutMs:120000});
        await gitInput(integrationRoot,['apply','--binary','--whitespace=nowarn','-'],patch,{timeoutMs:120000});
        applied.push({id:lane.id,bytes:Buffer.byteLength(patch,'utf8')});
      }
    }catch(e){
      await this.removeIntegration({repoTop:first.repoTop,integrationRoot,runtimeLinks}).catch(()=>{});
      e.code=e.code||'LANE_APPLY_CONFLICT'; throw e;
    }
    const m={id,status:'VERIFYING',createdAt:nowIso(),updatedAt:nowIso(),metadata,originalWorkspace:first.originalWorkspace,repoTop:first.repoTop,workspaceRel:first.workspaceRel||'',baseHead:first.baseHead,integrationRoot,integrationWorkspace,runtimeLinks,laneIds:plan.laneIds,plan,applied,patch:null,verification:null,appliedAt:null,committedAt:null,rolledBackAt:null,reason:''};
    await this.writeManifest(m);this.activeBundles.set(id,m.originalWorkspace);
    this.onEvent('Lane Merge Queue',`${id} · ${plan.laneIds.length} lane patches applied in integration worktree`,'running','lanes');
    return this.public(m);
  }

  async sealBundle(id,verification=null){
    const m=await this.readManifest(id); if(m.status!=='VERIFYING')throw new Error(`Bundle ${id} is ${m.status}; VERIFYING required.`);
    await this.removeRuntimeLinks(m);
    await git(m.integrationRoot,['add','-A'],{timeoutMs:60000});
    const nameStatus=(await git(m.integrationRoot,['diff','--cached','--name-status','--find-renames','HEAD'],{timeoutMs:60000})).stdout.trim();
    const patch=(await git(m.integrationRoot,['diff','--cached','--binary','--full-index','--no-ext-diff','HEAD'],{timeoutMs:120000})).stdout;
    await git(m.integrationRoot,['reset','--mixed','HEAD'],{timeoutMs:60000}).catch(()=>{});
    const bytes=Buffer.byteLength(patch,'utf8'); if(bytes>this.maxBundleBytes){const e=new Error(`Lane bundle exceeds ${Math.round(this.maxBundleBytes/1024/1024)} MB.`);e.code='LANE_BUNDLE_LIMIT';throw e;}
    await fsp.writeFile(this.patchPath(id),patch,'utf8');
    const files=nameStatus?nameStatus.split(/\r?\n/).filter(Boolean).map(line=>{const p=line.split('\t');return {status:p[0],path:p[p.length-1]};}):[];
    m.patch={createdAt:nowIso(),bytes,files,nameStatus,empty:bytes===0};m.verification=verification||null;m.status='BUNDLE_READY';await this.writeManifest(m);
    return this.public(m);
  }

  async previewBundle(id,maxChars=24000){const m=await this.readManifest(id);let text='';try{text=await fsp.readFile(this.patchPath(id),'utf8');}catch{}return {success:true,id,status:m.status,patch:m.patch||null,text:text.slice(0,Math.max(1000,Number(maxChars)||24000)),truncated:text.length>maxChars,plan:m.plan};}

  async applyBundle(id){
    const m=await this.readManifest(id); if(m.status!=='BUNDLE_READY')throw new Error(`Bundle ${id} is ${m.status}; BUNDLE_READY required.`);
    const lane=await this.worktreeManager.readManifest(m.laneIds[0]); const safety=await this.worktreeManager.originalStillSafe(lane);
    if(!safety.safe){const e=new Error(`Original workspace changed before bundle merge: ${safety.reason}`);e.code='LANE_ORIGINAL_CHANGED';e.detail=safety;throw e;}
    const patch=await fsp.readFile(this.patchPath(id),'utf8');
    if(patch){await gitInput(m.repoTop,['apply','--check','--binary','--whitespace=nowarn','-'],patch,{timeoutMs:120000});await gitInput(m.repoTop,['apply','--binary','--whitespace=nowarn','-'],patch,{timeoutMs:120000});}
    m.status='APPLIED';m.appliedAt=nowIso();await this.writeManifest(m);this.onEvent('Lane Merge Queue',`${id} · combined verified patch applied to original workspace`,'done','lanes');return this.public(m);
  }

  async markCommitted(id,metadata={}){const m=await this.readManifest(id);m.status='COMMITTED';m.committedAt=nowIso();m.commitMetadata=metadata;await this.writeManifest(m);for(const laneId of m.laneIds){try{const l=await this.worktreeManager.readManifest(laneId);l.status='INTEGRATED';l.mergedAt=nowIso();l.integrationBundle=id;await this.worktreeManager.writeManifest(l);}catch{}}await this.cleanup(id,{keepRecord:true});return this.public(await this.readManifest(id));}
  async markRolledBack(id,reason='Lane bundle rolled back by host verification.'){const m=await this.readManifest(id);m.status='ROLLED_BACK';m.rolledBackAt=nowIso();m.reason=String(reason||'');await this.writeManifest(m);for(const laneId of m.laneIds){try{await this.worktreeManager.abort(laneId,`Bundle ${id} rolled back: ${reason}`);}catch{}}await this.cleanup(id,{keepRecord:true});return this.public(await this.readManifest(id));}
  async abortBundle(id,reason='Lane bundle aborted.'){let m;try{m=await this.readManifest(id);}catch{return {success:false,error:'Bundle not found.'};}m.status='ABORTED';m.reason=String(reason||'');await this.writeManifest(m);for(const laneId of m.laneIds||[]){try{await this.worktreeManager.abort(laneId,reason);}catch{}}await this.cleanup(id,{keepRecord:true});return this.public(await this.readManifest(id));}

  async removeRuntimeLinks(m){for(const link of (m.runtimeLinks||[])){try{const st=await fsp.lstat(link.target);if(st.isSymbolicLink())await fsp.unlink(link.target);}catch{}}}
  async removeIntegration(m){await this.removeRuntimeLinks(m);try{await git(m.repoTop,['worktree','remove','--force',m.integrationRoot],{timeoutMs:120000});}catch{await fsp.rm(m.integrationRoot,{recursive:true,force:true}).catch(()=>{});}await git(m.repoTop,['worktree','prune'],{timeoutMs:30000}).catch(()=>{});await fsp.rm(m.integrationRoot,{recursive:true,force:true}).catch(()=>{});}
  async cleanup(id,{keepRecord=true}={}){let m;try{m=await this.readManifest(id);}catch{return {success:false,error:'Bundle not found.'};}await this.removeIntegration(m).catch(()=>{});for(const laneId of m.laneIds||[]){try{await this.worktreeManager.cleanup(laneId,{keepRecord:true});}catch{}}this.activeBundles.delete(id);if(!keepRecord){await fsp.rm(this.manifestPath(id),{force:true}).catch(()=>{});await fsp.rm(this.patchPath(id),{force:true}).catch(()=>{});}await this.pruneRecords();return this.public(m);}

  async recoverStale(){let names=[];try{names=(await fsp.readdir(this.bundleDir)).filter(x=>x.endsWith('.json'));}catch{return [];}const recovered=[];for(const n of names){try{const m=JSON.parse(await fsp.readFile(path.join(this.bundleDir,n),'utf8'));if(['VERIFYING','BUNDLE_READY','APPLIED'].includes(m.status)){m.status='ABORTED';m.reason='Recovered stale parallel-lane bundle after application restart. No automatic merge/commit was performed.';await this.writeManifest(m);await this.removeIntegration(m).catch(()=>{});recovered.push(this.public(m));}}catch{}}await this.pruneRecords();return recovered;}
  async pruneRecords(){let rows=[];try{for(const n of await fsp.readdir(this.bundleDir)){if(!n.endsWith('.json'))continue;try{rows.push(JSON.parse(await fsp.readFile(path.join(this.bundleDir,n),'utf8')));}catch{}}}catch{return;}rows.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));for(const old of rows.slice(this.retention)){if(['VERIFYING','BUNDLE_READY','APPLIED'].includes(old.status))continue;await fsp.rm(this.manifestPath(old.id),{force:true}).catch(()=>{});await fsp.rm(this.patchPath(old.id),{force:true}).catch(()=>{});}}
  async list(){let rows=[];try{for(const n of await fsp.readdir(this.bundleDir)){if(!n.endsWith('.json'))continue;try{rows.push(this.public(JSON.parse(await fsp.readFile(path.join(this.bundleDir,n),'utf8'))));}catch{}}}catch{}rows.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));return {success:true,version:'2.5.1',bundles:rows.slice(0,50),active:[...this.activeBundles.entries()].map(([id,workspace])=>({id,workspace})),limits:{retention:this.retention,maxBundleBytes:this.maxBundleBytes}};}
  status(){return {success:true,version:'2.5.1',active:[...this.activeBundles.entries()].map(([id,workspace])=>({id,workspace})),recent:this.recent.slice(-20).reverse(),limits:{retention:this.retention,maxBundleBytes:this.maxBundleBytes}};}
  public(m){return {success:true,id:m.id,status:m.status,createdAt:m.createdAt,updatedAt:m.updatedAt,originalWorkspace:m.originalWorkspace,repoTop:m.repoTop,baseHead:m.baseHead,integrationWorkspace:m.integrationWorkspace,laneIds:m.laneIds||[],plan:m.plan||null,applied:m.applied||[],patch:m.patch||null,verification:m.verification||null,appliedAt:m.appliedAt||null,committedAt:m.committedAt||null,rolledBackAt:m.rolledBackAt||null,reason:m.reason||'',metadata:m.metadata||{}};}
}

module.exports={ParallelLaneManager,parseUnifiedPatch,analyzePatchConflict,rangesConflict};
